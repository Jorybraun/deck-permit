import type { DeckDesign, PointMm } from '../deckDesign';
import type { Property } from '../../types';
import { calculateSiteClearances } from './siteClearance';
import type { LocalPropertyGeometry } from './propertyGeometry';
import type { SiteModel } from './types';

export const SITE_COMPLIANCE_SCHEMA = 'site-compliance/v1' as const;

export interface ReferenceSetbackCheck {
  parcelEdgeIndex: number;
  yard: 'front' | 'rear' | 'interior-side' | 'exterior-side';
  requiredMm: number;
  referenceDistanceMm: number;
  status: 'reference-pass' | 'reference-fail';
}

export interface SiteComplianceAssessment {
  schema: typeof SITE_COMPLIANCE_SCHEMA;
  authority: 'municipal-gis-and-proposed-model-reference';
  scope: 'platform-footprints-only';
  setbackStatus: 'reference-pass' | 'reference-fail' | 'orientation-required' | 'unavailable';
  setbackChecks: ReferenceSetbackCheck[];
  coverage: {
    existingBuildingFootprintSqM: number | null;
    proposedPlatformFootprintSqM: number | null;
    combinedReferenceFootprintSqM: number | null;
    lotAreaSqM: number | null;
    referenceCoveragePercent: number | null;
    maximumCoveragePercent: number | null;
    status: 'reference-within-limit' | 'reference-exceeds-limit' | 'interpretation-required' | 'unavailable';
  };
  limitations: string[];
}

/** Produces a traceable zoning screen without claiming a planning interpretation. */
export function assessSiteCompliance(property: Property, geometry: LocalPropertyGeometry | null, site: SiteModel, design: DeckDesign): SiteComplianceAssessment {
  const zoning = property.zoning;
  const clearance = calculateSiteClearances(geometry, design);
  const limitations = [
    'Municipal parcel and building polygons are GIS reference evidence, not a legal survey or foundation measurement.',
    'Setback checks cover platform polygons only. Stairs, landings, guards, eaves, projections, easements, rights-of-way, and permitted encroachments require municipal interpretation.',
    'Coverage uses the union of municipal building reference polygons and proposed platform polygons; the authority must confirm which deck components count as lot coverage.',
  ];
  const emptyCoverage: SiteComplianceAssessment['coverage'] = { existingBuildingFootprintSqM: null, proposedPlatformFootprintSqM: null, combinedReferenceFootprintSqM: null, lotAreaSqM: property.parcel?.areaSqm || null, referenceCoveragePercent: null, maximumCoveragePercent: zoning?.maxLotCoverage ?? null, status: 'unavailable' };
  if (!geometry || !property.parcel) return { schema: SITE_COMPLIANCE_SCHEMA, authority: 'municipal-gis-and-proposed-model-reference', scope: 'platform-footprints-only', setbackStatus: 'unavailable', setbackChecks: [], coverage: emptyCoverage, limitations };

  const platformPolygons = design.platforms.map((platform) => platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm]));
  const buildingPolygons = geometry.buildings.map((building) => building.polygon);
  const existingBuildingFootprintSqM = round(polygonUnionAreaMm2(buildingPolygons) / 1_000_000, 2);
  const proposedPlatformFootprintSqM = round(polygonUnionAreaMm2(platformPolygons) / 1_000_000, 2);
  const combinedReferenceFootprintSqM = round(polygonUnionAreaMm2([...buildingPolygons, ...platformPolygons]) / 1_000_000, 2);
  const lotAreaSqM = property.parcel.areaSqm || polygonUnionAreaMm2([geometry.parcel]) / 1_000_000;
  const referenceCoveragePercent = lotAreaSqM > 0 ? round(combinedReferenceFootprintSqM / lotAreaSqM * 100, 2) : null;
  const maximumCoveragePercent = zoning?.maxLotCoverage ?? null;
  const coverageStatus = referenceCoveragePercent === null ? 'unavailable' : maximumCoveragePercent === null ? 'interpretation-required' : referenceCoveragePercent > maximumCoveragePercent ? 'reference-exceeds-limit' : 'reference-within-limit';
  const coverage = { existingBuildingFootprintSqM, proposedPlatformFootprintSqM, combinedReferenceFootprintSqM, lotAreaSqM: round(lotAreaSqM, 2), referenceCoveragePercent, maximumCoveragePercent, status: coverageStatus } satisfies SiteComplianceAssessment['coverage'];

  if (!zoning || clearance.status === 'unavailable') return { schema: SITE_COMPLIANCE_SCHEMA, authority: 'municipal-gis-and-proposed-model-reference', scope: 'platform-footprints-only', setbackStatus: 'unavailable', setbackChecks: [], coverage, limitations };
  const frontEdgeIndex = site.yardReference.frontEdgeIndex;
  const rearEdgeIndex = site.yardReference.rearEdgeIndex;
  if (site.yardReference.status === 'unselected' || frontEdgeIndex === null || rearEdgeIndex === null || frontEdgeIndex === rearEdgeIndex || frontEdgeIndex >= clearance.dimensions.length || rearEdgeIndex >= clearance.dimensions.length) return { schema: SITE_COMPLIANCE_SCHEMA, authority: 'municipal-gis-and-proposed-model-reference', scope: 'platform-footprints-only', setbackStatus: 'orientation-required', setbackChecks: [], coverage, limitations };
  const setbackChecks = clearance.dimensions.map((dimension): ReferenceSetbackCheck => {
    const yard = dimension.parcelEdgeIndex === frontEdgeIndex ? 'front' : dimension.parcelEdgeIndex === site.yardReference.exteriorSideEdgeIndex ? 'exterior-side' : dimension.parcelEdgeIndex === rearEdgeIndex ? 'rear' : 'interior-side';
    const requiredM = yard === 'front' ? zoning.setbacks.front : yard === 'rear' ? zoning.setbacks.rear : yard === 'exterior-side' ? zoning.setbacks.exteriorSide : zoning.setbacks.side;
    const requiredMm = Math.round(requiredM * 1000);
    return { parcelEdgeIndex: dimension.parcelEdgeIndex, yard, requiredMm, referenceDistanceMm: dimension.distanceMm, status: dimension.distanceMm >= requiredMm ? 'reference-pass' : 'reference-fail' };
  });
  return { schema: SITE_COMPLIANCE_SCHEMA, authority: 'municipal-gis-and-proposed-model-reference', scope: 'platform-footprints-only', setbackStatus: setbackChecks.every((check) => check.status === 'reference-pass') ? 'reference-pass' : 'reference-fail', setbackChecks, coverage, limitations };
}

/** Exact scanline union area for simple straight-edged polygons in model millimetres. */
export function polygonUnionAreaMm2(source: PointMm[][]): number {
  const polygons = source.map(openRing).filter((polygon) => polygon.length >= 3);
  if (!polygons.length) return 0;
  const edges = polygons.flatMap((polygon) => polygon.map((start, index) => [start, polygon[(index + 1) % polygon.length]] as const));
  const xBreaks = new Set<number>(polygons.flatMap((polygon) => polygon.map((point) => point[0])));
  for (let first = 0; first < edges.length; first += 1) for (let second = first + 1; second < edges.length; second += 1) {
    const x = intersectionX(edges[first][0], edges[first][1], edges[second][0], edges[second][1]);
    if (x !== null) xBreaks.add(x);
  }
  const xs = [...xBreaks].sort((a, b) => a - b);
  let area = 0;
  for (let index = 0; index + 1 < xs.length; index += 1) {
    const left = xs[index]; const right = xs[index + 1];
    if (right - left < 1e-7) continue;
    const x = (left + right) / 2;
    const intervals = polygons.flatMap((polygon) => verticalIntervals(polygon, x)).sort((a, b) => a[0] - b[0]);
    let unionLength = 0; let active: [number, number] | null = null;
    intervals.forEach((interval) => { if (!active) active = [...interval]; else if (interval[0] <= active[1]) active[1] = Math.max(active[1], interval[1]); else { unionLength += active[1] - active[0]; active = [...interval]; } });
    if (active) unionLength += active[1] - active[0];
    area += unionLength * (right - left);
  }
  return Math.round(area);
}

function verticalIntervals(polygon: PointMm[], x: number): Array<[number, number]> {
  const ys: number[] = [];
  polygon.forEach((start, index) => { const end = polygon[(index + 1) % polygon.length]; if ((start[0] < x && end[0] > x) || (end[0] < x && start[0] > x)) ys.push(start[1] + (x - start[0]) * (end[1] - start[1]) / (end[0] - start[0])); });
  ys.sort((a, b) => a - b);
  const result: Array<[number, number]> = [];
  for (let index = 0; index + 1 < ys.length; index += 2) result.push([ys[index], ys[index + 1]]);
  return result;
}
function intersectionX(a: PointMm, b: PointMm, c: PointMm, d: PointMm): number | null { const denominator = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]); if (Math.abs(denominator) < 1e-9) return null; const first = a[0] * b[1] - a[1] * b[0]; const second = c[0] * d[1] - c[1] * d[0]; const x = (first * (c[0] - d[0]) - (a[0] - b[0]) * second) / denominator; const y = (first * (c[1] - d[1]) - (a[1] - b[1]) * second) / denominator; return within(x, a[0], b[0]) && within(y, a[1], b[1]) && within(x, c[0], d[0]) && within(y, c[1], d[1]) ? x : null; }
function within(value: number, first: number, second: number): boolean { return value >= Math.min(first, second) - 1e-7 && value <= Math.max(first, second) + 1e-7; }
function openRing(points: PointMm[]): PointMm[] { return points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1] ? points.slice(0, -1) : points; }
function round(value: number, precision: number): number { const scale = 10 ** precision; return Math.round(value * scale) / scale; }
