import type { PointMm } from '../deckDesign';
import type { Property } from '../../types';
import type { LocalPropertyGeometry } from './propertyGeometry';
import type { SiteModel } from './types';

export const SETBACK_GUIDES_SCHEMA = 'reference-setback-guides/v1' as const;
export type ReferenceYard = 'front' | 'rear' | 'interior-side' | 'exterior-side';

export interface ReferenceSetbackGuide {
  id: string;
  parcelEdgeIndex: number;
  yard: ReferenceYard;
  requiredMm: number;
  propertyStartMm: PointMm;
  propertyEndMm: PointMm;
  guideStartMm: PointMm;
  guideEndMm: PointMm;
  bandPolygon: PointMm[];
  authority: 'recorded-zoning-reference';
  source: string;
}

// Town of Sidney Zoning Bylaw No. 2275, §5.1.6.b — an unenclosed, uncovered deck/landing
// no more than 1.2 m above grade may project into a required yard (3.0 m where the setback is
// ≥4.5 m, 1.5 m where it is <4.5 m), provided it stays ≥1.5 m from any lot line.
export const DECK_PROJECTION_MAX_HEIGHT_MM = 1200;
const DECK_MIN_FROM_LOT_LINE_MM = 1500;
export function deckEffectiveSetbackMm(requiredMm: number): number {
  const projectionMm = requiredMm >= 4500 ? 3000 : 1500;
  return Math.max(requiredMm - projectionMm, DECK_MIN_FROM_LOT_LINE_MM);
}

/**
 * Creates independent per-edge reference guides. These are intentionally not
 * joined into a fake buildable polygon: corner intersections, projections,
 * easements, and municipal interpretations remain separate review conditions.
 * `setbackMm` optionally overrides the strict zoning distance per yard (used to draw the
 * more generous low-deck projection envelope).
 */
export function deriveReferenceSetbackGuides(property: Property, geometry: LocalPropertyGeometry | null, site: SiteModel, setbackMm?: (yard: ReferenceYard, strictMm: number) => number): ReferenceSetbackGuide[] {
  const zoning = property.zoning;
  if (!geometry || !zoning || site.yardReference.status === 'unselected') return [];
  const front = site.yardReference.frontEdgeIndex;
  const rear = site.yardReference.rearEdgeIndex;
  const parcel = openRing(geometry.parcel);
  if (front === null || rear === null || front === rear || front >= parcel.length || rear >= parcel.length) return [];
  return parcel.map((start, parcelEdgeIndex): ReferenceSetbackGuide => {
    const end = parcel[(parcelEdgeIndex + 1) % parcel.length];
    const yard = parcelEdgeIndex === front ? 'front' : parcelEdgeIndex === site.yardReference.exteriorSideEdgeIndex ? 'exterior-side' : parcelEdgeIndex === rear ? 'rear' : 'interior-side';
    const requiredM = yard === 'front' ? zoning.setbacks.front : yard === 'rear' ? zoning.setbacks.rear : yard === 'exterior-side' ? zoning.setbacks.exteriorSide : zoning.setbacks.side;
    const strictMm = Math.round(requiredM * 1000);
    const requiredMm = setbackMm ? setbackMm(yard, strictMm) : strictMm;
    const inward = inwardNormal(start, end, parcel);
    const guideStartMm = offset(start, inward, requiredMm);
    const guideEndMm = offset(end, inward, requiredMm);
    return {
      id: `PL-${parcelEdgeIndex + 1}-${yard.toUpperCase()}-SETBACK`,
      parcelEdgeIndex,
      yard,
      requiredMm,
      propertyStartMm: start,
      propertyEndMm: end,
      guideStartMm,
      guideEndMm,
      bandPolygon: [start, end, guideEndMm, guideStartMm],
      authority: 'recorded-zoning-reference',
      source: zoning.source,
    };
  });
}

/**
 * The low-deck projection envelope (§5.1.6.b). Returns [] for a raised deck (>1.2 m above
 * grade) since it gets no projection allowance, and only includes edges where a low deck
 * may actually reach past the strict setback.
 */
export function deriveDeckSetbackGuides(property: Property, geometry: LocalPropertyGeometry | null, site: SiteModel, deckHeightMm: number): ReferenceSetbackGuide[] {
  if (deckHeightMm > DECK_PROJECTION_MAX_HEIGHT_MM) return [];
  const strict = deriveReferenceSetbackGuides(property, geometry, site);
  const deck = deriveReferenceSetbackGuides(property, geometry, site, (_yard, strictMm) => deckEffectiveSetbackMm(strictMm));
  return deck.filter((guide, index) => strict[index] && guide.requiredMm < strict[index].requiredMm);
}

function inwardNormal(start: PointMm, end: PointMm, polygon: PointMm[]): PointMm {
  const dx = end[0] - start[0]; const dy = end[1] - start[1];
  const length = Math.max(1, Math.hypot(dx, dy));
  const left: PointMm = [-dy / length, dx / length];
  const right: PointMm = [dy / length, -dx / length];
  const midpoint: PointMm = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const probeDistance = Math.max(10, Math.min(250, length * .01));
  const leftProbe = offset(midpoint, left, probeDistance);
  const rightProbe = offset(midpoint, right, probeDistance);
  if (pointInPolygon(leftProbe, polygon) && !pointInPolygon(rightProbe, polygon)) return left;
  if (pointInPolygon(rightProbe, polygon) && !pointInPolygon(leftProbe, polygon)) return right;
  const center = averagePoint(polygon);
  const towardCenter: PointMm = [center[0] - midpoint[0], center[1] - midpoint[1]];
  return towardCenter[0] * left[0] + towardCenter[1] * left[1] >= 0 ? left : right;
}

function pointInPolygon(point: PointMm, polygon: PointMm[]): boolean {
  let inside = false;
  for (let previous = polygon.length - 1, index = 0; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous]; const b = polygon[index];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function offset(point: PointMm, direction: PointMm, distanceMm: number): PointMm {
  return [Math.round(point[0] + direction[0] * distanceMm), Math.round(point[1] + direction[1] * distanceMm)];
}

function averagePoint(points: PointMm[]): PointMm {
  const count = Math.max(1, points.length);
  return [points.reduce((sum, point) => sum + point[0], 0) / count, points.reduce((sum, point) => sum + point[1], 0) / count];
}

function openRing(points: PointMm[]): PointMm[] {
  return points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1] ? points.slice(0, -1) : points;
}
