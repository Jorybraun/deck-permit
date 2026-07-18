import { assessClosedBoundary, boundariesOverlap } from '../cad/makerCadKernel';
import type { AddPlatformInput, AddStairInput, BoundaryVertex, ClosedBoundary, DeckDesign, DeckPlatform, DeckStair, DesignAssessment, PlatformEdge, PointMm, PointToPointStairGeometry, StairLandingCandidate, VerticalEndpoint } from './types';

const DEFAULT_FINISH = {
  decking: 'Pressure-treated wood decking',
  deckingThicknessMm: 25,
  borderBoards: 0,
  boardDirectionDeg: 'auto' as const,
  guardSystem: 'Pressure-treated wood guardrail',
};

const DEFAULT_FRAMING_INTENT = {
  supportStrategy: 'auto' as const,
  joistDirectionDeg: 'auto' as const,
  joistSpacingMm: 400 as const,
};

/**
 * Deck design domain v1.
 * Canonical owner of platform, elevation, edge-role, and vertical-connection state.
 * Provider, storage, permit, structural-capacity, and UI dependencies are prohibited.
 */
export function createEmptyDesign(now = new Date().toISOString()): DeckDesign {
  return { schema: 'deck-design/v1', units: 'mm', platforms: [], stairs: [], selectedObjectId: null, updatedAt: now };
}

export function rectangularBoundary(xMm: number, yMm: number, widthMm: number, depthMm: number, prefix = 'V'): ClosedBoundary {
  return boundaryFromPoints([[xMm, yMm], [xMm + widthMm, yMm], [xMm + widthMm, yMm + depthMm], [xMm, yMm + depthMm]], prefix);
}

export function boundaryFromPoints(points: Array<readonly [number, number]>, prefix = 'V'): ClosedBoundary {
  return {
    schema: 'closed-boundary/v1',
    vertices: points.map(([xMm, yMm], index) => ({ id: `${prefix}${index + 1}`, xMm: Math.round(xMm), yMm: Math.round(yMm) })),
  };
}

export function addPlatform(design: DeckDesign, input: AddPlatformInput, now = new Date().toISOString()): DeckDesign {
  const boundaryAssessment = assessClosedBoundary(input.boundary);
  if (boundaryAssessment.errors.length) throw new DeckDesignError('invalid-boundary', boundaryAssessment.errors.join(' '));
  const id = nextId('P', design.platforms.map((platform) => platform.id));
  const platform: DeckPlatform = {
    id,
    name: input.name?.trim() || `Platform ${design.platforms.length + 1}`,
    purpose: input.purpose ?? 'deck',
    boundary: cloneBoundary(input.boundary, id),
    elevationMm: integer(input.elevationMm),
    edges: createEdges(input.boundary, id, input.houseEdgeIndex),
    framingIntent: { ...DEFAULT_FRAMING_INTENT },
    finish: { ...DEFAULT_FINISH },
  };
  const nextDesign = { ...design, platforms: [...design.platforms, platform], selectedObjectId: id };
  return touch(rehostTerrainStairsToPlatform(nextDesign, id), now);
}

export function updatePlatformBoundary(design: DeckDesign, platformId: string, boundary: ClosedBoundary, now = new Date().toISOString()): DeckDesign {
  const assessment = assessClosedBoundary(boundary);
  if (assessment.errors.length) throw new DeckDesignError('invalid-boundary', assessment.errors.join(' '));
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  const nextPlatform: DeckPlatform = {
    ...platform,
    boundary: cloneBoundary(boundary, platform.id),
    edges: reconcileEdges(platform.edges, boundary, platform.id),
  };
  const nextDesign = {
    ...design,
    platforms: design.platforms.map((candidate) => candidate.id === platformId ? nextPlatform : candidate),
    stairs: design.stairs.map((stair) => reanchorStairToPlatform(stair, platform, nextPlatform)),
  };
  return touch(rehostTerrainStairsToPlatform(nextDesign, platformId), now);
}

export function movePlatform(design: DeckDesign, platformId: string, deltaXmm: number, deltaYmm: number, now = new Date().toISOString()): DeckDesign {
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  const nextPlatform: DeckPlatform = {
    ...platform,
    boundary: {
      ...platform.boundary,
      vertices: platform.boundary.vertices.map((vertex) => ({ ...vertex, xMm: integer(vertex.xMm + deltaXmm), yMm: integer(vertex.yMm + deltaYmm) })),
    },
  };
  const nextDesign = {
    ...design,
    platforms: design.platforms.map((candidate) => candidate.id === platformId ? nextPlatform : candidate),
    stairs: design.stairs.map((stair) => reanchorStairToPlatform(stair, platform, nextPlatform)),
  };
  return touch(rehostTerrainStairsToPlatform(nextDesign, platformId), now);
}

/** Rotates a platform around its geometric centre while keeping connected stair endpoints attached. */
export function rotatePlatform(design: DeckDesign, platformId: string, deltaDeg: number, now = new Date().toISOString()): DeckDesign {
  if (!Number.isFinite(deltaDeg)) throw new DeckDesignError('invalid-boundary', 'Platform rotation must be a finite angle.');
  if (Math.abs(deltaDeg) < .0001) return design;
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  const pivot = boundaryCenter(platform.boundary);
  const boundary = rotateBoundary(platform.boundary, deltaDeg, pivot);
  const assessment = assessClosedBoundary(boundary);
  if (assessment.errors.length) throw new DeckDesignError('invalid-boundary', assessment.errors.join(' '));
  const stairs = design.stairs.map((stair) => rotateAttachedStair(stair, platformId, pivot, deltaDeg));
  const nextDesign = {
    ...design,
    platforms: design.platforms.map((candidate) => candidate.id === platformId ? { ...candidate, boundary } : candidate),
    stairs,
  };
  return touch(rehostTerrainStairsToPlatform(nextDesign, platformId), now);
}

export function boundaryCenter(boundary: ClosedBoundary): PointMm {
  const count = Math.max(1, boundary.vertices.length);
  return [
    boundary.vertices.reduce((sum, vertex) => sum + vertex.xMm, 0) / count,
    boundary.vertices.reduce((sum, vertex) => sum + vertex.yMm, 0) / count,
  ];
}

export function rotateBoundary(boundary: ClosedBoundary, deltaDeg: number, pivot = boundaryCenter(boundary)): ClosedBoundary {
  if (!Number.isFinite(deltaDeg)) throw new DeckDesignError('invalid-boundary', 'Platform rotation must be a finite angle.');
  return { ...boundary, vertices: boundary.vertices.map((vertex) => ({ ...vertex, ...pointToVertex(rotatePoint([vertex.xMm, vertex.yMm], pivot, deltaDeg)) })) };
}

export function setPlatformElevation(design: DeckDesign, platformId: string, elevationMm: number, now = new Date().toISOString()): DeckDesign {
  if (!design.platforms.some((platform) => platform.id === platformId)) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  const platforms = design.platforms.map((platform) => platform.id === platformId ? { ...platform, elevationMm: integer(elevationMm) } : platform);
  const nextDesign = { ...design, platforms };
  const stairs = design.stairs.map((stair) => endpointUsesPlatform(stair.from, platformId) || endpointUsesPlatform(stair.to, platformId) ? recalculateStairElevation(nextDesign, stair) : stair);
  return touch(rehostTerrainStairsToPlatform({ ...nextDesign, stairs }, platformId), now);
}

export function movePlatformLayer(design: DeckDesign, platformId: string, delta: -1 | 1, now = new Date().toISOString()): DeckDesign {
  const index = design.platforms.findIndex((platform) => platform.id === platformId);
  if (index < 0) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  const target = Math.max(0, Math.min(design.platforms.length - 1, index + delta));
  if (target === index) return design;
  const platforms = [...design.platforms];
  const [platform] = platforms.splice(index, 1);
  platforms.splice(target, 0, platform);
  return touch({ ...design, platforms }, now);
}

export function renamePlatform(design: DeckDesign, platformId: string, name: string, now = new Date().toISOString()): DeckDesign {
  const normalized = name.trim();
  if (!normalized) throw new DeckDesignError('invalid-boundary', 'Platform name cannot be empty.');
  return updatePlatform(design, platformId, (platform) => ({ ...platform, name: normalized }), now);
}

export function setPlatformPurpose(design: DeckDesign, platformId: string, purpose: NonNullable<DeckPlatform['purpose']>, now = new Date().toISOString()): DeckDesign {
  return updatePlatform(design, platformId, (platform) => ({ ...platform, purpose }), now);
}

/** Returns the highest lower platform whose plan footprint contains the point. */
export function findHighestPlatformBelowPoint(design: DeckDesign, sourcePlatformId: string, pointMm: PointMm): DeckPlatform | null {
  const source = design.platforms.find((platform) => platform.id === sourcePlatformId);
  if (!source) throw new DeckDesignError('platform-not-found', `Platform ${sourcePlatformId} does not exist.`);
  return design.platforms
    .filter((platform) => platform.id !== sourcePlatformId && platform.elevationMm < source.elevationMm && pointInBoundary(pointMm, platform.boundary))
    .sort((first, second) => second.elevationMm - first.elevationMm)[0] ?? null;
}

/** Suggests the level carried by a terrain-ended stair when a new platform is drawn at Point B. */
export function suggestedPlatformElevationForBoundary(design: DeckDesign, boundary: ClosedBoundary): number | null {
  const matches = design.stairs.flatMap((stair) => {
    if (stair.from.kind !== 'platform' || stair.to.kind !== 'terrain') return [];
    const match = terrainStairLandingIntersection(stair, boundary);
    return match ? [{ elevationMm: stair.to.elevationMm, distanceMm: match.distanceMm }] : [];
  }).sort((first, second) => first.distanceMm - second.distanceMm);
  return matches[0]?.elevationMm ?? null;
}

/** Lower platforms whose edge is reached by the current stair axis near Point B. */
export function stairLandingCandidates(design: DeckDesign, stairId: string): StairLandingCandidate[] {
  const stair = design.stairs.find((candidate) => candidate.id === stairId);
  if (!stair) throw new DeckDesignError('object-not-found', `Stair ${stairId} does not exist.`);
  if (stair.from.kind !== 'platform') return [];
  const source = platformForEndpoint(design, stair.from);
  return design.platforms.flatMap((platform) => {
    if (platform.id === source.id || source.elevationMm - platform.elevationMm < 125) return [];
    const match = stairLandingIntersection(stair, platform.boundary);
    const edgeId = match ? platform.edges[match.edgeIndex]?.id : null;
    if (!match || !edgeId) return [];
    return [{ platformId: platform.id, platformName: platform.name, elevationMm: platform.elevationMm, edgeId, pointMm: match.pointMm, distanceFromCurrentEndMm: match.distanceMm }];
  }).sort((first, second) => first.distanceFromCurrentEndMm - second.distanceFromCurrentEndMm || second.elevationMm - first.elevationMm);
}

/** Explicitly hosts Point B on a selected lower platform and recalculates the flight. */
export function connectStairLanding(design: DeckDesign, stairId: string, platformId: string, now = new Date().toISOString()): DeckDesign {
  const stair = design.stairs.find((candidate) => candidate.id === stairId);
  if (!stair) throw new DeckDesignError('object-not-found', `Stair ${stairId} does not exist.`);
  const candidate = stairLandingCandidates(design, stairId).find((item) => item.platformId === platformId);
  if (!candidate) throw new DeckDesignError('invalid-stair-run', 'The selected lower platform is not reached by this stair axis near Point B. Move the platform or stair, then try again.');
  const platform = design.platforms.find((item) => item.id === candidate.platformId)!;
  const hosted = recalculateStairElevation(design, reconcileStairPlan({
    ...stair,
    to: { kind: 'platform', platformId: platform.id },
    toEdgeId: candidate.edgeId,
    toEdgeT: edgeParameter(platform, candidate.edgeId, candidate.pointMm),
    endMm: candidate.pointMm,
  }));
  return touch({
    ...design,
    platforms: design.platforms.map((item) => item.id === platform.id ? { ...item, edges: item.edges.map((edge) => edge.id === candidate.edgeId ? { ...edge, role: 'stair' as const } : edge) } : item),
    stairs: design.stairs.map((item) => item.id === stair.id ? hosted : item),
    selectedObjectId: stair.id,
  }, now);
}

/** Snaps an interior landing gesture to the nearest usable edge of that platform. */
export function nearestPlatformEdgePoint(platform: DeckPlatform, pointMm: PointMm): { edgeId: string; edgeIndex: number; pointMm: PointMm; distanceMm: number } {
  const candidates = platform.edges.map((edge, edgeIndex) => {
    const start = platform.boundary.vertices[edgeIndex];
    const end = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
    const projected = closestPointOnSegment(pointMm, [start.xMm, start.yMm], [end.xMm, end.yMm]);
    return { edgeId: edge.id, edgeIndex, pointMm: projected, distanceMm: Math.round(Math.hypot(projected[0] - pointMm[0], projected[1] - pointMm[1])) };
  });
  const nearest = candidates.sort((first, second) => first.distanceMm - second.distanceMm)[0];
  if (!nearest) throw new DeckDesignError('invalid-boundary', `${platform.name} has no usable landing edge.`);
  return nearest;
}

export function setPlatformFinish(design: DeckDesign, platformId: string, finish: Partial<DeckPlatform['finish']>, now = new Date().toISOString()): DeckDesign {
  return updatePlatform(design, platformId, (platform) => ({ ...platform, finish: { ...platform.finish, ...finish } }), now);
}

export function setPlatformFramingIntent(design: DeckDesign, platformId: string, framingIntent: Partial<DeckPlatform['framingIntent']>, now = new Date().toISOString()): DeckDesign {
  return updatePlatform(design, platformId, (platform) => ({ ...platform, framingIntent: { ...platform.framingIntent, ...framingIntent } }), now);
}

export function setPlatformEdgeRole(design: DeckDesign, platformId: string, edgeId: string, role: PlatformEdge['role'], now = new Date().toISOString()): DeckDesign {
  return updatePlatform(design, platformId, (platform) => {
    if (!platform.edges.some((edge) => edge.id === edgeId)) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
    return { ...platform, edges: platform.edges.map((edge) => edge.id === edgeId ? { ...edge, role } : edge) };
  }, now);
}

export function setPlatformEdgeLength(design: DeckDesign, platformId: string, edgeId: string, lengthMm: number, now = new Date().toISOString()): DeckDesign {
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  const edgeIndex = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (edgeIndex < 0) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
  const requestedLength = integer(lengthMm);
  if (requestedLength < 300) throw new DeckDesignError('invalid-boundary', 'Platform edges must be at least 300 mm long.');
  const vertices = platform.boundary.vertices.map((vertex) => ({ ...vertex }));
  const start = vertices[edgeIndex];
  const endIndex = (edgeIndex + 1) % vertices.length;
  const end = vertices[endIndex];
  const currentLength = Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm);
  if (currentLength < 1) throw new DeckDesignError('invalid-boundary', 'The selected edge has no measurable direction.');
  vertices[endIndex] = {
    ...end,
    xMm: Math.round(start.xMm + (end.xMm - start.xMm) / currentLength * requestedLength),
    yMm: Math.round(start.yMm + (end.yMm - start.yMm) / currentLength * requestedLength),
  };
  return updatePlatformBoundary(design, platformId, { ...platform.boundary, vertices }, now);
}

export function insertPlatformVertex(design: DeckDesign, platformId: string, edgeId: string, pointMm?: PointMm, now = new Date().toISOString()): DeckDesign {
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  const edgeIndex = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (edgeIndex < 0) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
  const start = platform.boundary.vertices[edgeIndex];
  const end = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
  const point = pointMm || [Math.round((start.xMm + end.xMm) / 2), Math.round((start.yMm + end.yMm) / 2)];
  const vertices = platform.boundary.vertices.map((vertex) => ({ ...vertex }));
  vertices.splice(edgeIndex + 1, 0, { id: `${platform.id}-V-new`, xMm: integer(point[0]), yMm: integer(point[1]) });
  const boundary: ClosedBoundary = { ...platform.boundary, vertices };
  const assessment = assessClosedBoundary(boundary);
  if (assessment.errors.length) throw new DeckDesignError('invalid-boundary', assessment.errors.join(' '));
  const splitRole = platform.edges[edgeIndex].role;
  const splitHostId = platform.edges[edgeIndex].hostId;
  const cloned = cloneBoundary(boundary, platform.id);
  const edges = cloned.vertices.map((_vertex, index): PlatformEdge => {
    const prior = index <= edgeIndex ? platform.edges[index] : index === edgeIndex + 1 ? platform.edges[edgeIndex] : platform.edges[index - 1];
    return {
      id: `${platform.id}-E${index + 1}`,
      startVertexId: `${platform.id}-V${index + 1}`,
      endVertexId: `${platform.id}-V${(index + 1) % cloned.vertices.length + 1}`,
      role: index === edgeIndex || index === edgeIndex + 1 ? splitRole : prior?.role || 'open',
      ...((index === edgeIndex || index === edgeIndex + 1 ? splitHostId : prior?.hostId) ? { hostId: index === edgeIndex || index === edgeIndex + 1 ? splitHostId : prior?.hostId } : {}),
    };
  });
  return updatePlatform(design, platformId, (current) => ({ ...current, boundary: cloned, edges }), now);
}

export function removePlatform(design: DeckDesign, platformId: string, now = new Date().toISOString()): DeckDesign {
  if (!design.platforms.some((platform) => platform.id === platformId)) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  return touch({
    ...design,
    platforms: design.platforms.filter((platform) => platform.id !== platformId),
    stairs: design.stairs.filter((stair) => !endpointUsesPlatform(stair.from, platformId) && !endpointUsesPlatform(stair.to, platformId)),
    selectedObjectId: design.selectedObjectId === platformId ? null : design.selectedObjectId,
  }, now);
}

export function removeStair(design: DeckDesign, stairId: string, now = new Date().toISOString()): DeckDesign {
  const stair = design.stairs.find((candidate) => candidate.id === stairId);
  if (!stair) throw new DeckDesignError('object-not-found', `Stair ${stairId} does not exist.`);
  const stairs = design.stairs.filter((candidate) => candidate.id !== stairId);
  const sourcePlatformId = stair.from.kind === 'platform' ? stair.from.platformId : null;
  const platforms = sourcePlatformId && stair.fromEdgeId && !stairs.some((candidate) => candidate.fromEdgeId === stair.fromEdgeId)
    ? design.platforms.map((platform) => platform.id === sourcePlatformId ? { ...platform, edges: platform.edges.map((edge) => edge.id === stair.fromEdgeId ? { ...edge, role: 'open' as const } : edge) } : platform)
    : design.platforms;
  return touch({ ...design, platforms, stairs, selectedObjectId: design.selectedObjectId === stairId ? null : design.selectedObjectId }, now);
}

export function moveStair(design: DeckDesign, stairId: string, deltaXmm: number, deltaYmm: number, now = new Date().toISOString()): DeckDesign {
  const stair = design.stairs.find((candidate) => candidate.id === stairId);
  if (!stair) throw new DeckDesignError('object-not-found', `Stair ${stairId} does not exist.`);
  const dx = integer(deltaXmm);
  const dy = integer(deltaYmm);
  return touch({ ...design, stairs: design.stairs.map((candidate) => candidate.id === stairId ? {
    ...candidate,
    startMm: [candidate.startMm[0] + dx, candidate.startMm[1] + dy],
    endMm: [candidate.endMm[0] + dx, candidate.endMm[1] + dy],
  } : candidate) }, now);
}

/** Changes one stair edge while holding the opposite edge fixed. */
export function resizeStairSide(design: DeckDesign, stairId: string, side: 'left' | 'right', widthMm: number, now = new Date().toISOString()): DeckDesign {
  const stair = design.stairs.find((candidate) => candidate.id === stairId);
  if (!stair) throw new DeckDesignError('object-not-found', `Stair ${stairId} does not exist.`);
  const width = integer(widthMm);
  if (width < 860) throw new DeckDesignError('invalid-stair-width', 'Stair width must be at least 860 mm.');
  if (width > 4800) throw new DeckDesignError('invalid-stair-width', 'Stair width must not exceed 4800 mm in the concept editor.');
  const radians = stair.directionDeg * Math.PI / 180;
  const normalX = -Math.sin(radians);
  const normalY = Math.cos(radians);
  const centreShift = (side === 'left' ? stair.widthMm - width : width - stair.widthMm) / 2;
  const dx = Math.round(normalX * centreShift);
  const dy = Math.round(normalY * centreShift);
  const stringerCount = Math.max(2, Math.ceil(width / 450) + 1);
  const landingDepthMm = Math.max(stair.landingDepthMm, width);
  return touch({ ...design, stairs: design.stairs.map((candidate) => candidate.id === stairId ? {
    ...candidate,
    widthMm: width,
    landingDepthMm,
    stringerCount,
    startMm: [candidate.startMm[0] + dx, candidate.startMm[1] + dy],
    endMm: [candidate.endMm[0] + dx, candidate.endMm[1] + dy],
  } : candidate) }, now);
}

export function setStairConstruction(design: DeckDesign, stairId: string, changes: Partial<Pick<DeckStair, 'widthMm' | 'landingDepthMm' | 'stringerCount' | 'handrailSides' | 'directionDeg'>>, now = new Date().toISOString()): DeckDesign {
  const stair = design.stairs.find((candidate) => candidate.id === stairId);
  if (!stair) throw new DeckDesignError('object-not-found', `Stair ${stairId} does not exist.`);
  const widthMm = integer(changes.widthMm ?? stair.widthMm);
  const landingDepthMm = integer(changes.landingDepthMm ?? Math.max(stair.landingDepthMm, widthMm));
  const stringerCount = integer(changes.stringerCount ?? (changes.widthMm === undefined ? stair.stringerCount : Math.max(2, Math.ceil(widthMm / 450) + 1)));
  const directionDeg = normalizeDegrees(changes.directionDeg ?? stair.directionDeg);
  if (widthMm < 860) throw new DeckDesignError('invalid-stair-width', 'Stair width must be at least 860 mm.');
  if (landingDepthMm < widthMm) throw new DeckDesignError('invalid-stair-landing', 'Landing depth must be at least the stair width.');
  if (stringerCount < 2 || stringerCount > 12) throw new DeckDesignError('invalid-stair-stringers', 'A stair must have between 2 and 12 stringers in the design intent.');
  const directionRadians = directionDeg * Math.PI / 180;
  let endMm: PointMm = stair.endMm;
  if (changes.directionDeg !== undefined && stair.to.kind === 'terrain') {
    endMm = [Math.round(stair.startMm[0] + Math.cos(directionRadians) * stair.totalRunMm), Math.round(stair.startMm[1] + Math.sin(directionRadians) * stair.totalRunMm)];
  } else if (changes.directionDeg !== undefined && stair.to.kind === 'platform' && stair.toEdgeId) {
    const intersection = stairLineIntersectionWithEdge(stair.startMm, directionDeg, platformForEndpoint(design, stair.to), stair.toEdgeId);
    if (!intersection) throw new DeckDesignError('invalid-stair-run', 'That joint angle no longer reaches the destination landing edge. Move or resize the landing, or reduce the skew.');
    endMm = intersection;
  }
  const toEdgeT = stair.to.kind === 'platform' && stair.toEdgeId ? edgeParameter(platformForEndpoint(design, stair.to), stair.toEdgeId, endMm) : stair.toEdgeT;
  return touch({ ...design, stairs: design.stairs.map((candidate) => candidate.id === stairId ? reconcileStairPlan({ ...candidate, ...changes, directionDeg, endMm, widthMm, landingDepthMm, stringerCount, ...(toEdgeT === undefined ? {} : { toEdgeT }) }) : candidate) }, now);
}

export function addStair(design: DeckDesign, input: AddStairInput, now = new Date().toISOString()): DeckDesign {
  const fromElevation = endpointElevation(design, input.from);
  const toElevation = endpointElevation(design, input.to);
  const riseMm = Math.abs(toElevation - fromElevation);
  if (riseMm < 125) throw new DeckDesignError('stair-rise-too-small', 'A stair requires at least 125 mm of elevation change.');
  const riserCount = input.riserCount === undefined ? Math.ceil(riseMm / 200) : integer(input.riserCount);
  if (riserCount < 1 || riserCount > 30) throw new DeckDesignError('invalid-stair-riser-count', 'Stair riser count must be between 1 and 30.');
  const riserHeightMm = Math.round(riseMm / riserCount);
  if (riserHeightMm < 125 || riserHeightMm > 200) throw new DeckDesignError('invalid-stair-rise', 'Calculated stair risers must be between 125 mm and 200 mm.');
  const treadDepthMm = integer(input.treadDepthMm ?? 280);
  if (treadDepthMm < 255 || treadDepthMm > 355) throw new DeckDesignError('invalid-stair-tread', 'Stair tread depth must be between 255 mm and 355 mm.');
  const widthMm = integer(input.widthMm ?? 900);
  if (widthMm < 860) throw new DeckDesignError('invalid-stair-width', 'Stair width must be at least 860 mm.');
  const landingDepthMm = integer(input.landingDepthMm ?? Math.max(900, widthMm));
  if (landingDepthMm < widthMm) throw new DeckDesignError('invalid-stair-landing', 'Landing depth must be at least the stair width.');
  const stringerCount = integer(input.stringerCount ?? Math.max(2, Math.ceil(widthMm / 450) + 1));
  if (stringerCount < 2 || stringerCount > 12) throw new DeckDesignError('invalid-stair-stringers', 'A stair must have between 2 and 12 stringers in the design intent.');
  const id = nextId('ST', design.stairs.map((stair) => stair.id));
  const directionDeg = normalizeDegrees(input.directionDeg);
  const totalRunMm = Math.max(0, riserCount - 1) * treadDepthMm;
  const directionRadians = directionDeg * Math.PI / 180;
  const calculatedEnd: PointMm = [Math.round(input.startMm[0] + Math.cos(directionRadians) * totalRunMm), Math.round(input.startMm[1] + Math.sin(directionRadians) * totalRunMm)];
  const hostedEnd = input.to.kind === 'platform' && input.toEdgeId && !input.endMm
    ? stairLineIntersectionWithEdge(input.startMm, directionDeg, platformForEndpoint(design, input.to), input.toEdgeId)
    : null;
  if (input.to.kind === 'platform' && input.toEdgeId && !input.endMm && !hostedEnd) throw new DeckDesignError('invalid-stair-run', 'The stair axis does not reach the selected destination edge. Move the landing or choose another edge.');
  const endMm: PointMm = input.endMm ? [integer(input.endMm[0]), integer(input.endMm[1])] : hostedEnd ?? calculatedEnd;
  const stair: DeckStair = {
    id,
    name: input.name?.trim() || `Stair ${design.stairs.length + 1}`,
    from: input.from,
    to: input.to,
    ...(input.fromEdgeId ? { fromEdgeId: input.fromEdgeId } : {}),
    ...(input.toEdgeId ? { toEdgeId: input.toEdgeId } : {}),
    ...(input.from.kind === 'platform' && input.fromEdgeId ? { fromEdgeT: edgeParameter(platformForEndpoint(design, input.from), input.fromEdgeId, input.startMm) } : {}),
    ...(input.to.kind === 'platform' && input.toEdgeId ? { toEdgeT: edgeParameter(platformForEndpoint(design, input.to), input.toEdgeId, endMm) } : {}),
    startMm: [integer(input.startMm[0]), integer(input.startMm[1])],
    endMm,
    directionDeg,
    widthMm,
    landingDepthMm,
    stringerCount,
    handrailSides: input.handrailSides ?? (riserCount >= 3 ? 'both' : 'none'),
    riserCount,
    riserHeightMm,
    treadDepthMm,
    totalRunMm,
  };
  return touch({ ...design, stairs: [...design.stairs, reconcileStairPlan(stair)], selectedObjectId: id }, now);
}

/** Builds a code-screened stair intent between two exact plan points. */
export function suggestPointToPointStair(design: DeckDesign, sourcePlatformId: string, sourceEdgeId: string, to: VerticalEndpoint, startMm: PointMm, endMm: PointMm, toEdgeId?: string): AddStairInput {
  const from: VerticalEndpoint = { kind: 'platform', platformId: sourcePlatformId };
  const sourcePlatform = platformForEndpoint(design, from);
  const directionDeg = stairDepartureDirection(sourcePlatform, sourceEdgeId);
  const directionRadians = directionDeg * Math.PI / 180;
  const constrainedPlatformEnd = to.kind === 'platform' && toEdgeId
    ? stairLineIntersectionWithEdge(startMm, directionDeg, platformForEndpoint(design, to), toEdgeId)
    : null;
  if (to.kind === 'platform' && toEdgeId && !constrainedPlatformEnd) {
    throw new DeckDesignError('invalid-stair-run', 'That landing edge does not line up square with the stair opening. Move or resize the landing, or choose another edge.');
  }
  const constrainedEndMm = constrainedPlatformEnd ?? endMm;
  const riseMm = Math.abs(endpointElevation(design, from) - endpointElevation(design, to));
  const requestedRunMm = Math.round(Math.hypot(constrainedEndMm[0] - startMm[0], constrainedEndMm[1] - startMm[1]));
  const geometry = proposePointToPointStairGeometry(riseMm, requestedRunMm);
  if (geometry.status === 'no-stair') throw new DeckDesignError('stair-rise-too-small', 'These two points have less than 125 mm of elevation change, so they do not need a stair.');
  if (geometry.status === 'invalid-rise') throw new DeckDesignError('invalid-stair-rise', 'This elevation change cannot be resolved with a single code-screened stair run. Add an intermediate platform or landing.');
  if (geometry.status !== 'valid' || geometry.riserCount === undefined || geometry.treadDepthMm === undefined) throw new DeckDesignError('invalid-stair-run', 'A straight stair could not be proposed for this elevation change. Add an intermediate platform or landing.');
  if (to.kind === 'platform' && Math.abs(requestedRunMm - geometry.runMm) > 900) throw new DeckDesignError('invalid-stair-run', `The destination platform is ${Math.abs(requestedRunMm - geometry.runMm)} mm beyond a legal straight stair. Add or extend a landing platform, or use two stair runs.`);
  const calculatedEndMm: PointMm = [Math.round(startMm[0] + Math.cos(directionRadians) * geometry.runMm), Math.round(startMm[1] + Math.sin(directionRadians) * geometry.runMm)];
  return {
    from,
    to,
    fromEdgeId: sourceEdgeId,
    ...(toEdgeId ? { toEdgeId } : {}),
    startMm,
    endMm: to.kind === 'platform' ? constrainedEndMm : calculatedEndMm,
    directionDeg,
    riserCount: geometry.riserCount,
    treadDepthMm: geometry.treadDepthMm,
  };
}

/** The stair/stringer axis is square to the host edge so its top ends meet a real header line. */
export function stairDepartureDirection(platform: DeckPlatform, edgeId: string): number {
  const edgeIndex = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (edgeIndex < 0) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
  const start = platform.boundary.vertices[edgeIndex];
  const end = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
  const deltaX = end.xMm - start.xMm;
  const deltaY = end.yMm - start.yMm;
  const signedArea = platform.boundary.vertices.reduce((area, vertex, index, vertices) => {
    const next = vertices[(index + 1) % vertices.length];
    return area + vertex.xMm * next.yMm - next.xMm * vertex.yMm;
  }, 0);
  const outwardX = signedArea >= 0 ? deltaY : -deltaY;
  const outwardY = signedArea >= 0 ? -deltaX : deltaX;
  return normalizeDegrees(Math.atan2(outwardY, outwardX) * 180 / Math.PI);
}

/** Canonical live geometry check used by both the A→B drafting preview and committed stair creation. */
export function calculatePointToPointStairGeometry(riseMm: number, runMm: number): PointToPointStairGeometry {
  const rise = Math.round(Math.abs(riseMm));
  const run = Math.round(Math.max(0, runMm));
  if (rise < 125) return { status: 'no-stair', riseMm: rise, runMm: run, minimumRunMm: 0, maximumRunMm: 0 };
  const legalRiserCounts = Array.from({ length: 30 }, (_, index) => index + 1).filter((count) => count > 1 && rise / count >= 125 && rise / count <= 200);
  if (!legalRiserCounts.length) return { status: 'invalid-rise', riseMm: rise, runMm: run, minimumRunMm: 0, maximumRunMm: 0 };
  const minimumRunMm = Math.min(...legalRiserCounts.map((count) => (count - 1) * 255));
  const maximumRunMm = Math.max(...legalRiserCounts.map((count) => (count - 1) * 355));
  const candidates = legalRiserCounts.flatMap((riserCount) => {
    const treadCount = riserCount - 1;
    const treadDepthMm = run / treadCount;
    if (treadDepthMm < 255 || treadDepthMm > 355) return [];
    const riserHeightMm = rise / riserCount;
    const score = Math.abs(riserHeightMm - 175) + Math.abs(treadDepthMm - 280) / 3;
    return [{ riserCount, treadCount, riserHeightMm: Math.round(riserHeightMm), treadDepthMm: Math.round(treadDepthMm), score }];
  }).sort((first, second) => first.score - second.score);
  const selected = candidates[0];
  if (!selected) return { status: run < minimumRunMm ? 'too-short' : 'too-long', riseMm: rise, runMm: run, minimumRunMm, maximumRunMm };
  return { status: 'valid', riseMm: rise, runMm: run, minimumRunMm, maximumRunMm, riserCount: selected.riserCount, riserHeightMm: selected.riserHeightMm, treadCount: selected.treadCount, treadDepthMm: selected.treadDepthMm };
}

/** Turns a rough destination gesture into the closest comfortable, code-screened straight stair. */
export function proposePointToPointStairGeometry(riseMm: number, requestedRunMm: number): PointToPointStairGeometry {
  const exact = calculatePointToPointStairGeometry(riseMm, requestedRunMm);
  if (exact.status === 'valid' || exact.status === 'no-stair' || exact.status === 'invalid-rise') return exact;
  const rise = Math.round(Math.abs(riseMm));
  const legalRiserCounts = Array.from({ length: 30 }, (_, index) => index + 1).filter((count) => count > 1 && rise / count >= 125 && rise / count <= 200);
  const candidates = legalRiserCounts.map((riserCount) => {
    const treadCount = riserCount - 1;
    const requestedTread = requestedRunMm / treadCount;
    const treadDepthMm = Math.round(Math.max(255, Math.min(355, requestedTread)));
    const runMm = treadCount * treadDepthMm;
    const riserHeightMm = Math.round(rise / riserCount);
    const score = Math.abs(runMm - requestedRunMm) + Math.abs(riserHeightMm - 175) * 2 + Math.abs(treadDepthMm - 280);
    return { riserCount, treadCount, treadDepthMm, riserHeightMm, runMm, score };
  }).sort((first, second) => first.score - second.score);
  const selected = candidates[0];
  if (!selected) return exact;
  return { status: 'valid', riseMm: rise, runMm: selected.runMm, minimumRunMm: exact.minimumRunMm, maximumRunMm: exact.maximumRunMm, riserCount: selected.riserCount, riserHeightMm: selected.riserHeightMm, treadCount: selected.treadCount, treadDepthMm: selected.treadDepthMm };
}

/** Creates a placeable stair intent at the midpoint of a platform edge. */
export function suggestStairAtEdge(platform: DeckPlatform, edgeId: string, to: VerticalEndpoint): AddStairInput {
  const edgeIndex = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (edgeIndex < 0) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
  const start = platform.boundary.vertices[edgeIndex];
  const end = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
  return {
    from: { kind: 'platform', platformId: platform.id },
    to,
    fromEdgeId: edgeId,
    startMm: [Math.round((start.xMm + end.xMm) / 2), Math.round((start.yMm + end.yMm) / 2)],
    directionDeg: stairDepartureDirection(platform, edgeId),
  };
}

export function suggestStairBetweenEdges(fromPlatform: DeckPlatform, fromEdgeId: string, toPlatform: DeckPlatform, toEdgeId: string, riserCount?: number): AddStairInput {
  const fromPoint = edgeMidpoint(fromPlatform, fromEdgeId);
  const toPoint = edgeMidpoint(toPlatform, toEdgeId);
  return {
    from: { kind: 'platform', platformId: fromPlatform.id },
    to: { kind: 'platform', platformId: toPlatform.id },
    fromEdgeId,
    toEdgeId,
    startMm: fromPoint,
    directionDeg: normalizeDegrees(Math.atan2(toPoint[1] - fromPoint[1], toPoint[0] - fromPoint[0]) * 180 / Math.PI),
    ...(riserCount === undefined ? {} : { riserCount }),
  };
}

export function selectDesignObject(design: DeckDesign, objectId: string | null, now = new Date().toISOString()): DeckDesign {
  if (objectId && !design.platforms.some((platform) => platform.id === objectId) && !design.stairs.some((stair) => stair.id === objectId)) {
    throw new DeckDesignError('object-not-found', `Design object ${objectId} does not exist.`);
  }
  return touch({ ...design, selectedObjectId: objectId }, now);
}

export function assessDesign(design: DeckDesign): DesignAssessment {
  const errors: DesignAssessment['errors'] = [];
  const warnings: DesignAssessment['warnings'] = [];
  let areaSqM = 0;
  design.platforms.forEach((platform) => {
    const result = assessClosedBoundary(platform.boundary);
    areaSqM += result.areaSqM;
    result.errors.forEach((message) => errors.push({ objectId: platform.id, message }));
    result.warnings.forEach((message) => warnings.push({ objectId: platform.id, message }));
  });
  for (let first = 0; first < design.platforms.length; first += 1) {
    for (let second = first + 1; second < design.platforms.length; second += 1) {
      const a = design.platforms[first];
      const b = design.platforms[second];
      if (a.elevationMm === b.elevationMm && boundariesOverlap(a.boundary, b.boundary)) {
        errors.push({ objectId: b.id, message: `${a.name} and ${b.name} overlap at the same elevation. Merge or separate their boundaries.` });
      }
    }
  }
  design.stairs.forEach((stair) => {
    const riseMm = Math.abs(endpointElevation(design, stair.from) - endpointElevation(design, stair.to));
    const geometry = assessStairPlanGeometry(design, stair);
    if (riseMm < 125) errors.push({ objectId: stair.id, message: `${stair.name} connects levels only ${riseMm} mm apart. Remove the stair or change a platform elevation.` });
    if (geometry.status === 'invalid-rise') errors.push({ objectId: stair.id, message: `${stair.name} has a ${riseMm} mm rise that cannot be resolved as one code-screened flight. Add a landing or revise the levels.` });
    if (geometry.status === 'too-short') errors.push({ objectId: stair.id, message: `${stair.name} has only ${geometry.runMm} mm of run; this rise needs at least ${geometry.minimumRunMm} mm between its attached endpoints.` });
    if (geometry.status === 'too-long') errors.push({ objectId: stair.id, message: `${stair.name} has ${geometry.runMm} mm of run; this rise allows at most ${geometry.maximumRunMm} mm as one straight flight.` });
    const hostedEndpoints = [
      stair.from.kind === 'platform' && stair.fromEdgeId ? { endpoint: 'top', host: stair.from, edgeId: stair.fromEdgeId, pointMm: stair.startMm } : null,
      stair.to.kind === 'platform' && stair.toEdgeId ? { endpoint: 'bottom', host: stair.to, edgeId: stair.toEdgeId, pointMm: stair.endMm } : null,
    ].filter((value): value is { endpoint: string; host: Extract<VerticalEndpoint, { kind: 'platform' }>; edgeId: string; pointMm: PointMm } => Boolean(value));
    hostedEndpoints.forEach(({ endpoint, host, edgeId, pointMm }) => {
      const platform = platformForEndpoint(design, host);
      const edgeLengthMm = platformEdgeLength(platform, edgeId);
      const openingWidthMm = projectedStairOpeningWidth(platform, edgeId, stair);
      const edgeT = edgeParameter(platform, edgeId, pointMm);
      const nearest = closestPointOnPlatformEdge(platform, edgeId, pointMm);
      if (nearest.distanceMm > 5) errors.push({ objectId: stair.id, message: `${stair.name} ${endpoint} connection is ${nearest.distanceMm} mm away from its host edge. Reattach the stair endpoint.` });
      if (openingWidthMm > edgeLengthMm) errors.push({ objectId: stair.id, message: `${stair.name} needs a ${openingWidthMm} mm stair opening, but the connected platform edge is only ${edgeLengthMm} mm long.` });
      else if (openingWidthMm / 2 > edgeLengthMm * edgeT || openingWidthMm / 2 > edgeLengthMm * (1 - edgeT)) errors.push({ objectId: stair.id, message: `${stair.name} ${endpoint} opening is too close to a platform corner for its ${openingWidthMm} mm projected header. Move the connection along the edge.` });
    });
    if (hostedEndpoints.length) warnings.push({ objectId: stair.id, message: `${stair.name} geometry is connected; its header, trimmers, stringer attachment, fasteners, bearing, and load path still require structural review.` });
    if (stair.from.kind === 'platform' && stair.to.kind === 'terrain') {
      const source = platformForEndpoint(design, stair.from);
      const sameLevelCandidate = design.platforms.find((platform) => platform.id !== source.id && platform.elevationMm === source.elevationMm && terrainStairLandingIntersection(stair, platform.boundary));
      if (sameLevelCandidate) warnings.push({ objectId: stair.id, message: `${stair.name} Point B aligns with ${sameLevelCandidate.name}, but both platforms are at ${source.elevationMm} mm. Lower ${sameLevelCandidate.name} by at least 125 mm to connect the stair to that layer.` });
    }
  });
  if (!design.platforms.length) warnings.push({ objectId: 'design', message: 'Draw the first deck platform.' });
  return { areaSqM: round(areaSqM, 3), errors, warnings };
}

/** Checks the actual hosted endpoint distance rather than trusting cached stair dimensions. */
export function assessStairPlanGeometry(design: DeckDesign, stair: DeckStair): PointToPointStairGeometry {
  const riseMm = Math.abs(endpointElevation(design, stair.from) - endpointElevation(design, stair.to));
  const runMm = Math.round(Math.hypot(stair.endMm[0] - stair.startMm[0], stair.endMm[1] - stair.startMm[1]));
  return calculatePointToPointStairGeometry(riseMm, runMm);
}

export function platformElevation(design: DeckDesign, platformId: string): number {
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  return platform.elevationMm;
}

export class DeckDesignError extends Error {
  constructor(public readonly code: 'invalid-boundary' | 'platform-not-found' | 'object-not-found' | 'stair-rise-too-small' | 'invalid-stair-rise' | 'invalid-stair-run' | 'invalid-stair-riser-count' | 'invalid-stair-tread' | 'invalid-stair-width' | 'invalid-stair-landing' | 'invalid-stair-stringers', message: string) {
    super(message);
    this.name = 'DeckDesignError';
  }
}

function edgeMidpoint(platform: DeckPlatform, edgeId: string): PointMm {
  const index = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
  const start = platform.boundary.vertices[index];
  const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
  return [Math.round((start.xMm + end.xMm) / 2), Math.round((start.yMm + end.yMm) / 2)];
}

function platformForEndpoint(design: DeckDesign, endpoint: Extract<VerticalEndpoint, { kind: 'platform' }>): DeckPlatform {
  const platform = design.platforms.find((candidate) => candidate.id === endpoint.platformId);
  if (!platform) throw new DeckDesignError('platform-not-found', `Platform ${endpoint.platformId} does not exist.`);
  return platform;
}

function edgeParameter(platform: DeckPlatform, edgeId: string, pointMm: PointMm): number {
  const index = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
  const start = platform.boundary.vertices[index];
  const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
  const dx = end.xMm - start.xMm;
  const dy = end.yMm - start.yMm;
  const lengthSquared = dx * dx + dy * dy;
  return Math.max(0, Math.min(1, lengthSquared ? ((pointMm[0] - start.xMm) * dx + (pointMm[1] - start.yMm) * dy) / lengthSquared : .5));
}

function pointAtEdgeParameter(platform: DeckPlatform, edgeId: string, t: number): PointMm {
  const index = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
  const start = platform.boundary.vertices[index];
  const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
  return [Math.round(start.xMm + (end.xMm - start.xMm) * t), Math.round(start.yMm + (end.yMm - start.yMm) * t)];
}

function stairLineIntersectionWithEdge(startMm: PointMm, directionDeg: number, platform: DeckPlatform, edgeId: string): PointMm | null {
  const index = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) throw new DeckDesignError('object-not-found', `Platform edge ${edgeId} does not exist.`);
  const edgeStart = platform.boundary.vertices[index];
  const edgeEnd = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
  return stairLineIntersectionWithSegment(startMm, directionDeg, [edgeStart.xMm, edgeStart.yMm], [edgeEnd.xMm, edgeEnd.yMm]);
}

function stairLineIntersectionWithSegment(startMm: PointMm, directionDeg: number, edgeStart: PointMm, edgeEnd: PointMm): PointMm | null {
  const radians = directionDeg * Math.PI / 180;
  const ray: PointMm = [Math.cos(radians), Math.sin(radians)];
  const segment: PointMm = [edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]];
  const offset: PointMm = [edgeStart[0] - startMm[0], edgeStart[1] - startMm[1]];
  const denominator = cross2d(ray, segment);
  if (Math.abs(denominator) < .000001) return null;
  const rayT = cross2d(offset, segment) / denominator;
  const edgeT = cross2d(offset, ray) / denominator;
  if (rayT <= 0 || edgeT < 0 || edgeT > 1) return null;
  return [Math.round(startMm[0] + ray[0] * rayT), Math.round(startMm[1] + ray[1] * rayT)];
}

function cross2d(first: PointMm, second: PointMm): number { return first[0] * second[1] - first[1] * second[0]; }

function stairLandingIntersection(stair: DeckStair, boundary: ClosedBoundary): { edgeIndex: number; pointMm: PointMm; distanceMm: number } | null {
  const candidates = boundary.vertices.flatMap((vertex, edgeIndex, vertices) => {
    const next = vertices[(edgeIndex + 1) % vertices.length];
    const pointMm = stairLineIntersectionWithSegment(stair.startMm, stair.directionDeg, [vertex.xMm, vertex.yMm], [next.xMm, next.yMm]);
    return pointMm ? [{ edgeIndex, pointMm, distanceMm: Math.round(Math.hypot(pointMm[0] - stair.endMm[0], pointMm[1] - stair.endMm[1])) }] : [];
  }).sort((first, second) => first.distanceMm - second.distanceMm);
  const nearest = candidates[0];
  if (!nearest) return null;
  return pointInBoundary(stair.endMm, boundary) || nearest.distanceMm <= stair.landingDepthMm ? nearest : null;
}

function terrainStairLandingIntersection(stair: DeckStair, boundary: ClosedBoundary): { edgeIndex: number; pointMm: PointMm; distanceMm: number } | null {
  return stair.to.kind === 'terrain' ? stairLandingIntersection(stair, boundary) : null;
}

/** Converts a yard endpoint into a hosted landing when a lower platform is placed under Point B. */
function rehostTerrainStairsToPlatform(design: DeckDesign, platformId: string): DeckDesign {
  const platform = design.platforms.find((candidate) => candidate.id === platformId);
  if (!platform) return design;
  const hostedEdgeIds = new Set<string>();
  const stairs = design.stairs.map((stair) => {
    if (stair.from.kind !== 'platform' || stair.to.kind !== 'terrain' || stair.from.platformId === platform.id) return stair;
    const sourcePlatformId = stair.from.platformId;
    const source = design.platforms.find((candidate) => candidate.id === sourcePlatformId);
    if (!source || source.elevationMm - platform.elevationMm < 125) return stair;
    const match = terrainStairLandingIntersection(stair, platform.boundary);
    const edgeId = match ? platform.edges[match.edgeIndex]?.id : null;
    if (!match || !edgeId) return stair;
    hostedEdgeIds.add(edgeId);
    const hosted = reconcileStairPlan({
      ...stair,
      to: { kind: 'platform', platformId: platform.id },
      toEdgeId: edgeId,
      toEdgeT: edgeParameter(platform, edgeId, match.pointMm),
      endMm: match.pointMm,
    });
    return recalculateStairElevation(design, hosted);
  });
  if (!hostedEdgeIds.size) return design;
  const platforms = design.platforms.map((candidate) => candidate.id === platform.id ? { ...candidate, edges: candidate.edges.map((edge) => hostedEdgeIds.has(edge.id) ? { ...edge, role: 'stair' as const } : edge) } : candidate);
  return { ...design, platforms, stairs };
}

function reanchorStairToPlatform(stair: DeckStair, previous: DeckPlatform, next: DeckPlatform): DeckStair {
  const fromAttached = stair.from.kind === 'platform' && stair.from.platformId === previous.id && Boolean(stair.fromEdgeId);
  const toAttached = stair.to.kind === 'platform' && stair.to.platformId === previous.id && Boolean(stair.toEdgeId);
  if (!fromAttached && !toAttached) return stair;
  const fromT = fromAttached && stair.fromEdgeId ? stair.fromEdgeT ?? edgeParameter(previous, stair.fromEdgeId, stair.startMm) : stair.fromEdgeT;
  const toT = toAttached && stair.toEdgeId ? stair.toEdgeT ?? edgeParameter(previous, stair.toEdgeId, stair.endMm) : stair.toEdgeT;
  let startMm = fromAttached && stair.fromEdgeId && fromT !== undefined ? pointAtEdgeParameter(next, stair.fromEdgeId, fromT) : stair.startMm;
  let endMm = toAttached && stair.toEdgeId && toT !== undefined ? pointAtEdgeParameter(next, stair.toEdgeId, toT) : stair.endMm;
  if (fromAttached && stair.to.kind === 'terrain') {
    endMm = [endMm[0] + startMm[0] - stair.startMm[0], endMm[1] + startMm[1] - stair.startMm[1]];
  } else if (toAttached && stair.from.kind === 'terrain') {
    startMm = [startMm[0] + endMm[0] - stair.endMm[0], startMm[1] + endMm[1] - stair.endMm[1]];
  }
  return reconcileStairPlan({ ...stair, startMm, endMm, ...(fromT === undefined ? {} : { fromEdgeT: fromT }), ...(toT === undefined ? {} : { toEdgeT: toT }) });
}

function updatePlatform(design: DeckDesign, platformId: string, update: (platform: DeckPlatform) => DeckPlatform, now: string): DeckDesign {
  let found = false;
  const platforms = design.platforms.map((platform) => {
    if (platform.id !== platformId) return platform;
    found = true;
    return update(platform);
  });
  if (!found) throw new DeckDesignError('platform-not-found', `Platform ${platformId} does not exist.`);
  return touch({ ...design, platforms }, now);
}

function endpointElevation(design: DeckDesign, endpoint: VerticalEndpoint): number {
  return endpoint.kind === 'terrain' ? integer(endpoint.elevationMm) : platformElevation(design, endpoint.platformId);
}

function endpointUsesPlatform(endpoint: VerticalEndpoint, platformId: string): boolean {
  return endpoint.kind === 'platform' && endpoint.platformId === platformId;
}

function recalculateStairElevation(design: DeckDesign, stair: DeckStair): DeckStair {
  const riseMm = Math.abs(endpointElevation(design, stair.from) - endpointElevation(design, stair.to));
  if (riseMm < 125) return stair;
  const requestedRunMm = Math.round(Math.hypot(stair.endMm[0] - stair.startMm[0], stair.endMm[1] - stair.startMm[1]));
  const geometry = proposePointToPointStairGeometry(riseMm, requestedRunMm);
  if (geometry.status !== 'valid' || geometry.riserCount === undefined || geometry.riserHeightMm === undefined || geometry.treadDepthMm === undefined) return stair;
  const radians = stair.directionDeg * Math.PI / 180;
  const endMm: PointMm = stair.to.kind === 'terrain'
    ? [Math.round(stair.startMm[0] + Math.cos(radians) * geometry.runMm), Math.round(stair.startMm[1] + Math.sin(radians) * geometry.runMm)]
    : stair.endMm;
  return reconcileStairPlan({ ...stair, endMm, riserCount: geometry.riserCount, riserHeightMm: geometry.riserHeightMm, treadDepthMm: geometry.treadDepthMm, totalRunMm: geometry.runMm });
}

/** Keeps cached stair dimensions synchronized with the physical A→B connection line. */
function reconcileStairPlan(stair: DeckStair): DeckStair {
  const runMm = Math.round(Math.hypot(stair.endMm[0] - stair.startMm[0], stair.endMm[1] - stair.startMm[1]));
  const directionDeg = runMm > 0 ? normalizeDegrees(Math.atan2(stair.endMm[1] - stair.startMm[1], stair.endMm[0] - stair.startMm[0]) * 180 / Math.PI) : stair.directionDeg;
  const treadCount = Math.max(0, stair.riserCount - 1);
  const treadDepthMm = treadCount ? Math.round(runMm / treadCount) : stair.treadDepthMm;
  return { ...stair, directionDeg, totalRunMm: runMm, treadDepthMm };
}

function platformEdgeLength(platform: DeckPlatform, edgeId: string): number {
  const index = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) return 0;
  const start = platform.boundary.vertices[index];
  const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
  return Math.round(Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm));
}

function closestPointOnPlatformEdge(platform: DeckPlatform, edgeId: string, pointMm: PointMm): { pointMm: PointMm; distanceMm: number } {
  const index = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) return { pointMm, distanceMm: Number.POSITIVE_INFINITY };
  const start = platform.boundary.vertices[index];
  const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
  const nearest = closestPointOnSegment(pointMm, [start.xMm, start.yMm], [end.xMm, end.yMm]);
  return { pointMm: nearest, distanceMm: Math.round(Math.hypot(nearest[0] - pointMm[0], nearest[1] - pointMm[1])) };
}

function projectedStairOpeningWidth(platform: DeckPlatform, edgeId: string, stair: DeckStair): number {
  const index = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) return stair.widthMm;
  const start = platform.boundary.vertices[index];
  const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
  const edgeRadians = Math.atan2(end.yMm - start.yMm, end.xMm - start.xMm);
  const stairRadians = stair.directionDeg * Math.PI / 180;
  const sine = Math.abs(Math.sin(stairRadians - edgeRadians));
  return Math.round(stair.widthMm / Math.max(.15, sine));
}

function rotateAttachedStair(stair: DeckStair, platformId: string, pivot: PointMm, deltaDeg: number): DeckStair {
  const fromSelected = endpointUsesPlatform(stair.from, platformId);
  const toSelected = endpointUsesPlatform(stair.to, platformId);
  if (!fromSelected && !toSelected) return stair;
  // A stair to grade is one assembly, so it follows its platform. Between platforms,
  // only the landing attached to the rotating platform moves; the opposite landing stays put.
  const rotateStart = fromSelected || (toSelected && stair.from.kind === 'terrain');
  const rotateEnd = toSelected || (fromSelected && stair.to.kind === 'terrain');
  const startMm = rotateStart ? rotatePoint(stair.startMm, pivot, deltaDeg) : stair.startMm;
  const endMm = rotateEnd ? rotatePoint(stair.endMm, pivot, deltaDeg) : stair.endMm;
  return reconcileStairPlan({ ...stair, startMm, endMm });
}

function rotatePoint(point: PointMm, pivot: PointMm, deltaDeg: number): PointMm {
  const radians = deltaDeg * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point[0] - pivot[0];
  const y = point[1] - pivot[1];
  return [Math.round(pivot[0] + x * cosine - y * sine), Math.round(pivot[1] + x * sine + y * cosine)];
}

function pointToVertex(point: PointMm): Pick<BoundaryVertex, 'xMm' | 'yMm'> { return { xMm: point[0], yMm: point[1] }; }

function pointInBoundary(point: PointMm, boundary: ClosedBoundary): boolean {
  let inside = false;
  boundary.vertices.forEach((vertex, index, vertices) => {
    const next = vertices[(index + 1) % vertices.length];
    if (distanceToSegment(point, [vertex.xMm, vertex.yMm], [next.xMm, next.yMm]) <= 1) inside = true;
    const crosses = (vertex.yMm > point[1]) !== (next.yMm > point[1])
      && point[0] < (next.xMm - vertex.xMm) * (point[1] - vertex.yMm) / (next.yMm - vertex.yMm) + vertex.xMm;
    if (crosses) inside = !inside;
  });
  return inside;
}

function closestPointOnSegment(point: PointMm, start: PointMm, end: PointMm): PointMm {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, lengthSquared ? ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared : 0));
  return [Math.round(start[0] + dx * t), Math.round(start[1] + dy * t)];
}

function distanceToSegment(point: PointMm, start: PointMm, end: PointMm): number {
  const closest = closestPointOnSegment(point, start, end);
  return Math.hypot(point[0] - closest[0], point[1] - closest[1]);
}

function createEdges(boundary: ClosedBoundary, platformId: string, houseEdgeIndex?: number): PlatformEdge[] {
  return boundary.vertices.map((_vertex, index) => ({
    id: `${platformId}-E${index + 1}`,
    startVertexId: `${platformId}-V${index + 1}`,
    endVertexId: `${platformId}-V${(index + 1) % boundary.vertices.length + 1}`,
    role: index === houseEdgeIndex ? 'house' : 'open',
  }));
}

function reconcileEdges(existing: PlatformEdge[], boundary: ClosedBoundary, platformId: string): PlatformEdge[] {
  return boundary.vertices.map((_vertex, index) => {
    const prior = existing[index];
    return {
      id: prior?.id || `${platformId}-E${index + 1}`,
      startVertexId: `${platformId}-V${index + 1}`,
      endVertexId: `${platformId}-V${(index + 1) % boundary.vertices.length + 1}`,
      role: prior?.role || 'open',
      ...(prior?.hostId ? { hostId: prior.hostId } : {}),
    };
  });
}

function cloneBoundary(boundary: ClosedBoundary, platformId: string): ClosedBoundary {
  return { ...boundary, vertices: boundary.vertices.map((vertex, index): BoundaryVertex => ({ ...vertex, id: `${platformId}-V${index + 1}` })) };
}

function touch(design: DeckDesign, now: string): DeckDesign { return { ...design, updatedAt: now }; }
function integer(value: number): number { if (!Number.isFinite(value)) throw new DeckDesignError('invalid-boundary', 'Design dimensions must be finite numbers.'); return Math.round(value); }
function normalizeDegrees(value: number): number { return ((value % 360) + 360) % 360; }
function round(value: number, decimals: number): number { const power = 10 ** decimals; return Math.round(value * power) / power; }
function nextId(prefix: string, ids: string[]): string { let index = 1; while (ids.includes(`${prefix}${index}`)) index += 1; return `${prefix}${index}`; }
