import type { DeckDesign, PointMm } from '../deckDesign';
import type { LocalPropertyGeometry } from './propertyGeometry';

export const SITE_CLEARANCE_SCHEMA = 'site-clearance/v1' as const;

export interface SiteClearanceDimension {
  id: string;
  platformId: string;
  parcelEdgeIndex: number;
  distanceMm: number;
  deckPointMm: PointMm;
  propertyPointMm: PointMm;
}

export interface SiteClearanceAssessment {
  schema: typeof SITE_CLEARANCE_SCHEMA;
  authority: 'municipal-gis-reference';
  status: 'reference-only' | 'outside-or-crossing' | 'unavailable';
  dimensions: SiteClearanceDimension[];
  minimumDistanceMm: number | null;
  allDeckVerticesInsideReferenceParcel: boolean | null;
  limitation: string;
}

/** Derives written reference offsets without upgrading municipal GIS into a legal survey. */
export function calculateSiteClearances(geometry: LocalPropertyGeometry | null, design: DeckDesign): SiteClearanceAssessment {
  const limitation = 'Municipal parcel geometry is reference evidence only. Confirm property-line and footing offsets by accepted survey or field measurement before submission.';
  if (!geometry || geometry.parcel.length < 3 || !design.platforms.length) return { schema: SITE_CLEARANCE_SCHEMA, authority: 'municipal-gis-reference', status: 'unavailable', dimensions: [], minimumDistanceMm: null, allDeckVerticesInsideReferenceParcel: null, limitation };
  const parcel = openRing(geometry.parcel);
  const allDeckVerticesInsideReferenceParcel = design.platforms.every((platform) => platform.boundary.vertices.every((vertex) => pointInPolygon([vertex.xMm, vertex.yMm], parcel)));
  const candidates = parcel.map((start, parcelEdgeIndex) => {
    const end = parcel[(parcelEdgeIndex + 1) % parcel.length];
    let closest: SiteClearanceDimension | null = null;
    design.platforms.forEach((platform) => platform.boundary.vertices.forEach((vertex, deckEdgeIndex, vertices) => {
      const next = vertices[(deckEdgeIndex + 1) % vertices.length];
      const pair = closestSegmentPair([vertex.xMm, vertex.yMm], [next.xMm, next.yMm], start, end);
      if (!closest || pair.distanceMm < closest.distanceMm) closest = { id: `${platform.id}-PL${parcelEdgeIndex + 1}`, platformId: platform.id, parcelEdgeIndex, distanceMm: pair.distanceMm, deckPointMm: pair.first, propertyPointMm: pair.second };
    }));
    return closest!;
  });
  const selected = (candidates.length <= 8 ? candidates : [...candidates].sort((a, b) => a.distanceMm - b.distanceMm).slice(0, 6)).sort((a, b) => a.parcelEdgeIndex - b.parcelEdgeIndex);
  const minimumDistanceMm = selected.length ? Math.min(...selected.map((item) => item.distanceMm)) : null;
  const crosses = !allDeckVerticesInsideReferenceParcel || candidates.some((item) => item.distanceMm === 0);
  return { schema: SITE_CLEARANCE_SCHEMA, authority: 'municipal-gis-reference', status: crosses ? 'outside-or-crossing' : 'reference-only', dimensions: selected, minimumDistanceMm, allDeckVerticesInsideReferenceParcel, limitation };
}

function openRing(points: PointMm[]): PointMm[] {
  const first = points[0]; const last = points[points.length - 1];
  return points.length > 1 && first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
}

function pointInPolygon(point: PointMm, polygon: PointMm[]): boolean {
  let inside = false;
  for (let first = polygon.length - 1, second = 0; second < polygon.length; first = second, second += 1) {
    const a = polygon[first]; const b = polygon[second];
    if (pointOnSegment(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function closestSegmentPair(a: PointMm, b: PointMm, c: PointMm, d: PointMm): { first: PointMm; second: PointMm; distanceMm: number } {
  const intersection = segmentIntersection(a, b, c, d);
  if (intersection) return { first: intersection, second: intersection, distanceMm: 0 };
  const choices = [
    pair(a, closestPointOnSegment(a, c, d)), pair(b, closestPointOnSegment(b, c, d)),
    reversePair(c, closestPointOnSegment(c, a, b)), reversePair(d, closestPointOnSegment(d, a, b)),
  ];
  return choices.sort((first, second) => first.distanceMm - second.distanceMm)[0];
}

function pair(first: PointMm, second: PointMm) { return { first, second, distanceMm: Math.round(Math.hypot(first[0] - second[0], first[1] - second[1])) }; }
function reversePair(second: PointMm, first: PointMm) { return pair(first, second); }
function closestPointOnSegment(point: PointMm, start: PointMm, end: PointMm): PointMm { const dx = end[0] - start[0]; const dy = end[1] - start[1]; const lengthSquared = dx * dx + dy * dy; const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)) : 0; return [Math.round(start[0] + t * dx), Math.round(start[1] + t * dy)]; }
function pointOnSegment(point: PointMm, start: PointMm, end: PointMm): boolean { const cross = (point[0] - start[0]) * (end[1] - start[1]) - (point[1] - start[1]) * (end[0] - start[0]); return Math.abs(cross) < 1 && point[0] >= Math.min(start[0], end[0]) && point[0] <= Math.max(start[0], end[0]) && point[1] >= Math.min(start[1], end[1]) && point[1] <= Math.max(start[1], end[1]); }
function segmentIntersection(a: PointMm, b: PointMm, c: PointMm, d: PointMm): PointMm | null { const denominator = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]); if (Math.abs(denominator) < 1e-9) return null; const first = a[0] * b[1] - a[1] * b[0]; const second = c[0] * d[1] - c[1] * d[0]; const x = (first * (c[0] - d[0]) - (a[0] - b[0]) * second) / denominator; const y = (first * (c[1] - d[1]) - (a[1] - b[1]) * second) / denominator; return pointOnSegment([x, y], a, b) && pointOnSegment([x, y], c, d) ? [Math.round(x), Math.round(y)] : null; }
