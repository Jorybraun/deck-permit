import type { DeckDesign, DeckPlatform, DeckStair, PointMm } from '../deckDesign';
import { terrainElevationAt, type SiteModel, type TerrainVerificationStatus } from '../siteModel';
import type { GuardAssembly, LifeSafetyAssessment, PlatformEdgeLifeSafetyAssessment, StairLifeSafetyAssessment } from './types';

const GUARD_TRIGGER_DROP_MM = 600;
const TALL_GUARD_TRIGGER_DROP_MM = 1800;
const CLIMBABILITY_TRIGGER_DROP_MM = 4200;
const ADJACENT_SURFACE_SEARCH_MM = 1200;

interface SurfaceSample {
  elevationMm: number;
  basis: GuardAssembly['gradeBasis'];
  verificationStatus: TerrainVerificationStatus;
}

/**
 * Deterministic Part 9 life-safety screen for an exterior deck serving one dwelling.
 * It locates requirements and unresolved assemblies; it does not certify a product or anchorage.
 */
export function assessDeckLifeSafety(design: DeckDesign, site: SiteModel): LifeSafetyAssessment {
  const hostedStairEdgeIds = new Set(design.stairs.flatMap((stair) => [stair.fromEdgeId, stair.toEdgeId].filter((edgeId): edgeId is string => Boolean(edgeId))));
  const platformEdges = design.platforms.flatMap((platform) => assessPlatformEdges(platform, design, site, hostedStairEdgeIds));
  const stairs = design.stairs.map((stair) => assessStair(stair, design, site));
  const statuses = [...platformEdges.map((item) => item.status), ...stairs.map((item) => item.status)];
  return {
    schema: 'life-safety-screen/v1',
    occupancyAssumption: 'single-dwelling-exterior-deck',
    adjacentSurfaceSearchMm: ADJACENT_SURFACE_SEARCH_MM,
    platformEdges,
    stairs,
    status: statuses.includes('blocked') ? 'blocked' : statuses.includes('review') ? 'review' : 'pass',
    limitations: [
      'The 1.2 m adjacent-surface screen uses the modeled platform polygons and recorded/interpolated project grade; field grade and accessible adjacent surfaces must be verified.',
      'Generated guard lines are design intent only. Guard loads, posts, blocking, anchorage, openings, climbability, glazing, corrosion resistance, and proprietary product compliance remain unresolved.',
      'Stair handrail intent does not resolve graspability, continuity, termination, clearances, attachment, guard infill, or the relationship between a handrail and a required stair guard.',
      'The screen assumes an exterior stair and deck serving one dwelling. A different occupancy or use requires a new code analysis.',
    ],
  };
}

export function guardAssembliesFromLifeSafety(design: DeckDesign, assessment: LifeSafetyAssessment): GuardAssembly[] {
  return assessment.platformEdges.flatMap((item) => {
    if (!['generated-required', 'owner-selected-optional'].includes(item.guardIntent) || item.requiredHeightMm === null) return [];
    const platform = design.platforms.find((candidate) => candidate.id === item.platformId);
    const edgeIndex = platform?.edges.findIndex((edge) => edge.id === item.edgeId) ?? -1;
    if (!platform || edgeIndex < 0) return [];
    const start = platform.boundary.vertices[edgeIndex];
    const end = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
    return [{
      id: `${platform.id}-G${edgeIndex + 1}`,
      platformId: platform.id,
      edgeId: item.edgeId,
      startMm: [start.xMm, start.yMm] as PointMm,
      endMm: [end.xMm, end.yMm] as PointMm,
      heightMm: item.requiredHeightMm,
      maximumDropMm: item.maximumDropMm,
      requirement: item.guardRequired ? 'code-required' as const : 'owner-selected' as const,
      openingLimitMm: 100 as const,
      climbabilityReviewRequired: item.climbabilityReviewRequired,
      gradeBasis: item.gradeBasis,
      system: platform.finish.guardSystem,
      status: 'review-required' as const,
    }];
  });
}

function assessPlatformEdges(platform: DeckPlatform, design: DeckDesign, site: SiteModel, hostedStairEdgeIds: Set<string>): PlatformEdgeLifeSafetyAssessment[] {
  const outward = polygonOutwardSign(platform);
  return platform.edges.map((edge, edgeIndex) => {
    const startVertex = platform.boundary.vertices[edgeIndex];
    const endVertex = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
    const start: PointMm = [startVertex.xMm, startVertex.yMm];
    const end: PointMm = [endVertex.xMm, endVertex.yMm];
    const dx = end[0] - start[0]; const dy = end[1] - start[1]; const length = Math.max(1, Math.hypot(dx, dy));
    const normal: PointMm = outward > 0 ? [dy / length, -dx / length] : [-dy / length, dx / length];
    const samples: SurfaceSample[] = [];
    for (const t of [0, .25, .5, .75, 1]) {
      for (const offset of [0, 600, ADJACENT_SURFACE_SEARCH_MM]) {
        const point: PointMm = [start[0] + dx * t + normal[0] * offset, start[1] + dy * t + normal[1] * offset];
        samples.push(adjacentSurfaceAt(point, platform.elevationMm, platform.id, design, site));
      }
    }
    const maximumDropMm = Math.max(0, Math.round(platform.elevationMm - Math.min(...samples.map((sample) => sample.elevationMm))));
    const guardRequired = maximumDropMm > GUARD_TRIGGER_DROP_MM;
    const requiredHeightMm = guardRequired || edge.role === 'guard' ? (maximumDropMm > TALL_GUARD_TRIGGER_DROP_MM ? 1070 : 900) : null;
    const gradeBasis = combinedBasis(samples.map((sample) => sample.basis));
    const gradeVerificationStatus = weakestVerification(samples.map((sample) => sample.verificationStatus));
    const effectiveRole = hostedStairEdgeIds.has(edge.id) ? 'stair' as const : edge.role;
    const protectedRole = effectiveRole === 'house' || effectiveRole === 'shared' || effectiveRole === 'stair';
    const guardIntent: PlatformEdgeLifeSafetyAssessment['guardIntent'] = effectiveRole === 'house' ? 'protected-by-wall'
      : effectiveRole === 'shared' ? 'shared-edge'
        : effectiveRole === 'stair' ? 'stair-opening'
          : guardRequired ? 'generated-required'
            : edge.role === 'guard' ? 'owner-selected-optional' : 'not-required';
    const status: PlatformEdgeLifeSafetyAssessment['status'] = effectiveRole === 'shared' && guardRequired ? 'review'
      : protectedRole ? 'pass'
        : guardRequired || edge.role === 'guard' ? 'review' : 'pass';
    const basis = effectiveRole === 'house' ? 'Edge is modeled as protected by the existing house wall; wall continuity and openings remain subject to the existing-condition record.'
      : effectiveRole === 'stair' ? 'Leading edge is assigned to a hosted stair opening; stair-side protection is assessed with that flight.'
        : effectiveRole === 'shared' ? `${maximumDropMm} mm maximum modeled drop; verify the shared edge is continuously protected by the adjoining walking surface and transitions.`
          : guardRequired ? `${maximumDropMm} mm maximum modeled drop within 1.2 m exceeds the 600 mm guard trigger.`
            : edge.role === 'guard' ? `${maximumDropMm} mm maximum modeled drop; owner-selected optional guard intent retained.`
              : `${maximumDropMm} mm maximum modeled drop within 1.2 m does not exceed the 600 mm guard trigger.`;
    return {
      id: `LS-${platform.id}-${edge.id}`,
      platformId: platform.id,
      edgeId: edge.id,
      edgeRole: effectiveRole,
      maximumDropMm,
      gradeBasis,
      gradeVerificationStatus,
      guardRequired,
      guardIntent,
      requiredHeightMm,
      openingLimitMm: requiredHeightMm === null ? null : 100,
      climbabilityReviewRequired: maximumDropMm > CLIMBABILITY_TRIGGER_DROP_MM,
      status,
      basis,
    };
  });
}

function assessStair(stair: DeckStair, design: DeckDesign, site: SiteModel): StairLifeSafetyAssessment {
  const startElevation = endpointElevation(stair.from, design);
  const endElevation = endpointElevation(stair.to, design);
  const dx = stair.endMm[0] - stair.startMm[0]; const dy = stair.endMm[1] - stair.startMm[1];
  const length = Math.max(1, Math.hypot(dx, dy)); const lateral: PointMm = [-dy / length, dx / length];
  const sideDrops = { left: 0, right: 0 };
  for (const t of [.2, .4, .6, .8]) {
    const walkingElevation = startElevation + (endElevation - startElevation) * t;
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? -1 : 1;
      const point: PointMm = [stair.startMm[0] + dx * t + lateral[0] * sign * (stair.widthMm / 2 + 50), stair.startMm[1] + dy * t + lateral[1] * sign * (stair.widthMm / 2 + 50)];
      const adjacent = adjacentSurfaceAt(point, walkingElevation, '', design, site);
      sideDrops[side] = Math.max(sideDrops[side], Math.round(walkingElevation - adjacent.elevationMm));
    }
  }
  const guardRequiredSides = (['left', 'right'] as const).filter((side) => sideDrops[side] > GUARD_TRIGGER_DROP_MM);
  const handrailRequired = stair.riserCount > 3;
  const handrailIntentCount = stair.handrailSides === 'both' ? 2 : stair.handrailSides === 'none' ? 0 : 1;
  const missingRequiredHandrail = handrailRequired && handrailIntentCount < 1;
  const status: StairLifeSafetyAssessment['status'] = missingRequiredHandrail ? 'blocked' : guardRequiredSides.length || handrailIntentCount ? 'review' : 'pass';
  return {
    id: `LS-${stair.id}`,
    stairId: stair.id,
    riserCount: stair.riserCount,
    widthMm: stair.widthMm,
    maximumSideDropMm: Math.max(sideDrops.left, sideDrops.right),
    guardRequiredSides,
    handrailRequired,
    minimumHandrailCount: handrailRequired ? 1 : 0,
    handrailIntentCount,
    handrailHeightRangeMm: handrailRequired || handrailIntentCount ? [865, 1070] : null,
    continuityResolved: false,
    guardAssemblyResolved: false,
    status,
    basis: missingRequiredHandrail
      ? `Exterior stair has ${stair.riserCount} risers and no handrail intent; at least one handrail is required under the single-dwelling assumption.`
      : `${stair.riserCount} exterior risers; ${handrailRequired ? 'minimum one handrail required' : 'required handrail threshold not exceeded'}; ${guardRequiredSides.length ? `guard protection screened on ${guardRequiredSides.join(' and ')} side(s)` : 'no stair-side guard trigger found in the modeled surface screen'}.`,
  };
}

function adjacentSurfaceAt(point: PointMm, walkingElevationMm: number, sourcePlatformId: string, design: DeckDesign, site: SiteModel): SurfaceSample {
  const platforms = design.platforms.filter((platform) => platform.id !== sourcePlatformId && pointInBoundary(point, platform));
  if (platforms.some((platform) => platform.elevationMm >= walkingElevationMm - 25)) return { elevationMm: walkingElevationMm, basis: 'modeled-platform', verificationStatus: 'reference' };
  const lower = platforms.filter((platform) => platform.elevationMm < walkingElevationMm).sort((a, b) => b.elevationMm - a.elevationMm)[0];
  if (lower) return { elevationMm: lower.elevationMm, basis: 'modeled-platform', verificationStatus: 'reference' };
  const terrain = terrainElevationAt(site.terrain, point);
  return { elevationMm: terrain.elevationMm, basis: terrain.method, verificationStatus: terrain.verificationStatus };
}

function polygonOutwardSign(platform: DeckPlatform): 1 | -1 {
  const area2 = platform.boundary.vertices.reduce((sum, vertex, index) => {
    const next = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
    return sum + vertex.xMm * next.yMm - next.xMm * vertex.yMm;
  }, 0);
  return area2 >= 0 ? 1 : -1;
}

function pointInBoundary(point: PointMm, platform: DeckPlatform): boolean {
  const vertices = platform.boundary.vertices; let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]; const b = vertices[j];
    const intersects = (a.yMm > point[1]) !== (b.yMm > point[1]) && point[0] < (b.xMm - a.xMm) * (point[1] - a.yMm) / ((b.yMm - a.yMm) || 1) + a.xMm;
    if (intersects) inside = !inside;
  }
  return inside;
}

function endpointElevation(endpoint: DeckStair['from'], design: DeckDesign): number {
  return endpoint.kind === 'terrain' ? endpoint.elevationMm : design.platforms.find((platform) => platform.id === endpoint.platformId)?.elevationMm || 0;
}

function combinedBasis(values: GuardAssembly['gradeBasis'][]): GuardAssembly['gradeBasis'] {
  const unique = [...new Set(values)]; return unique.length === 1 ? unique[0] : 'mixed';
}

function weakestVerification(values: TerrainVerificationStatus[]): TerrainVerificationStatus {
  if (values.includes('reference')) return 'reference';
  if (values.includes('recorded')) return 'recorded';
  return 'professional-verified';
}
