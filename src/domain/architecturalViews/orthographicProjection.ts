import { assessClosedBoundary } from '../cad/makerCadKernel';
import type { DeckDesign, DeckPlatform, PointMm, VerticalEndpoint } from '../deckDesign';
import { selectPreliminarySections } from '../framingDesign/rules';
import { terrainElevationAt, type SiteModel } from '../siteModel';
import type {
  CreateOrthographicProjectionInput,
  OrthographicFooting,
  OrthographicGradePoint,
  OrthographicGuard,
  OrthographicHouseOpening,
  OrthographicPlatform,
  OrthographicPost,
  OrthographicProjection,
  OrthographicStair,
  OrthographicViewKey,
  ProjectionAxis,
} from './types';

export const ORTHOGRAPHIC_PROJECTION_SCHEMA = 'orthographic-projection/v1' as const;

export class OrthographicProjectionError extends Error {
  constructor(public readonly code: 'invalid-axis' | 'empty-geometry', message: string) {
    super(message);
    this.name = 'OrthographicProjectionError';
  }
}

/**
 * Derives one deterministic orthographic building model from canonical site, design, and framing data.
 * This module owns no state and has no UI, storage, browser, or provider dependencies.
 */
export function createOrthographicProjection(input: CreateOrthographicProjectionInput): OrthographicProjection {
  const axis = normalizedAxis(input.axis);
  const { design, site, framing } = input;
  const houseCorners: PointMm[] = [[0, 0], [site.designWall.lengthMm, 0], [site.designWall.lengthMm, -site.houseDepthMm], [0, -site.houseDepthMm]];
  const houseProjections = houseCorners.map((point) => projectPoint(point, axis));
  const house = {
    minimumProjectionMm: Math.min(...houseProjections),
    maximumProjectionMm: Math.max(...houseProjections),
    baseElevationMm: site.terrain.datum.elevationMm,
    topElevationMm: site.designWall.wallHeightMm,
    openings: projectedOpenings(site, axis),
  };
  const platforms = design.platforms.map((platform) => projectedPlatform(platform, input, axis));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const stairs = design.stairs.map((stair): OrthographicStair => ({
    id: stair.id,
    name: stair.name,
    startProjectionMm: projectPoint(stair.startMm, axis),
    endProjectionMm: projectPoint(stair.endMm, axis),
    startElevationMm: endpointElevation(design, stair.from, input.elevationOverrides),
    endElevationMm: endpointElevation(design, stair.to, input.elevationOverrides),
    riserCount: stair.riserCount,
    riserHeightMm: stair.riserHeightMm,
    treadDepthMm: stair.treadDepthMm,
    widthMm: stair.widthMm,
    handrailSides: stair.handrailSides,
    destinationLabel: endpointLabel(design, stair.to),
  }));
  const posts = (framing?.posts || []).map((post): OrthographicPost => {
    const platform = platformById.get(post.platformId);
    const grade = terrainElevationAt(site.terrain, post.pointMm).elevationMm;
    return {
      id: post.id,
      platformId: post.platformId,
      projectionMm: projectPoint(post.pointMm, axis),
      bottomElevationMm: grade,
      topElevationMm: platform ? platform.surfaceElevationMm - platform.deckingThicknessMm - platform.joistDepthMm - platform.beamDepthMm : grade + post.heightMm,
      section: post.section,
    };
  });
  const footings = (framing?.footings || []).map((footing): OrthographicFooting => ({
    id: footing.id,
    postId: footing.postId,
    projectionMm: projectPoint(footing.centerMm, axis),
    gradeElevationMm: terrainElevationAt(site.terrain, footing.centerMm).elevationMm,
    widthMm: footing.widthMm,
    lengthMm: footing.lengthMm,
  }));
  const guards = (framing?.guards || []).map((guard): OrthographicGuard => {
    const platform = platformById.get(guard.platformId);
    const first = projectPoint(guard.startMm, axis);
    const second = projectPoint(guard.endMm, axis);
    const baseElevationMm = platform?.surfaceElevationMm || 0;
    return {
      id: guard.id,
      platformId: guard.platformId,
      minimumProjectionMm: Math.min(first, second),
      maximumProjectionMm: Math.max(first, second),
      baseElevationMm,
      topElevationMm: baseElevationMm + guard.heightMm,
      system: guard.system,
    };
  });
  const horizontalValues = [
    house.minimumProjectionMm, house.maximumProjectionMm,
    ...platforms.flatMap((platform) => [platform.minimumProjectionMm, platform.maximumProjectionMm]),
    ...stairs.flatMap((stair) => [stair.startProjectionMm, stair.endProjectionMm]),
    ...posts.map((post) => post.projectionMm),
  ];
  if (!horizontalValues.length) throw new OrthographicProjectionError('empty-geometry', 'The project has no geometry to project.');
  const minimumProjectionMm = Math.min(...horizontalValues);
  const maximumProjectionMm = Math.max(...horizontalValues);
  const gradePoints = projectedGradePoints(site, axis, minimumProjectionMm, maximumProjectionMm);
  const verticalValues = [
    house.baseElevationMm, house.topElevationMm,
    ...gradePoints.map((point) => point.elevationMm),
    ...platforms.flatMap((platform) => [platform.localGradeElevationMm, platform.surfaceElevationMm - platform.deckingThicknessMm - platform.joistDepthMm - platform.beamDepthMm]),
    ...stairs.flatMap((stair) => [stair.startElevationMm, stair.endElevationMm, stair.handrailSides === 'none' ? stair.startElevationMm : stair.startElevationMm + 900, stair.handrailSides === 'none' ? stair.endElevationMm : stair.endElevationMm + 900]),
    ...guards.map((guard) => guard.topElevationMm),
  ];
  return {
    schema: ORTHOGRAPHIC_PROJECTION_SCHEMA,
    axis,
    minimumProjectionMm,
    maximumProjectionMm,
    minimumElevationMm: Math.min(...verticalValues),
    maximumElevationMm: Math.max(...verticalValues),
    house,
    platforms,
    stairs,
    posts,
    footings,
    guards,
    gradePoints,
  };
}

export function projectionAxisForView(viewKey: OrthographicViewKey, design: DeckDesign): ProjectionAxis {
  if (viewKey === 'house-wall') return [1, 0];
  if (viewKey === 'yard-section') return [0, 1];
  const [, platformId, indexValue] = viewKey.split(':');
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  const index = Number(indexValue);
  const start = platform?.boundary.vertices[index];
  const end = platform?.boundary.vertices[(index + 1) % (platform?.boundary.vertices.length || 1)];
  if (!start || !end) return [0, 1];
  return normalizedAxis([end.xMm - start.xMm, end.yMm - start.yMm]);
}

export function projectPoint(point: PointMm, axis: ProjectionAxis): number {
  return point[0] * axis[0] + point[1] * axis[1];
}

function projectedPlatform(platform: DeckPlatform, input: CreateOrthographicProjectionInput, axis: ProjectionAxis): OrthographicPlatform {
  const projections = platform.boundary.vertices.map((vertex) => projectPoint([vertex.xMm, vertex.yMm], axis));
  const center: PointMm = [
    platform.boundary.vertices.reduce((sum, vertex) => sum + vertex.xMm, 0) / Math.max(1, platform.boundary.vertices.length),
    platform.boundary.vertices.reduce((sum, vertex) => sum + vertex.yMm, 0) / Math.max(1, platform.boundary.vertices.length),
  ];
  const assessment = assessClosedBoundary(platform.boundary);
  const preliminary = selectPreliminarySections(Math.min(assessment.widthMm, assessment.depthMm), 'incised');
  const framingJoist = input.framing?.joists.find((member) => member.platformId === platform.id);
  const framingBeam = input.framing?.beams.find((member) => member.platformId === platform.id);
  const joistLabel = framingJoist?.section || preliminary.joistSection;
  const beamLabel = framingBeam?.section || preliminary.beamSection;
  return {
    id: platform.id,
    name: platform.name,
    purpose: platform.purpose,
    minimumProjectionMm: Math.min(...projections),
    maximumProjectionMm: Math.max(...projections),
    surfaceElevationMm: input.elevationOverrides?.[platform.id] ?? platform.elevationMm,
    localGradeElevationMm: terrainElevationAt(input.site.terrain, center).elevationMm,
    deckingThicknessMm: platform.finish.deckingThicknessMm,
    joistDepthMm: sectionDepth(joistLabel, 184),
    beamDepthMm: sectionDepth(beamLabel, 140),
    joistLabel,
    beamLabel,
    finishLabel: platform.finish.decking,
  };
}

function projectedOpenings(site: SiteModel, axis: ProjectionAxis): OrthographicHouseOpening[] {
  return site.designWall.openings.flatMap((opening) => {
    const first = projectPoint([opening.offsetMm, 0], axis);
    const second = projectPoint([opening.offsetMm + opening.widthMm, 0], axis);
    if (Math.abs(second - first) < 25) return [];
    return [{
      id: opening.id,
      kind: opening.kind,
      minimumProjectionMm: Math.min(first, second),
      maximumProjectionMm: Math.max(first, second),
      sillElevationMm: opening.sillHeightMm,
      headElevationMm: opening.sillHeightMm + (opening.heightMm ?? (opening.kind === 'door' ? 2100 : 1200)),
    }];
  });
}

function projectedGradePoints(site: SiteModel, axis: ProjectionAxis, minimum: number, maximum: number): OrthographicGradePoint[] {
  const observations = site.terrain.gradePoints
    .map((point): OrthographicGradePoint => ({ id: point.id, projectionMm: projectPoint([point.xMm, point.yMm], axis), elevationMm: point.elevationMm, observed: true }))
    .sort((left, right) => left.projectionMm - right.projectionMm);
  const endpoint = (id: string, projectionMm: number): OrthographicGradePoint => ({
    id,
    projectionMm,
    elevationMm: terrainElevationAt(site.terrain, [axis[0] * projectionMm, axis[1] * projectionMm]).elevationMm,
    observed: false,
  });
  return [endpoint('GRADE-START', minimum), ...observations, endpoint('GRADE-END', maximum)]
    .sort((left, right) => left.projectionMm - right.projectionMm)
    .filter((point, index, points) => index === 0 || point.observed || Math.abs(point.projectionMm - points[index - 1].projectionMm) > 1);
}

function endpointElevation(design: DeckDesign, endpoint: VerticalEndpoint, overrides?: Readonly<Record<string, number>>): number {
  if (endpoint.kind === 'terrain') return endpoint.elevationMm;
  return overrides?.[endpoint.platformId] ?? design.platforms.find((platform) => platform.id === endpoint.platformId)?.elevationMm ?? 0;
}

function endpointLabel(design: DeckDesign, endpoint: VerticalEndpoint): string {
  if (endpoint.kind === 'terrain') return 'YARD / GRADE';
  return design.platforms.find((platform) => platform.id === endpoint.platformId)?.name.toUpperCase() || endpoint.platformId;
}

function normalizedAxis(axis: ProjectionAxis): ProjectionAxis {
  const length = Math.hypot(axis[0], axis[1]);
  if (!Number.isFinite(length) || length < .0001) throw new OrthographicProjectionError('invalid-axis', 'Projection axis must have a finite, non-zero length.');
  return [axis[0] / length, axis[1] / length];
}

function sectionDepth(section: string, fallback: number): number {
  const values = [...section.matchAll(/×(\d+)/g)].map((match) => Number(match[1]));
  return values.length ? Math.max(...values) : fallback;
}
