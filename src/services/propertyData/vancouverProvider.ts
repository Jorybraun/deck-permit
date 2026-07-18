import type { Address, BuildingFootprint, EvidenceSource, LatLng, Parcel } from '../../types';
import type { PropertyDataProvider, PropertyDataResult } from './types';
import { PropertyDataError } from './types';

const API_ROOT = 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets';
export const VANCOUVER_PARCELS = 'https://opendata.vancouver.ca/explore/dataset/property-parcel-polygons/';
export const VANCOUVER_BUILDINGS = 'https://opendata.vancouver.ca/explore/dataset/building-footprints-2015/';

interface VancouverRecord {
  civic_number?: string;
  streetname?: string;
  tax_coord?: string;
  site_id?: string;
  object_id?: number;
  geom?: { type?: string; geometry?: { type?: string; coordinates?: unknown } };
}

interface RecordsResponse {
  results?: VancouverRecord[];
}

/** City-owned parcel geometry for Vancouver, where ParcelMap BC has coverage gaps. */
export class VancouverPropertyProvider implements PropertyDataProvider {
  readonly id = 'city-of-vancouver-open-data';
  readonly version = '1.0';
  private readonly fetcher: typeof fetch;

  constructor(fetcher?: typeof fetch) {
    this.fetcher = fetcher || ((input, init) => fetch(input, init));
  }

  supports(address: Address): boolean {
    return address.locality.trim().toLowerCase() === 'vancouver';
  }

  async lookup(address: Address): Promise<PropertyDataResult> {
    if (!this.supports(address)) throw new PropertyDataError('unsupported-jurisdiction', `${address.locality} is not supported by this provider.`, this.id);
    const [lng, lat] = address.coordinates;
    const parcelRecords = await this.query('property-parcel-polygons', `within_distance(geom, geom'POINT(${lng} ${lat})', 20m)`, 20);
    const parcelCandidate = parcelRecords
      .map((record) => ({ record, ring: polygonRing(record.geom) }))
      .find(({ ring }) => ring.length >= 4 && pointInPolygon(lng, lat, ring));
    if (!parcelCandidate) throw new PropertyDataError('not-found', `The City of Vancouver parcel layer did not return a parcel containing ${address.fullAddress}.`, this.id);

    const { record } = parcelCandidate;
    const relatedRecords = record.tax_coord
      ? (await this.query('property-parcel-polygons', `tax_coord="${record.tax_coord.replace(/[^0-9A-Za-z]/g, '')}"`, 100)).filter((candidate) => candidate.tax_coord === record.tax_coord)
      : [record];
    const relatedRings = relatedRecords.map((candidate) => polygonRing(candidate.geom)).filter((candidate) => candidate.length >= 4);
    const ring = relatedRings.length > 1 ? convexHull(relatedRings.flat()) : relatedRings[0] || parcelCandidate.ring;
    const siteIds = relatedRecords.map((candidate) => candidate.site_id || '').filter(Boolean);
    const siteId = siteIds[0] || '';
    const parcel: Parcel = {
      pid: siteIds.length > 1 ? `${siteIds.length} sites · tax ${record.tax_coord}` : formatPid(siteId),
      pidRaw: siteIds.join(','),
      parcelName: `${record.civic_number || address.civicNumber} ${record.streetname || address.streetName}`.trim(),
      planNumber: '',
      municipality: 'City of Vancouver',
      ownerType: 'Not provided by municipal open data',
      parcelClass: 'Municipal assessment parcel polygon',
      areaSqm: polygonAreaApprox(ring),
      polygon: ring,
      center: polygonCenter(ring),
      geometrySource: 'live',
      sourceUrl: VANCOUVER_PARCELS,
    };

    const bounds = polygonBounds(ring);
    const radiusM = Math.max(30, Math.ceil(distanceM(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat)));
    const buildingRecords = await this.query('building-footprints-2015', `within_distance(geom, geom'POINT(${parcel.center[0]} ${parcel.center[1]})', ${radiusM}m)`, 100);
    const buildings: BuildingFootprint[] = buildingRecords
      .map((candidate, index) => ({ candidate, index, ring: polygonRing(candidate.geom) }))
      .filter(({ ring: footprint }) => footprint.length >= 4 && pointInPolygon(polygonCenter(footprint)[0], polygonCenter(footprint)[1], ring))
      .map(({ candidate, index, ring: footprint }) => ({
        id: `vancouver-building-${candidate.object_id ?? index}`,
        polygon: footprint,
        areaSqm: polygonAreaApprox(footprint),
        kind: 'building-footprint' as const,
        primary: false,
        sourceId: 'vancouver-building-footprints-2015',
        confidence: 'medium' as const,
      }))
      .sort((left, right) => right.areaSqm - left.areaSqm)
      .map((building, index) => ({ ...building, primary: index === 0 }));

    const retrievedAt = new Date().toISOString();
    const evidence: EvidenceSource[] = [
      {
        id: 'vancouver-property-parcels',
        label: 'City of Vancouver Property Parcel Polygons',
        url: VANCOUVER_PARCELS,
        authority: 'municipal',
        retrievedAt,
        status: 'authoritative',
        notes: `${relatedRings.length} municipal site polygon${relatedRings.length === 1 ? '' : 's'} grouped by assessment tax coordinate; updated weekly. A field or legal survey still governs construction dimensions.`,
      },
      {
        id: 'vancouver-building-footprints-2015',
        label: 'City of Vancouver Building Footprints 2015',
        url: VANCOUVER_BUILDINGS,
        authority: 'municipal',
        retrievedAt,
        status: 'reference',
        notes: buildings.length ? 'Approximate 2015 building footprint reference; confirm additions, eaves, and wall dimensions on site.' : 'No 2015 building footprint was found inside the parcel; the house outline must be measured or supplied from another source.',
      },
    ];
    return { parcel, buildings, evidence };
  }

  private async query(dataset: string, where: string, limit: number): Promise<VancouverRecord[]> {
    const url = new URL(`${API_ROOT}/${dataset}/records`);
    url.search = new URLSearchParams({ where, limit: String(limit) }).toString();
    let response: Response;
    try { response = await this.fetcher(url); } catch (cause) {
      throw new PropertyDataError('provider-unavailable', 'The City of Vancouver open-data service could not be reached.', this.id, { cause });
    }
    if (!response.ok) throw new PropertyDataError('provider-unavailable', `The City of Vancouver open-data service returned HTTP ${response.status}.`, this.id);
    const data = await response.json() as RecordsResponse;
    if (!Array.isArray(data.results)) throw new PropertyDataError('invalid-response', 'The City of Vancouver response did not contain records.', this.id);
    return data.results;
  }
}

function polygonRing(geom: VancouverRecord['geom']): LatLng[] {
  const coordinates = geom?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  const outer = geom?.geometry?.type === 'MultiPolygon' ? coordinates[0]?.[0] : coordinates[0];
  if (!Array.isArray(outer)) return [];
  return outer.filter((point): point is number[] => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)).map((point) => [point[0], point[1]] as LatLng);
}

function pointInPolygon(x: number, y: number, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]; const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonCenter(ring: LatLng[]): LatLng {
  const last = ring[ring.length - 1];
  const points = ring.length > 1 && ring[0][0] === last?.[0] && ring[0][1] === last?.[1] ? ring.slice(0, -1) : ring;
  const total = points.reduce(([lng, lat], point) => [lng + point[0], lat + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

function polygonAreaApprox(ring: LatLng[]): number {
  const latitude = polygonCenter(ring)[1] * Math.PI / 180;
  const xScale = 111_320 * Math.cos(latitude); const yScale = 110_540;
  let area = 0;
  ring.forEach((point, index) => { const next = ring[(index + 1) % ring.length]; area += point[0] * xScale * next[1] * yScale - next[0] * xScale * point[1] * yScale; });
  return Math.round(Math.abs(area) / 2 * 10) / 10;
}

function polygonBounds(ring: LatLng[]) {
  return ring.reduce((bounds, [lng, lat]) => ({ minLng: Math.min(bounds.minLng, lng), minLat: Math.min(bounds.minLat, lat), maxLng: Math.max(bounds.maxLng, lng), maxLat: Math.max(bounds.maxLat, lat) }), { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity });
}

function distanceM(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dy = (bLat - aLat) * 110_540; const dx = (bLng - aLng) * 111_320 * Math.cos((aLat + bLat) / 2 * Math.PI / 180);
  return Math.hypot(dx, dy);
}

function formatPid(value: string): string {
  const digits = value.replace(/\D/g, '').padStart(9, '0');
  return digits.length === 9 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : value;
}

function convexHull(points: LatLng[]): LatLng[] {
  const unique = [...new Map(points.map((point) => [`${point[0]},${point[1]}`, point])).values()].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (unique.length <= 2) return unique;
  const cross = (origin: LatLng, a: LatLng, b: LatLng) => (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower: LatLng[] = [];
  unique.forEach((point) => { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop(); lower.push(point); });
  const upper: LatLng[] = [];
  [...unique].reverse().forEach((point) => { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop(); upper.push(point); });
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return [...hull, hull[0]];
}
