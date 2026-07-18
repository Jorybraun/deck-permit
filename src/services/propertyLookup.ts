import type { Address, EvidenceSource, Parcel, LatLng } from '../types';
import { findPropertyDataProvider } from './propertyData/registry';
import { PropertyDataError } from './propertyData/types';

const GEOCODER_BASE = 'https://geocoder.api.gov.bc.ca';
const WFS_BASE = 'https://openmaps.gov.bc.ca/geo/pub/WHSE_CADASTRE.PMBC_PARCEL_FABRIC_POLY_SVW/wfs';

export class PropertyLookupError extends Error {
  constructor(message: string, public readonly suggestions: string[] = []) {
    super(message);
    this.name = 'PropertyLookupError';
  }
}

/**
 * Geocode a BC civic address using the free BC Address Geocoder API.
 * No API key required (1000 req/min anonymous rate limit).
 * https://github.com/bcgov/ols-geocoder/blob/gh-pages/geocoder-developer-guide.md
 */
export async function geocodeAddress(addressString: string): Promise<Address | null> {
  return (await suggestAddresses(addressString, 1))[0] || null;
}

/** Return ranked BC civic-address candidates for type-ahead and recovery UI. */
export async function suggestAddresses(addressString: string, maxResults = 5): Promise<Address[]> {
  if (addressString.trim().length < 4) return [];
  const url = `${GEOCODER_BASE}/addresses.geojson?addressString=${encodeURIComponent(
    addressString
  )}&maxResults=${Math.max(1, Math.min(10, Math.round(maxResults)))}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoder error: ${res.status}`);

  const data = await res.json();
  const features = data.features || [];
  const candidates: Address[] = features.map((feature: GeocoderFeature) => addressFromFeature(feature, addressString));
  const requestedCivic = normalizeCivic(addressString.trim().match(/^\d+[A-Za-z]?/)?.[0] || '');
  if (!requestedCivic) return candidates;
  const civicMatches = candidates.filter((candidate) => normalizeCivic(candidate.civicNumber) === requestedCivic);
  return civicMatches.length ? civicMatches : candidates;
}

/**
 * Fetch the ParcelMap BC parcel polygon containing the given point.
 * Uses the public DataBC WFS (open data, no key required).
 * Strategy: BBOX query around the point, then client-side point-in-polygon.
 */
export async function fetchParcelAtPoint(lng: number, lat: number): Promise<Parcel | null> {
  // BBOX: ~100m buffer around the point (0.001 degrees ≈ 70m at this latitude)
  const buffer = 0.0015;
  const bbox = `${lng - buffer},${lat - buffer},${lng + buffer},${lat + buffer},EPSG:4326`;

  const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=WHSE_CADASTRE.PMBC_PARCEL_FABRIC_POLY_SVW&outputFormat=application/json&count=50&SRSNAME=EPSG:4326&BBOX=${bbox}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WFS error: ${res.status}`);

  const data = await res.json();
  const features = data.features || [];

  // Find the parcel containing the geocoded point
  for (const f of features) {
    const ring: LatLng[] = f.geometry.coordinates[0];
    if (pointInPolygon(lng, lat, ring)) {
      const props = f.properties;
      return {
        pid: props.PID_FORMATTED || '',
        pidRaw: props.PID || '',
        parcelName: props.PARCEL_NAME || '',
        planNumber: props.PLAN_NUMBER || '',
        municipality: props.MUNICIPALITY || '',
        ownerType: props.OWNER_TYPE || '',
        parcelClass: props.PARCEL_CLASS || '',
        areaSqm: props.FEATURE_AREA_SQM || 0,
        polygon: ring,
        center: polygonCenter(ring),
        geometrySource: 'live',
      };
    }
  }

  return null;
}

/**
 * Ray-casting point-in-polygon test.
 */
function pointInPolygon(x: number, y: number, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonCenter(ring: LatLng[]): LatLng {
  let lng = 0,
    lat = 0;
  // Exclude the closing point (same as first) from the average
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] ? ring.slice(0, -1) : ring;
  for (const [x, y] of pts) {
    lng += x;
    lat += y;
  }
  return [lng / pts.length, lat / pts.length];
}

/**
 * Full property lookup: address → geocode → parcel polygon.
 */
export async function lookupProperty(addressString: string): Promise<{
  address: Address;
  parcel: Parcel;
  buildings: import('../types').BuildingFootprint[];
  evidence: EvidenceSource[];
}> {
  const address = await geocodeAddress(addressString);
  if (!address) throw new Error('Address not found. Check the address and try again.');
  return lookupPropertyFromAddress(address, addressString);
}

/** Resolve parcel/building evidence from a user-confirmed geocoder candidate. */
export async function lookupPropertyFromAddress(address: Address, requestedAddress = address.fullAddress): Promise<{
  address: Address;
  parcel: Parcel;
  buildings: import('../types').BuildingFootprint[];
  evidence: EvidenceSource[];
}> {

  const municipalProvider = findPropertyDataProvider(address);
  if (municipalProvider) {
    const requestedCivic = requestedAddress.trim().match(/^(\d+[A-Za-z]?)/)?.[1] || '';
    if (requestedCivic && normalizeCivic(address.civicNumber) !== normalizeCivic(requestedCivic)) {
      const suggestions = await municipalProvider.suggestAddresses?.(address, requestedAddress) || [];
      const matched = address.fullAddress || `${address.streetName} ${address.streetType}`.trim();
      throw new PropertyLookupError(
        `I couldn't verify civic number ${requestedCivic}. The BC geocoder matched only ${matched} (score ${address.score}/100), not a specific property.${suggestions.length ? ` Verified Town suggestions: ${suggestions.join('; ')}.` : ' Check the civic number and try again.'}`,
        suggestions,
      );
    }
    try {
      const result = await municipalProvider.lookup(address);
      return { address, ...result };
    } catch (error) {
      if (error instanceof PropertyDataError) {
        const suggestions = await municipalProvider.suggestAddresses?.(address, requestedAddress) || [];
        if (suggestions.length) throw new PropertyLookupError(`${error.message} Verified municipal suggestions: ${suggestions.join('; ')}.`, suggestions.filter((item) => normalizeAddress(item) !== normalizeAddress(requestedAddress)));
      }
      throw error;
    }
  }

  const [lng, lat] = address.coordinates;
  const parcel = await fetchParcelAtPoint(lng, lat);
  if (!parcel) {
    const alternatives = (await suggestAddresses(requestedAddress, 5)).filter((candidate) => normalizeAddress(candidate.fullAddress) !== normalizeAddress(address.fullAddress));
    throw new PropertyLookupError(
      `${address.fullAddress} was verified by the BC Address Geocoder (score ${address.score}/100), but ParcelMap BC did not return a parcel at that point. Choose another address result or use a supported municipal parcel source.`,
      alternatives.map((candidate) => candidate.fullAddress),
    );
  }

  return {
    address,
    parcel,
    buildings: [],
    evidence: [{
      id: 'parcelmap-bc',
      label: 'ParcelMap BC Parcel Fabric',
      url: WFS_BASE,
      authority: 'provincial',
      retrievedAt: new Date().toISOString(),
      status: 'authoritative',
      notes: 'Provincial cadastral parcel geometry; no building footprint was supplied.',
    }],
  };
}

interface GeocoderFeature {
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown };
}

function addressFromFeature(feature: GeocoderFeature, fallback: string): Address {
  const props = feature.properties || {};
  const coordinates = Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates : [0, 0];
  return {
    fullAddress: String(props.fullAddress || fallback),
    civicNumber: String(props.civicNumber || ''),
    streetName: String(props.streetName || ''),
    streetType: String(props.streetType || ''),
    locality: String(props.localityName || ''),
    localityType: String(props.localityType || ''),
    province: 'BC',
    postalCode: String(props.postalCode || ''),
    coordinates: [Number(coordinates[0]) || 0, Number(coordinates[1]) || 0],
    score: Number(props.score) || 0,
  };
}

function normalizeCivic(value: string): string {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function normalizeAddress(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '');
}
