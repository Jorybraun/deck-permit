import type { DeckDesign, DeckPlatform, DeckStair, PointMm } from '../deckDesign';
import type { StairConnection, StairOpeningMember, StairTrimmerMember } from './types';

export interface StairConnectionFraming {
  openings: StairOpeningMember[];
  trimmers: StairTrimmerMember[];
  connections: StairConnection[];
}

/**
 * Derives traceable stair interfaces from hosted canonical endpoints.
 * Geometry is explicit; member capacity, hardware, and fastening remain professional-review work.
 */
export function generateStairConnectionFraming(design: DeckDesign): StairConnectionFraming {
  const openings: StairOpeningMember[] = [];
  const trimmers: StairTrimmerMember[] = [];
  const connections: StairConnection[] = [];

  design.stairs.forEach((stair) => {
    addEndpoint('from', stair, design, openings, trimmers, connections);
    addEndpoint('to', stair, design, openings, trimmers, connections);
  });
  return { openings, trimmers, connections };
}

function addEndpoint(endpoint: 'from' | 'to', stair: DeckStair, design: DeckDesign, openings: StairOpeningMember[], trimmers: StairTrimmerMember[], connections: StairConnection[]): void {
  const host = stair[endpoint];
  const pointMm = endpoint === 'from' ? stair.startMm : stair.endMm;
  if (host.kind === 'terrain') {
    connections.push({
      id: `${stair.id}-${endpoint.toUpperCase()}-CONN`, stairId: stair.id, endpoint, hostKind: 'terrain', pointMm,
      elevationMm: host.elevationMm, connectionType: 'stringer-to-grade-landing', receivingMemberIds: [], status: 'review-required',
      requirements: ['Level code-compliant landing at verified finished grade', 'Stringer bearing and positive anchorage', 'Drainage, frost movement, decay, and corrosion protection'],
    });
    return;
  }

  const platform = design.platforms.find((candidate) => candidate.id === host.platformId);
  const edgeId = endpoint === 'from' ? stair.fromEdgeId : stair.toEdgeId;
  if (!platform || !edgeId) return;
  const edgeIndex = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (edgeIndex < 0) return;
  const edgeStart = platform.boundary.vertices[edgeIndex];
  const edgeEnd = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
  const edgeVector: PointMm = [edgeEnd.xMm - edgeStart.xMm, edgeEnd.yMm - edgeStart.yMm];
  const edgeLength = Math.max(1, Math.hypot(edgeVector[0], edgeVector[1]));
  const edgeUnit: PointMm = [edgeVector[0] / edgeLength, edgeVector[1] / edgeLength];
  const stairVector: PointMm = [stair.endMm[0] - stair.startMm[0], stair.endMm[1] - stair.startMm[1]];
  const stairLength = Math.max(1, Math.hypot(stairVector[0], stairVector[1]));
  const stairUnit: PointMm = [stairVector[0] / stairLength, stairVector[1] / stairLength];
  const sine = Math.abs(cross(edgeUnit, stairUnit));
  const projectedWidthMm = Math.round(stair.widthMm / Math.max(.15, sine));
  const half = projectedWidthMm / 2;
  const headerStartMm: PointMm = [Math.round(pointMm[0] - edgeUnit[0] * half), Math.round(pointMm[1] - edgeUnit[1] * half)];
  const headerEndMm: PointMm = [Math.round(pointMm[0] + edgeUnit[0] * half), Math.round(pointMm[1] + edgeUnit[1] * half)];
  const skewDeg = Math.round(Math.acos(Math.min(1, sine)) * 180 / Math.PI * 10) / 10;
  const openingId = `${stair.id}-${endpoint.toUpperCase()}-HDR`;
  const opening: StairOpeningMember = {
    id: openingId, stairId: stair.id, endpoint, platformId: platform.id, edgeId, centerMm: pointMm,
    clearWidthMm: stair.widthMm, projectedWidthMm, skewDeg, headerStartMm, headerEndMm,
    headerSection: 'Engineer design', status: 'review-required',
  };
  openings.push(opening);

  const inward = inwardNormal(platform, edgeUnit);
  const trimmerLengthMm = 600;
  const left: StairTrimmerMember = {
    id: `${stair.id}-${endpoint.toUpperCase()}-TR-L`, stairId: stair.id, openingId, platformId: platform.id, side: 'left',
    startMm: headerStartMm, endMm: translate(headerStartMm, inward, trimmerLengthMm), lengthMm: trimmerLengthMm,
    section: 'Engineer design', status: 'review-required',
  };
  const right: StairTrimmerMember = {
    id: `${stair.id}-${endpoint.toUpperCase()}-TR-R`, stairId: stair.id, openingId, platformId: platform.id, side: 'right',
    startMm: headerEndMm, endMm: translate(headerEndMm, inward, trimmerLengthMm), lengthMm: trimmerLengthMm,
    section: 'Engineer design', status: 'review-required',
  };
  trimmers.push(left, right);
  connections.push({
    id: `${stair.id}-${endpoint.toUpperCase()}-CONN`, stairId: stair.id, endpoint, hostKind: 'platform-edge', platformId: platform.id, edgeId,
    pointMm, elevationMm: platform.elevationMm, connectionType: endpoint === 'from' ? 'stringer-to-header' : 'stringer-to-landing-edge',
    receivingMemberIds: [opening.id, left.id, right.id], status: 'review-required',
    requirements: ['Header and doubled-trimmer capacity for stair reactions', 'Stringer hanger, bearing seat, or approved attachment detail', 'Fastener schedule, edge distances, blocking, and corrosion class'],
  });
}

function inwardNormal(platform: DeckPlatform, edgeUnit: PointMm): PointMm {
  const signedArea = platform.boundary.vertices.reduce((sum, vertex, index, vertices) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + vertex.xMm * next.yMm - next.xMm * vertex.yMm;
  }, 0);
  return signedArea >= 0 ? [-edgeUnit[1], edgeUnit[0]] : [edgeUnit[1], -edgeUnit[0]];
}

function translate(point: PointMm, direction: PointMm, distanceMm: number): PointMm {
  return [Math.round(point[0] + direction[0] * distanceMm), Math.round(point[1] + direction[1] * distanceMm)];
}

function cross(first: PointMm, second: PointMm): number { return first[0] * second[1] - first[1] * second[0]; }
