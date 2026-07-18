import type { BuildingFootprint, Deck, DeckSitePlacement, Property } from '../types';

const METRES_PER_LATITUDE_DEGREE = 111_000;

export interface SitePlacementAssessment {
  wallLengthM: number | null;
  wallEndOffsetM: number | null;
  nearestParcelEdgeM: number | null;
  errors: string[];
  warnings: string[];
  basis: string;
}

export function createDefaultSitePlacement(
  property: Pick<Property, 'parcel' | 'buildings' | 'existingConditions'>,
  widthM: number,
  attached: boolean,
  wall: Deck['footprint']['houseWall'],
): DeckSitePlacement {
  const building = property.buildings.find((item) => item.primary);
  const wallLengthM = getReferenceWallLengthM(property, wall);
  const now = new Date().toISOString();
  return {
    schema: 'deck-site-placement/v1',
    status: 'generated-unverified',
    referenceSource: building ? 'municipal-roofline' : 'parcel-centre-estimate',
    wallStartOffsetM: wallLengthM === null ? 0 : round(Math.max(0, (wallLengthM - widthM) / 2), 3),
    outwardGapM: attached ? 0 : 1,
    recordedBy: '',
    recordedAt: '',
    notes: '',
    updatedAt: now,
  };
}

export function getReferenceWallLengthM(
  property: Pick<Property, 'parcel' | 'buildings' | 'existingConditions'>,
  wall: Deck['footprint']['houseWall'],
): number | null {
  const conditions = property.existingConditions;
  if (conditions && conditions.attachmentWall === wall) return conditions.attachmentWallLengthM;
  const building = property.buildings.find((item) => item.primary);
  if (!building || !property.parcel) return null;
  const bounds = boundsOf(building);
  const latitude = property.parcel.center[1];
  const metresPerLongitudeDegree = METRES_PER_LATITUDE_DEGREE * Math.cos(latitude * Math.PI / 180);
  return wall === 'north' || wall === 'south'
    ? (bounds.maxLng - bounds.minLng) * metresPerLongitudeDegree
    : (bounds.maxLat - bounds.minLat) * METRES_PER_LATITUDE_DEGREE;
}

export function assessSitePlacement(property: Property, deck: Deck): SitePlacementAssessment {
  const placement = deck.sitePlacement || createDefaultSitePlacement(property, deck.dimensions.width, deck.footprint.attachedToHouse, deck.footprint.houseWall);
  const wallLengthM = getReferenceWallLengthM(property, deck.footprint.houseWall);
  const wallEndOffsetM = wallLengthM === null ? null : wallLengthM - placement.wallStartOffsetM - deck.dimensions.width;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(placement.wallStartOffsetM) || placement.wallStartOffsetM < 0) errors.push('Wall-start offset must be zero or greater.');
  if (!Number.isFinite(placement.outwardGapM) || placement.outwardGapM < 0) errors.push('House clearance must be zero or greater.');
  if (deck.footprint.attachedToHouse && placement.outwardGapM > .01) errors.push('An attached deck must have zero modeled gap at the ledger wall.');
  if (wallEndOffsetM !== null && wallEndOffsetM < -.01) errors.push(`Deck width and start offset exceed the ${wallLengthM?.toFixed(2)} m reference wall.`);
  if (placement.status === 'field-input-unverified' && !placement.recordedBy.trim()) errors.push('Field placement input requires recorder attribution.');
  if (placement.status === 'field-input-unverified' && !/^\d{4}-\d{2}-\d{2}$/.test(placement.recordedAt)) errors.push('Measurement date must use YYYY-MM-DD.');
  if (placement.referenceSource === 'municipal-roofline') warnings.push('Municipal roofline bounds may include eaves and do not establish the wall face.');
  if (placement.status !== 'field-input-unverified') warnings.push('Deck placement remains automatically generated and has not been field coordinated.');
  const nearestParcelEdgeM = nearestParcelEdge(property, deck);
  return {
    wallLengthM: wallLengthM === null ? null : round(wallLengthM, 3),
    wallEndOffsetM: wallEndOffsetM === null ? null : round(wallEndOffsetM, 3),
    nearestParcelEdgeM,
    errors,
    warnings,
    basis: `${placement.referenceSource.replace(/-/g, ' ')} · ${placement.status.replace(/-/g, ' ')}`,
  };
}

export function placementBasis(property: Property, deck: Deck): string {
  const placement = deck.sitePlacement || createDefaultSitePlacement(property, deck.dimensions.width, deck.footprint.attachedToHouse, deck.footprint.houseWall);
  const assessment = assessSitePlacement(property, deck);
  return `${deck.footprint.houseWall.toUpperCase()} wall; ${placement.wallStartOffsetM.toFixed(3)} m from reference wall start; ${assessment.wallEndOffsetM === null ? 'opposite offset unconfirmed' : `${assessment.wallEndOffsetM.toFixed(3)} m to reference wall end`}; ${placement.outwardGapM.toFixed(3)} m house gap; ${assessment.basis}`;
}

function nearestParcelEdge(property: Property, deck: Deck): number | null {
  const parcel = property.parcel;
  if (!parcel || parcel.polygon.length < 2 || !deck.footprint.polygons.length) return null;
  const [originLng, originLat] = parcel.center;
  const metresPerLng = METRES_PER_LATITUDE_DEGREE * Math.cos(originLat * Math.PI / 180);
  const point = ([lng, lat]: [number, number]): [number, number] => [(lng - originLng) * metresPerLng, (lat - originLat) * METRES_PER_LATITUDE_DEGREE];
  const parcelPoints = parcel.polygon.map(point);
  let minimum = Infinity;
  for (const polygon of deck.footprint.polygons) {
    for (const vertex of polygon) {
      const deckPoint = point(vertex);
      for (let index = 0; index < parcelPoints.length - 1; index += 1) minimum = Math.min(minimum, distancePointToSegment(deckPoint, parcelPoints[index], parcelPoints[index + 1]));
    }
  }
  return Number.isFinite(minimum) ? round(minimum, 2) : null;
}

function distancePointToSegment(point: [number, number], start: [number, number], end: [number, number]): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function boundsOf(building: BuildingFootprint) {
  return building.polygon.reduce((bounds, [lng, lat]) => ({
    minLng: Math.min(bounds.minLng, lng), maxLng: Math.max(bounds.maxLng, lng), minLat: Math.min(bounds.minLat, lat), maxLat: Math.max(bounds.maxLat, lat),
  }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });
}

function round(value: number, decimals: number): number {
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
}
