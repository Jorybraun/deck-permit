import type { Deck, ExistingHouseConditions, LatLng, Property } from '../types';

export const EXISTING_CONDITIONS_SCHEMA = 'existing-house-conditions/v1' as const;

export interface ExistingConditionAssessment {
  errors: string[];
  warnings: string[];
}

export interface HouseReferenceDimensions {
  widthM: number;
  depthM: number;
  source: 'municipal-roofline' | 'estimated';
}

/** Derives conservative editable dimensions from reference geometry without upgrading its authority. */
export function deriveHouseReference(property: Property): HouseReferenceDimensions {
  const primary = property.buildings.find((building) => building.primary);
  if (!primary || !property.parcel) return { widthM: 7, depthM: 6, source: 'estimated' };
  const dimensions = footprintDimensions(primary.polygon, property.parcel.center[1]);
  return { ...dimensions, source: 'municipal-roofline' };
}

export function createExistingConditionsDraft(property: Property, deck: Deck, now = new Date()): ExistingHouseConditions {
  const reference = deriveHouseReference(property);
  const attachmentWallLengthM = deck.footprint.houseWall === 'north' || deck.footprint.houseWall === 'south' ? reference.widthM : reference.depthM;
  return {
    schema: EXISTING_CONDITIONS_SCHEMA,
    status: 'field-input-unverified',
    houseWidthM: round(reference.widthM),
    houseDepthM: round(reference.depthM),
    wallHeightM: 3.15,
    attachmentWall: deck.footprint.houseWall,
    attachmentWallLengthM: round(attachmentWallLengthM),
    proposedLedgerLengthM: round(Math.min(deck.dimensions.width, attachmentWallLengthM)),
    rimBoardMaterial: 'unknown',
    rimBoardDepthMm: null,
    cladding: 'unknown',
    doorOpeningOffsetM: 0.6,
    doorOpeningWidthM: 0.9,
    doorThresholdHeightMm: Math.round(deck.footprint.heightAboveGrade * 1000 + 75),
    flashingFeasible: 'unknown',
    measuredBy: '',
    measuredAt: now.toISOString().slice(0, 10),
    notes: '',
    updatedAt: now.toISOString(),
  };
}

export function assessExistingConditions(conditions: ExistingHouseConditions, deck: Deck, today = new Date()): ExistingConditionAssessment {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (conditions.schema !== EXISTING_CONDITIONS_SCHEMA || conditions.status !== 'field-input-unverified') errors.push('Existing-condition record version is invalid.');
  range('House width', conditions.houseWidthM, 2, 30, errors);
  range('House depth', conditions.houseDepthM, 2, 30, errors);
  range('Wall height', conditions.wallHeightM, 2, 10, errors);
  range('Attachment wall length', conditions.attachmentWallLengthM, 2, 30, errors);
  range('Proposed ledger length', conditions.proposedLedgerLengthM, 0.6, 20, errors);
  if (conditions.proposedLedgerLengthM > conditions.attachmentWallLengthM + 0.001) errors.push('Proposed ledger length cannot exceed the measured attachment wall.');
  if (conditions.proposedLedgerLengthM > deck.dimensions.width + 0.05) errors.push('Proposed ledger length cannot exceed the deck width.');
  range('Door opening width', conditions.doorOpeningWidthM, 0.4, 4, errors);
  if (conditions.doorOpeningOffsetM < 0 || conditions.doorOpeningOffsetM + conditions.doorOpeningWidthM > conditions.attachmentWallLengthM) errors.push('Door opening must fit within the measured attachment wall.');
  range('Door threshold height', conditions.doorThresholdHeightMm, 100, 5000, errors);
  if (!conditions.measuredBy.trim()) errors.push('Identify who recorded the field measurements.');
  const measuredAt = new Date(`${conditions.measuredAt}T12:00:00`);
  if (!conditions.measuredAt || Number.isNaN(measuredAt.getTime())) errors.push('Enter a valid field-measurement date.');
  else if (measuredAt.getTime() > today.getTime() + 86_400_000) errors.push('Field-measurement date cannot be in the future.');
  if (conditions.rimBoardMaterial === 'unknown') warnings.push('Rim/band joist material remains unknown; ledger design is blocked.');
  if (conditions.rimBoardMaterial !== 'unknown' && (conditions.rimBoardDepthMm === null || conditions.rimBoardDepthMm < 100 || conditions.rimBoardDepthMm > 600)) errors.push('Enter a rim/band depth between 100 and 600 mm.');
  if (conditions.cladding === 'unknown') warnings.push('Cladding remains unknown; flashing and standoff details require field review.');
  if (conditions.flashingFeasible === 'unknown') warnings.push('Continuous flashing feasibility has not been confirmed.');
  if (conditions.flashingFeasible === 'no') warnings.push('Ledger attachment may be unsuitable because continuous flashing is not feasible.');
  return { errors, warnings };
}

export function existingConditionBasis(property: Property): string {
  const conditions = property.existingConditions;
  if (!conditions) return 'Municipal roofline reference only — field measurements not recorded';
  return `User-entered field measurements by ${conditions.measuredBy} on ${conditions.measuredAt} — professional evidence required`;
}

export function ledgerConditionSummary(conditions: ExistingHouseConditions): string {
  const rim = conditions.rimBoardMaterial === 'unknown'
    ? 'rim/band substrate unknown'
    : `${conditions.rimBoardMaterial}${conditions.rimBoardDepthMm ? ` ${conditions.rimBoardDepthMm} mm deep` : ''}`;
  return `${conditions.proposedLedgerLengthM.toFixed(2)} m proposed ledger; ${rim}; connection design pending`;
}

function footprintDimensions(polygon: LatLng[], latitude: number): { widthM: number; depthM: number } {
  const bounds = polygon.reduce((value, [lng, lat]) => ({
    minLng: Math.min(value.minLng, lng), maxLng: Math.max(value.maxLng, lng),
    minLat: Math.min(value.minLat, lat), maxLat: Math.max(value.maxLat, lat),
  }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });
  return {
    widthM: (bounds.maxLng - bounds.minLng) * 111000 * Math.cos((latitude * Math.PI) / 180),
    depthM: (bounds.maxLat - bounds.minLat) * 111000,
  };
}

function range(label: string, value: number, min: number, max: number, errors: string[]): void {
  if (!Number.isFinite(value) || value < min || value > max) errors.push(`${label} must be between ${min} and ${max}.`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
