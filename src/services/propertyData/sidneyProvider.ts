import type { Address, BuildingFootprint, EvidenceSource, LatLng, Parcel } from '../../types';
import type { PropertyDataProvider, PropertyDataResult } from './types';
import { PropertyDataError } from './types';

const ARCGIS_ROOT = 'https://services5.arcgis.com/MNn7A6yzK94Hggl3/arcgis/rest/services';
export const SIDNEY_PROPERTY_LAYER = `${ARCGIS_ROOT}/Sync_Enabled_Property_Line_NEW/FeatureServer/0`;
export const SIDNEY_ROOFLINE_LAYER = `${ARCGIS_ROOT}/Sync_Enabled_Rooflines/FeatureServer/0`;
const SIDNEY_PROPERTY_API = '/api/sidney-property';
const SIDNEY_ROOFLINE_API = '/api/sidney-rooflines';

interface GeoJsonFeatureCollection<P> {
  type: 'FeatureCollection';
  features: Array<{
    id?: string | number;
    type: 'Feature';
    properties: P;
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
  }>;
}

interface SidneyParcelProperties {
  FullAddress?: string;
  PID?: string;
  LegalDesc?: string;
  LotAreaSqm?: number;
  PlanNumber?: string;
  ZONING?: string;
  ActualYearBuilt?: string;
  LastUpdate?: number;
  OBJECTID?: number;
}

interface SidneyRooflineProperties {
  OBJECTID?: number;
  Shape__Area?: number;
}

export class SidneyPropertyProvider implements PropertyDataProvider {
  readonly id = 'town-of-sidney-arcgis';
  readonly version = '1.0';
  private readonly fetcher: typeof fetch;

  constructor(fetcher?: typeof fetch) {
    this.fetcher = fetcher || ((input, init) => fetch(input, init));
  }

  supports(address: Address): boolean {
    return normalize(address.locality).includes('sidney');
  }

  async suggestAddresses(address: Address, requestedAddress: string): Promise<string[]> {
    if (!this.supports(address) || !address.streetName) return [];
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const url = new URL(SIDNEY_PROPERTY_API, origin);
    const street = `${address.streetName} ${address.streetType}`.trim().toUpperCase().replace(/'/g, "''");
    url.search = new URLSearchParams({
      f: 'json',
      where: `UPPER(FullAddress) LIKE '%${street}%'`,
      outFields: 'FullAddress',
      returnGeometry: 'false',
      resultRecordCount: '100',
    }).toString();
    let response: Response;
    try {
      response = await this.fetcher(url);
    } catch {
      return [];
    }
    if (!response.ok) return [];
    const data = await response.json() as { features?: Array<{ attributes?: { FullAddress?: string } }> };
    const requestedCivic = requestedAddress.trim().match(/^(\d+[A-Za-z]?)/)?.[1] || '';
    const addresses = [...new Set((data.features || []).map((feature) => feature.attributes?.FullAddress?.trim()).filter((value): value is string => Boolean(value)))];
    return addresses
      .map((value) => ({
        value: `${titleCase(value)}, Sidney, BC`,
        civic: value.match(/^(\d+[A-Za-z]?)/)?.[1] || '',
      }))
      .sort((a, b) => levenshtein(a.civic, requestedCivic) - levenshtein(b.civic, requestedCivic) || Math.abs(Number(a.civic) - Number(requestedCivic)) - Math.abs(Number(b.civic) - Number(requestedCivic)))
      .slice(0, 3)
      .map((item) => item.value);
  }

  async lookup(address: Address): Promise<PropertyDataResult> {
    if (!this.supports(address)) {
      throw new PropertyDataError('unsupported-jurisdiction', `${address.locality} is not supported by this provider.`, this.id);
    }

    const parcelCollection = await this.query<SidneyParcelProperties>(SIDNEY_PROPERTY_LAYER, {
      geometry: `${address.coordinates[0]},${address.coordinates[1]}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'FullAddress,PID,LegalDesc,LotAreaSqm,PlanNumber,ZONING,ActualYearBuilt,LastUpdate,OBJECTID',
      outSR: '4326',
    });

    const parcelFeature = parcelCollection.features[0];
    if (!parcelFeature) {
      throw new PropertyDataError('not-found', 'The Town of Sidney property layer did not return a parcel for this address.', this.id);
    }

    const polygon = polygonRing(parcelFeature.geometry);
    if (polygon.length < 4) {
      throw new PropertyDataError('invalid-response', 'The municipal parcel geometry was incomplete.', this.id);
    }

    const props = parcelFeature.properties;
    const pid = props.PID || '';
    const parcel: Parcel = {
      pid,
      pidRaw: pid.replace(/\D/g, ''),
      parcelName: props.LegalDesc || '',
      planNumber: props.PlanNumber || '',
      municipality: 'Town of Sidney',
      ownerType: 'Not provided by municipal open data',
      parcelClass: 'Municipal cadastral parcel',
      areaSqm: numberOr(props.LotAreaSqm, polygonAreaApprox(polygon)),
      polygon,
      center: polygonCenter(polygon),
      geometrySource: 'live',
      zoningCode: props.ZONING || undefined,
      legalDescription: props.LegalDesc || undefined,
      yearBuilt: props.ActualYearBuilt || undefined,
      lastUpdated: props.LastUpdate ? new Date(props.LastUpdate).toISOString() : undefined,
      sourceUrl: SIDNEY_PROPERTY_LAYER,
    };

    const bounds = polygonBounds(polygon);
    const rooflineCollection = await this.query<SidneyRooflineProperties>(SIDNEY_ROOFLINE_LAYER, {
      geometry: `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'OBJECTID,Shape__Area',
      outSR: '4326',
    });

    const candidates = rooflineCollection.features
      .map((feature) => {
        const ring = polygonRing(feature.geometry);
        const center = polygonCenter(ring);
        return { feature, ring, center };
      })
      .filter(({ ring, center }) => ring.length >= 4 && pointInPolygon(center[0], center[1], polygon))
      .sort((a, b) => numberOr(b.feature.properties.Shape__Area, 0) - numberOr(a.feature.properties.Shape__Area, 0));

    const buildings: BuildingFootprint[] = candidates.map(({ feature, ring }, index) => ({
      id: `sidney-roofline-${feature.properties.OBJECTID ?? feature.id ?? index}`,
      polygon: ring,
      areaSqm: numberOr(feature.properties.Shape__Area, polygonAreaApprox(ring)),
      kind: 'roofline',
      primary: index === 0,
      sourceId: 'sidney-rooflines',
      confidence: 'high',
    }));

    const retrievedAt = new Date().toISOString();
    const evidence: EvidenceSource[] = [
      {
        id: 'sidney-property',
        label: 'Town of Sidney Property Line',
        url: SIDNEY_PROPERTY_LAYER,
        authority: 'municipal',
        retrievedAt,
        status: 'authoritative',
        notes: 'Parcel, legal description, lot area, zoning code, and municipal property attributes.',
      },
      {
        id: 'sidney-rooflines',
        label: 'Town of Sidney Rooflines',
        url: SIDNEY_ROOFLINE_LAYER,
        authority: 'municipal',
        retrievedAt,
        status: 'reference',
        notes: 'Roofline geometry may include eaves and is not a legal survey of foundation walls.',
      },
    ];

    return { parcel, buildings, evidence };
  }

  private async query<P>(layer: string, parameters: Record<string, string>): Promise<GeoJsonFeatureCollection<P>> {
    const apiPath = layer === SIDNEY_PROPERTY_LAYER ? SIDNEY_PROPERTY_API : SIDNEY_ROOFLINE_API;
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const url = new URL(apiPath, origin);
    url.search = new URLSearchParams({ f: 'geojson', where: '1=1', returnGeometry: 'true', ...parameters }).toString();
    let response: Response;
    try {
      response = await this.fetcher(url);
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new PropertyDataError('provider-unavailable', `The Town of Sidney GIS service could not be reached.${detail}`, this.id, { cause: error });
    }
    if (!response.ok) {
      throw new PropertyDataError('provider-unavailable', `The Town of Sidney GIS service returned HTTP ${response.status}.`, this.id);
    }
    const data: unknown = await response.json();
    if (!isFeatureCollection(data)) {
      throw new PropertyDataError('invalid-response', 'The Town of Sidney GIS response was not valid GeoJSON.', this.id);
    }
    return data as GeoJsonFeatureCollection<P>;
  }
}

function isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'FeatureCollection' && Array.isArray((value as { features?: unknown }).features);
}

function polygonRing(geometry: GeoJsonFeatureCollection<unknown>['features'][number]['geometry']): LatLng[] {
  const coordinates = geometry.type === 'MultiPolygon' ? geometry.coordinates[0]?.[0] : geometry.coordinates[0];
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .filter((point): point is number[] => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite))
    .map((point) => [point[0], point[1]] as LatLng);
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function levenshtein(left: string, right: string): number {
  if (!left) return right.length;
  if (!right) return left.length;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex];
      row[rightIndex] = Math.min(row[rightIndex] + 1, row[rightIndex - 1] + 1, diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function polygonCenter(ring: LatLng[]): LatLng {
  const points = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  if (points.length === 0) return [0, 0];
  const sum = points.reduce(([lng, lat], point) => [lng + point[0], lat + point[1]] as LatLng, [0, 0] as LatLng);
  return [sum[0] / points.length, sum[1] / points.length];
}

function polygonBounds(ring: LatLng[]) {
  return ring.reduce((bounds, [lng, lat]) => ({
    minLng: Math.min(bounds.minLng, lng), maxLng: Math.max(bounds.maxLng, lng),
    minLat: Math.min(bounds.minLat, lat), maxLat: Math.max(bounds.maxLat, lat),
  }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });
}

function pointInPolygon(x: number, y: number, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonAreaApprox(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  const latitude = polygonCenter(ring)[1];
  const xScale = 111000 * Math.cos((latitude * Math.PI) / 180);
  const yScale = 111000;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    twiceArea += ring[index][0] * xScale * ring[index + 1][1] * yScale - ring[index + 1][0] * xScale * ring[index][1] * yScale;
  }
  return Math.abs(twiceArea / 2);
}
