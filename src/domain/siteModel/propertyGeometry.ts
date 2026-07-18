import type { BuildingFootprint, LatLng, Property } from '../../types';
import type { PointMm } from '../deckDesign';
import { updateSiteModel } from './siteModel';
import type { SiteModel } from './types';

export interface LocalBuildingGeometry {
  id: string;
  primary: boolean;
  confidence: BuildingFootprint['confidence'];
  polygon: PointMm[];
}

export interface LocalPropertyGeometry {
  parcel: PointMm[];
  buildings: LocalBuildingGeometry[];
  selectedBuildingId: string;
  selectedEdgeIndex: number;
  anchorLengthMm: number;
  alignmentStatus: 'provisional' | 'user-selected' | 'field-measured';
  exteriorSideSign: -1 | 1;
}

export interface HouseReferenceDimensions {
  widthM: number;
  depthM: number;
  source: 'municipal-roofline' | 'estimated';
}

/** Derives conservative starting dimensions from reference geometry without upgrading its authority. */
export function deriveHouseReference(property: Property): HouseReferenceDimensions {
  const primary = property.buildings.find((building) => building.primary);
  if (!primary || !property.parcel) return { widthM: 7, depthM: 6, source: 'estimated' };
  const ring = primary.polygon;
  const bounds = ring.reduce((value, [lng, lat]) => ({ minLng: Math.min(value.minLng, lng), maxLng: Math.max(value.maxLng, lng), minLat: Math.min(value.minLat, lat), maxLat: Math.max(value.maxLat, lat) }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });
  const latitude = property.parcel.center[1];
  return { widthM: (bounds.maxLng - bounds.minLng) * 111000 * Math.cos(latitude * Math.PI / 180), depthM: (bounds.maxLat - bounds.minLat) * 111000, source: 'municipal-roofline' };
}

/** Aligns independently sourced municipal GIS geometry to the selected house edge. */
export function projectPropertyToLocal(property: Property, site: SiteModel): LocalPropertyGeometry | null {
  if (!property.parcel) return null;
  const fallbackBuilding = property.buildings.find((building) => building.primary) || property.buildings[0];
  const buildingId = site.designWall.sourceBuildingId || fallbackBuilding?.id;
  if (!buildingId) return null;
  const source = property.buildings.find((building) => building.id === buildingId);
  if (!source) return null;
  const ring = openRing(source.polygon);
  const edgeIndex = site.designWall.sourceEdgeIndex ?? longestEdgeIndex(ring, property.parcel.center[1]);
  const start = ring[edgeIndex];
  const end = ring[(edgeIndex + 1) % ring.length];
  if (!start || !end) return null;
  const projection = localProjection(start, property.parcel.center[1]);
  const sourceEdgeStart = projection(start);
  const sourceEdgeEnd = projection(end);
  const dx = sourceEdgeEnd[0] - sourceEdgeStart[0];
  const dy = sourceEdgeEnd[1] - sourceEdgeStart[1];
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return null;
  const sourceAlong: readonly [number, number] = [dx / length, dy / length];
  const projectedRing = ring.map(projection);
  const signedArea = projectedRing.reduce((sum, point, index) => {
    const next = projectedRing[(index + 1) % projectedRing.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  const sourceOutward: readonly [number, number] = signedArea >= 0 ? [sourceAlong[1], -sourceAlong[0]] : [-sourceAlong[1], sourceAlong[0]];
  const reverseDirection = site.designWall.reverseDirection || false;
  const invertOutward = site.designWall.invertOutward || false;
  const edgeOrigin = reverseDirection ? sourceEdgeEnd : sourceEdgeStart;
  const along: readonly [number, number] = reverseDirection ? [-sourceAlong[0], -sourceAlong[1]] : sourceAlong;
  const outward: readonly [number, number] = invertOutward ? [-sourceOutward[0], -sourceOutward[1]] : sourceOutward;
  const toLocal = (point: LatLng): PointMm => {
    const projected = projection(point);
    const relativeX = projected[0] - edgeOrigin[0];
    const relativeY = projected[1] - edgeOrigin[1];
    return [Math.round((relativeX * along[0] + relativeY * along[1]) * 1000), Math.round((relativeX * outward[0] + relativeY * outward[1]) * 1000)];
  };
  return {
    parcel: property.parcel.polygon.map(toLocal),
    buildings: property.buildings.map((building) => ({ id: building.id, primary: building.primary, confidence: building.confidence, polygon: building.polygon.map(toLocal) })),
    selectedBuildingId: buildingId,
    selectedEdgeIndex: edgeIndex,
    anchorLengthMm: Math.round(length * 1000),
    alignmentStatus: site.designWall.selectionStatus === 'field-measured' ? 'field-measured' : site.designWall.sourceBuildingId ? 'user-selected' : 'provisional',
    exteriorSideSign: invertOutward ? -1 : 1,
  };
}

export function selectHouseWall(site: SiteModel, property: Property, buildingId: string, edgeIndex: number): SiteModel {
  const building = property.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) throw new Error('The selected municipal building no longer exists in the property evidence.');
  const ring = openRing(building.polygon);
  const start = ring[edgeIndex];
  const end = ring[(edgeIndex + 1) % ring.length];
  if (!start || !end) throw new Error('The selected roofline edge is invalid.');
  const lengthMm = Math.round(distanceMetres(start, end, property.parcel?.center[1] ?? start[1]) * 1000);
  if (lengthMm < 2000) throw new Error('Choose a house edge at least 2.0 m long for the design wall.');
  return updateSiteModel(site, {}, {
    label: `Municipal roofline edge ${edgeIndex + 1} · homeowner selected`,
    selectionStatus: 'user-selected',
    sourceBuildingId: building.id,
    sourceEdgeIndex: edgeIndex,
    // Selecting a better municipal edge must not silently discard the
    // homeowner-confirmed GIS orientation.
    reverseDirection: site.designWall.reverseDirection,
    invertOutward: site.designWall.invertOutward,
    lengthMm,
    openings: [],
  });
}

export function edgeLengthMm(building: BuildingFootprint, edgeIndex: number, latitude: number): number {
  const ring = openRing(building.polygon);
  const start = ring[edgeIndex];
  const end = ring[(edgeIndex + 1) % ring.length];
  return start && end ? Math.round(distanceMetres(start, end, latitude) * 1000) : 0;
}

export function openBuildingRing(building: BuildingFootprint): LatLng[] { return openRing(building.polygon); }

function openRing(ring: LatLng[]): LatLng[] {
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) return ring.slice(0, -1);
  return ring;
}
function localProjection(origin: LatLng, latitude: number) {
  const xScale = 111000 * Math.cos(latitude * Math.PI / 180);
  return ([lng, lat]: LatLng): readonly [number, number] => [(lng - origin[0]) * xScale, (lat - origin[1]) * 111000];
}
function distanceMetres(first: LatLng, second: LatLng, latitude: number): number {
  const dx = (second[0] - first[0]) * 111000 * Math.cos(latitude * Math.PI / 180);
  const dy = (second[1] - first[1]) * 111000;
  return Math.hypot(dx, dy);
}

function longestEdgeIndex(ring: LatLng[], latitude: number): number {
  let longestIndex = 0;
  let longestLength = 0;
  ring.forEach((point, index) => {
    const length = distanceMetres(point, ring[(index + 1) % ring.length], latitude);
    if (length > longestLength) { longestIndex = index; longestLength = length; }
  });
  return longestIndex;
}
