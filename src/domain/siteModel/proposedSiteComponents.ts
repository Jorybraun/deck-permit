import type { DeckDesign, DeckStair, PointMm } from '../deckDesign';
import type { FramingDesign } from '../framingDesign';

export type ProposedSiteComponentKind = 'platform' | 'stair-flight' | 'grade-landing' | 'footing';

export interface ProposedSiteComponent {
  id: string;
  sourceId: string;
  kind: ProposedSiteComponentKind;
  polygon: PointMm[];
  countsTowardReferenceCoverage: boolean;
}

/**
 * Converts every modeled horizontal site extent into polygons used by zoning,
 * clearance dimensions, and permit drawings. Footings are screened for
 * setbacks but are deliberately excluded from the reference lot-coverage sum.
 */
export function deriveProposedSiteComponents(design: DeckDesign, framing?: FramingDesign | null): ProposedSiteComponent[] {
  const platforms = design.platforms.map((platform): ProposedSiteComponent => ({
    id: platform.id,
    sourceId: platform.id,
    kind: 'platform',
    polygon: platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm]),
    countsTowardReferenceCoverage: true,
  }));
  const stairs = design.stairs.flatMap(stairSiteComponents);
  const footings = (framing?.footings || []).map((footing): ProposedSiteComponent => ({
    id: footing.id,
    sourceId: footing.postId,
    kind: 'footing',
    polygon: rectangleAt(footing.centerMm, footing.widthMm, footing.lengthMm),
    countsTowardReferenceCoverage: false,
  }));
  return [...platforms, ...stairs, ...footings].filter((component) => component.polygon.length >= 3);
}

export function proposedSiteComponentLabel(component: Pick<ProposedSiteComponent, 'id' | 'kind'>): string {
  return `${component.id} ${component.kind.replace(/-/g, ' ')}`;
}

function stairSiteComponents(stair: DeckStair): ProposedSiteComponent[] {
  const vector = stairVector(stair);
  const flightEnd: PointMm = distance(stair.startMm, stair.endMm) > 1
    ? stair.endMm
    : [stair.startMm[0] + vector[0] * stair.totalRunMm, stair.startMm[1] + vector[1] * stair.totalRunMm];
  const flight: ProposedSiteComponent = {
    id: stair.id,
    sourceId: stair.id,
    kind: 'stair-flight',
    polygon: corridor(stair.startMm, flightEnd, stair.widthMm),
    countsTowardReferenceCoverage: true,
  };
  if (stair.to.kind !== 'terrain') return [flight];
  const landingEnd: PointMm = [flightEnd[0] + vector[0] * stair.landingDepthMm, flightEnd[1] + vector[1] * stair.landingDepthMm];
  return [flight, {
    id: `${stair.id}-GRADE-LANDING`,
    sourceId: stair.id,
    kind: 'grade-landing',
    polygon: corridor(flightEnd, landingEnd, stair.widthMm),
    countsTowardReferenceCoverage: true,
  }];
}

function stairVector(stair: DeckStair): PointMm {
  const dx = stair.endMm[0] - stair.startMm[0];
  const dy = stair.endMm[1] - stair.startMm[1];
  const length = Math.hypot(dx, dy);
  if (length > 1) return [dx / length, dy / length];
  const radians = stair.directionDeg * Math.PI / 180;
  return [Math.cos(radians), Math.sin(radians)];
}

function corridor(start: PointMm, end: PointMm, widthMm: number): PointMm[] {
  const dx = end[0] - start[0]; const dy = end[1] - start[1];
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length * widthMm / 2; const ny = dx / length * widthMm / 2;
  return [
    [Math.round(start[0] + nx), Math.round(start[1] + ny)],
    [Math.round(end[0] + nx), Math.round(end[1] + ny)],
    [Math.round(end[0] - nx), Math.round(end[1] - ny)],
    [Math.round(start[0] - nx), Math.round(start[1] - ny)],
  ];
}

function rectangleAt(center: PointMm, widthMm: number, lengthMm: number): PointMm[] {
  const halfWidth = widthMm / 2; const halfLength = lengthMm / 2;
  return [
    [Math.round(center[0] - halfWidth), Math.round(center[1] - halfLength)],
    [Math.round(center[0] + halfWidth), Math.round(center[1] - halfLength)],
    [Math.round(center[0] + halfWidth), Math.round(center[1] + halfLength)],
    [Math.round(center[0] - halfWidth), Math.round(center[1] + halfLength)],
  ];
}

function distance(first: PointMm, second: PointMm): number {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}
