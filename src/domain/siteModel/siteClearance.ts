import type { DeckDesign, PointMm } from '../deckDesign';
import type { FramingDesign } from '../framingDesign';
import type { LocalPropertyGeometry } from './propertyGeometry';
import { deriveProposedSiteComponents, type ProposedSiteComponentKind } from './proposedSiteComponents';

export const SITE_CLEARANCE_SCHEMA = 'site-clearance/v2' as const;

export interface SiteClearanceDimension {
  id: string;
  componentId: string;
  componentKind: ProposedSiteComponentKind;
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
  allProposedWorkVerticesInsideReferenceParcel: boolean | null;
  limitation: string;
}

/** Derives written reference offsets without upgrading municipal GIS into a legal survey. */
export function calculateSiteClearances(geometry: LocalPropertyGeometry | null, design: DeckDesign, framing?: FramingDesign | null): SiteClearanceAssessment {
  const limitation = 'Municipal parcel geometry is reference evidence only. Dimensions screen modeled platforms, stair flights, grade landings, and generated footing pads. Confirm every property-line and footing offset by accepted survey or field measurement before submission.';
  const components = deriveProposedSiteComponents(design, framing);
  if (!geometry || geometry.parcel.length < 3 || !components.length) return { schema: SITE_CLEARANCE_SCHEMA, authority: 'municipal-gis-reference', status: 'unavailable', dimensions: [], minimumDistanceMm: null, allProposedWorkVerticesInsideReferenceParcel: null, limitation };
  const parcel = openRing(geometry.parcel);
  const allProposedWorkVerticesInsideReferenceParcel = components.every((component) => component.polygon.every((point) => pointInPolygon(point, parcel)));
  const candidates = parcel.map((start, parcelEdgeIndex) => {
    const end = parcel[(parcelEdgeIndex + 1) % parcel.length];
    let closest: SiteClearanceDimension | null = null;
    components.forEach((component) => component.polygon.forEach((point, componentEdgeIndex, points) => {
      const next = points[(componentEdgeIndex + 1) % points.length];
      const pair = closestSegmentPair(point, next, start, end);
      if (!closest || pair.distanceMm < closest.distanceMm) closest = { id: `${component.id}-PL${parcelEdgeIndex + 1}`, componentId: component.id, componentKind: component.kind, parcelEdgeIndex, distanceMm: pair.distanceMm, deckPointMm: pair.first, propertyPointMm: pair.second };
    }));
    return closest!;
  });
  const selected = [...candidates].sort((a, b) => a.parcelEdgeIndex - b.parcelEdgeIndex);
  const minimumDistanceMm = selected.length ? Math.min(...selected.map((item) => item.distanceMm)) : null;
  const crosses = !allProposedWorkVerticesInsideReferenceParcel || candidates.some((item) => item.distanceMm === 0);
  return { schema: SITE_CLEARANCE_SCHEMA, authority: 'municipal-gis-reference', status: crosses ? 'outside-or-crossing' : 'reference-only', dimensions: selected, minimumDistanceMm, allProposedWorkVerticesInsideReferenceParcel, limitation };
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
