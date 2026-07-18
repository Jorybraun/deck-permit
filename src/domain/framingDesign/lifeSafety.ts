import type { DeckDesign, DeckPlatform, DeckStair, PointMm } from '../deckDesign';
import { terrainElevationAt, type SiteModel, type TerrainVerificationStatus } from '../siteModel';
import type { GuardAssembly, LifeSafetyAssessment, PlatformEdgeLifeSafetyAssessment, StairLandingLifeSafetyAssessment, StairLifeSafetyAssessment } from './types';

const GUARD_TRIGGER_DROP_MM = 600;
const TALL_GUARD_TRIGGER_DROP_MM = 1800;
const CLIMBABILITY_TRIGGER_DROP_MM = 4200;
const ADJACENT_SURFACE_SEARCH_MM = 1200;
const MINIMUM_STAIR_WIDTH_MM = 860;
const MAXIMUM_FLIGHT_RISE_MM = 3700;
const MINIMUM_RISER_HEIGHT_MM = 125;
const MAXIMUM_RISER_HEIGHT_MM = 200;
const MINIMUM_RUN_MM = 255;
const MAXIMUM_RUN_MM = 355;
const MAXIMUM_STRINGER_SPACING_MM = 900;
const MINIMUM_HEADROOM_MM = 1950;

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
    schema: 'life-safety-screen/v2',
    occupancyAssumption: 'single-dwelling-exterior-deck',
    adjacentSurfaceSearchMm: ADJACENT_SURFACE_SEARCH_MM,
    platformEdges,
    stairs,
    status: statuses.includes('blocked') ? 'blocked' : statuses.includes('review') ? 'review' : 'pass',
    limitations: [
      'The 1.2 m adjacent-surface screen uses the modeled platform polygons and recorded/interpolated project grade; field grade and accessible adjacent surfaces must be verified.',
      'Generated guard lines are design intent only. Guard loads, posts, blocking, anchorage, openings, climbability, glazing, corrosion resistance, and proprietary product compliance remain unresolved.',
      'Stair handrail intent does not resolve graspability, continuity, termination, clearances, attachment, guard infill, or the relationship between a handrail and a required stair guard.',
      'The stair plan screen checks modeled width, rise, run/going, flight rise, stringer spacing, and whether a straight-flight landing rectangle fits on a modeled platform. It does not verify tread nosing/depth, doors, landing slope, drainage, slip resistance, or field dimensional uniformity.',
      'Stair headroom is not represented in the current existing-house and overhead-obstruction model. A minimum 1950 mm clear headroom remains an explicit field and professional-review item.',
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
  const flightRiseMm = Math.abs(startElevation - endElevation);
  const modeledStringerSpacingMm = stair.stringerCount > 1 ? Math.round(stair.widthMm / (stair.stringerCount - 1)) : stair.widthMm;
  const topLanding = assessStairLanding('top', stair.from, stair.startMm, [-dx / length, -dy / length], lateral, stair, design);
  const bottomLanding = assessStairLanding('bottom', stair.to, stair.endMm, [dx / length, dy / length], lateral, stair, design);
  const invalidGeometry = stair.widthMm < MINIMUM_STAIR_WIDTH_MM
    || flightRiseMm > MAXIMUM_FLIGHT_RISE_MM
    || stair.riserHeightMm < MINIMUM_RISER_HEIGHT_MM
    || stair.riserHeightMm > MAXIMUM_RISER_HEIGHT_MM
    || stair.treadDepthMm < MINIMUM_RUN_MM
    || stair.treadDepthMm > MAXIMUM_RUN_MM
    || modeledStringerSpacingMm > MAXIMUM_STRINGER_SPACING_MM
    || topLanding.planClearanceStatus === 'blocked'
    || bottomLanding.planClearanceStatus === 'blocked';
  const geometryStatus: StairLifeSafetyAssessment['geometryStatus'] = invalidGeometry ? 'blocked' : 'pass';
  // Headroom, landing surfaces, field uniformity, connections, and proprietary guard details
  // remain unresolved even when the deterministic plan geometry passes.
  const status: StairLifeSafetyAssessment['status'] = missingRequiredHandrail || invalidGeometry ? 'blocked' : 'review';
  const blockers = [
    stair.widthMm < MINIMUM_STAIR_WIDTH_MM ? `width ${stair.widthMm} mm is below ${MINIMUM_STAIR_WIDTH_MM} mm` : null,
    flightRiseMm > MAXIMUM_FLIGHT_RISE_MM ? `flight rise ${flightRiseMm} mm exceeds ${MAXIMUM_FLIGHT_RISE_MM} mm` : null,
    stair.riserHeightMm < MINIMUM_RISER_HEIGHT_MM || stair.riserHeightMm > MAXIMUM_RISER_HEIGHT_MM ? `riser ${stair.riserHeightMm} mm is outside ${MINIMUM_RISER_HEIGHT_MM}-${MAXIMUM_RISER_HEIGHT_MM} mm` : null,
    stair.treadDepthMm < MINIMUM_RUN_MM || stair.treadDepthMm > MAXIMUM_RUN_MM ? `modeled run/going ${stair.treadDepthMm} mm is outside ${MINIMUM_RUN_MM}-${MAXIMUM_RUN_MM} mm` : null,
    modeledStringerSpacingMm > MAXIMUM_STRINGER_SPACING_MM ? `modeled stringer spacing ${modeledStringerSpacingMm} mm exceeds ${MAXIMUM_STRINGER_SPACING_MM} mm` : null,
    topLanding.planClearanceStatus === 'blocked' ? 'top landing rectangle does not fit its platform' : null,
    bottomLanding.planClearanceStatus === 'blocked' ? 'bottom landing rectangle does not fit its platform' : null,
  ].filter((item): item is string => Boolean(item));
  return {
    id: `LS-${stair.id}`,
    stairId: stair.id,
    riserCount: stair.riserCount,
    widthMm: stair.widthMm,
    minimumWidthMm: MINIMUM_STAIR_WIDTH_MM,
    flightRiseMm,
    maximumFlightRiseMm: MAXIMUM_FLIGHT_RISE_MM,
    permittedRiserHeightRangeMm: [MINIMUM_RISER_HEIGHT_MM, MAXIMUM_RISER_HEIGHT_MM],
    permittedRunRangeMm: [MINIMUM_RUN_MM, MAXIMUM_RUN_MM],
    modeledRunMm: stair.treadDepthMm,
    geometryStatus,
    modeledStringerSpacingMm,
    maximumStringerSpacingMm: MAXIMUM_STRINGER_SPACING_MM,
    topLanding,
    bottomLanding,
    requiredHeadroomMm: MINIMUM_HEADROOM_MM,
    modeledHeadroomMm: null,
    headroomStatus: 'unresolved',
    uniformityStatus: 'model-uniform-field-verification-required',
    treadAndLandingFinishStatus: 'unresolved',
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
      : blockers.length
        ? `Stair plan geometry is blocked: ${blockers.join('; ')}.`
        : `${stair.riserCount} exterior risers; modeled width, rise, run/going, flight rise, landing footprint, and stringer spacing pass the encoded plan screen. ${handrailRequired ? 'Minimum one handrail is required' : 'Required handrail threshold is not exceeded'}; ${guardRequiredSides.length ? `guard protection is screened on ${guardRequiredSides.join(' and ')} side(s)` : 'no stair-side guard trigger was found in the modeled surface screen'}. Headroom, landing surface, field uniformity, and assemblies still require verification.`,
  };
}

function assessStairLanding(
  endpoint: StairLandingLifeSafetyAssessment['endpoint'],
  host: DeckStair['from'],
  point: PointMm,
  interiorDirection: PointMm,
  lateral: PointMm,
  stair: DeckStair,
  design: DeckDesign,
): StairLandingLifeSafetyAssessment {
  const requiredLengthMm = Math.min(stair.widthMm, 1100);
  if (host.kind === 'terrain') {
    const planClearanceStatus = stair.landingDepthMm >= requiredLengthMm ? 'generated-intent' as const : 'blocked' as const;
    return {
      endpoint,
      hostKind: 'grade',
      hostId: 'terrain',
      requiredWidthMm: stair.widthMm,
      requiredLengthMm,
      modeledDepthMm: stair.landingDepthMm,
      planClearanceStatus,
      surfaceStatus: 'unresolved',
      basis: planClearanceStatus === 'generated-intent'
        ? `${stair.landingDepthMm} mm landing intent is generated at grade; finished grade slope, drainage, support, and obstructions require field verification.`
        : `${stair.landingDepthMm} mm landing intent is shorter than the ${requiredLengthMm} mm straight-flight screen.`,
    };
  }
  const platform = design.platforms.find((candidate) => candidate.id === host.platformId);
  if (!platform) {
    return { endpoint, hostKind: 'platform', hostId: host.platformId, requiredWidthMm: stair.widthMm, requiredLengthMm, modeledDepthMm: null, planClearanceStatus: 'blocked', surfaceStatus: 'unresolved', basis: 'The endpoint platform is missing from the canonical design.' };
  }
  const inset = Math.min(25, requiredLengthMm / 4, stair.widthMm / 4);
  const depths = [inset, requiredLengthMm / 2, requiredLengthMm - inset];
  const offsets = [-(stair.widthMm / 2 - inset), 0, stair.widthMm / 2 - inset];
  const samples = depths.flatMap((depth) => offsets.map((offset): PointMm => [
    point[0] + interiorDirection[0] * depth + lateral[0] * offset,
    point[1] + interiorDirection[1] * depth + lateral[1] * offset,
  ]));
  const fits = samples.every((sample) => pointInBoundary(sample, platform) || pointOnBoundary(sample, platform));
  return {
    endpoint,
    hostKind: 'platform',
    hostId: platform.id,
    requiredWidthMm: stair.widthMm,
    requiredLengthMm,
    modeledDepthMm: fits ? requiredLengthMm : null,
    planClearanceStatus: fits ? 'pass' : 'blocked',
    surfaceStatus: 'unresolved',
    basis: fits
      ? `${stair.widthMm} x ${requiredLengthMm} mm straight-flight landing rectangle fits within ${platform.id}; slope, doors, guards, drainage, and finished surface remain unresolved.`
      : `${stair.widthMm} x ${requiredLengthMm} mm straight-flight landing rectangle does not fit within ${platform.id} at the modeled stair endpoint.`,
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

function pointOnBoundary(point: PointMm, platform: DeckPlatform): boolean {
  return platform.boundary.vertices.some((start, index, vertices) => {
    const end = vertices[(index + 1) % vertices.length];
    const cross = (point[0] - start.xMm) * (end.yMm - start.yMm) - (point[1] - start.yMm) * (end.xMm - start.xMm);
    if (Math.abs(cross) > 1) return false;
    return point[0] >= Math.min(start.xMm, end.xMm) - 1 && point[0] <= Math.max(start.xMm, end.xMm) + 1
      && point[1] >= Math.min(start.yMm, end.yMm) - 1 && point[1] <= Math.max(start.yMm, end.yMm) + 1;
  });
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
