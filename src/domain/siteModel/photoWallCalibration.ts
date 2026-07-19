import type { HouseOpening, NormalizedPhotoBox, NormalizedPhotoPoint, PhotoWallCalibration, SiteModel } from './types';

export interface ApplyPhotoWallCalibrationInput {
  id: string;
  sourceEvidenceId: string;
  openingId: string | null;
  openingKind: HouseOpening['kind'];
  horizontalReference: { label: string; start: NormalizedPhotoPoint; end: NormalizedPhotoPoint; distanceMm: number };
  verticalReference: { label: string; start: NormalizedPhotoPoint; end: NormalizedPhotoPoint; distanceMm: number };
  openingBox: NormalizedPhotoBox;
  recordedBy: string;
  recordedAt: string;
}

export interface DerivedPhotoOpening {
  offsetMm: number;
  widthMm: number;
  sillHeightMm: number;
  heightMm: number;
  warnings: string[];
}

/**
 * Solves image coordinates against two homeowner-measured axes on one wall plane.
 * This is intentionally an affine field aid, not single-image photogrammetry.
 */
export function derivePhotoOpeningMeasurement(input: Omit<ApplyPhotoWallCalibrationInput, 'id' | 'sourceEvidenceId' | 'openingId' | 'openingKind' | 'recordedBy' | 'recordedAt'>): DerivedPhotoOpening {
  validatePoint(input.horizontalReference.start, 'Horizontal reference start');
  validatePoint(input.horizontalReference.end, 'Horizontal reference end');
  validatePoint(input.verticalReference.start, 'Vertical reference start');
  validatePoint(input.verticalReference.end, 'Vertical reference end');
  validateBox(input.openingBox);
  validateDistance(input.horizontalReference.distanceMm, 300, 100_000, 'Horizontal reference');
  validateDistance(input.verticalReference.distanceMm, 300, 20_000, 'Vertical reference');

  const horizontal = subtract(input.horizontalReference.end, input.horizontalReference.start);
  const vertical = subtract(input.verticalReference.end, input.verticalReference.start);
  if (length(horizontal) < 0.04) throw new Error('Horizontal reference points are too close together.');
  if (length(vertical) < 0.04) throw new Error('Vertical reference points are too close together.');
  const determinant = horizontal.x * vertical.y - horizontal.y * vertical.x;
  if (Math.abs(determinant) < 0.003) throw new Error('Horizontal and vertical references are too parallel to calibrate this photo.');

  // Both axes may start at different pixels. Translate the vertical vector to the
  // horizontal origin; only its measured direction and magnitude define the basis.
  const corners = boxCorners(input.openingBox).map((point) => solve(point, input.horizontalReference.start, horizontal, vertical, determinant));
  const horizontalMm = corners.map((coordinate) => coordinate.horizontal * input.horizontalReference.distanceMm);
  const verticalMm = corners.map((coordinate) => coordinate.vertical * input.verticalReference.distanceMm);
  const minimumHorizontal = Math.min(...horizontalMm);
  const maximumHorizontal = Math.max(...horizontalMm);
  const minimumVertical = Math.min(...verticalMm);
  const maximumVertical = Math.max(...verticalMm);
  const result = {
    offsetMm: Math.round(minimumHorizontal),
    widthMm: Math.round(maximumHorizontal - minimumHorizontal),
    sillHeightMm: Math.round(minimumVertical),
    heightMm: Math.round(maximumVertical - minimumVertical),
  };
  if (result.widthMm < 300) throw new Error('The traced opening is less than 300 mm wide. Check the calibration points and opening box.');
  if (result.heightMm < 300) throw new Error('The traced opening is less than 300 mm high. Check the calibration points and opening box.');
  if (result.offsetMm < 0 || result.sillHeightMm < 0) throw new Error('The traced opening falls before or below the chosen wall datum. Reposition the reference origin or opening box.');

  const angle = angleBetween(horizontal, vertical);
  const warnings = [
    'Scaled from one wall photo using homeowner-entered references; verify every result with a tape or laser before professional issue.',
    'The affine calibration models one visible wall plane only and does not establish depth, grade, concealed framing, or structural capacity.',
  ];
  if (Math.abs(90 - angle) > 18) warnings.push(`Reference axes appear ${Math.round(angle)}° apart in the image; perspective distortion may materially affect the result.`);
  return { ...result, warnings };
}

/** Applies one calibrated result to the editable wall while preserving its source and click record. */
export function applyPhotoWallCalibration(site: SiteModel, input: ApplyPhotoWallCalibrationInput): SiteModel {
  if (!site.capture.evidence.some((record) => record.id === input.sourceEvidenceId)) throw new Error('The calibration source photo is not available in this project.');
  if (!input.id.trim()) throw new Error('Photo calibration requires a stable record ID.');
  if (!input.recordedBy.trim()) throw new Error('Identify who measured the calibration references.');
  if (!/^\d{4}-\d{2}-\d{2}/.test(input.recordedAt)) throw new Error('Photo calibration requires a recorded date.');
  const derived = derivePhotoOpeningMeasurement(input);
  const openingId = input.openingId || nextOpeningId(site.designWall.openings, input.openingKind);
  const existing = site.designWall.openings.find((opening) => opening.id === openingId);
  if (existing && existing.kind !== input.openingKind) throw new Error(`${openingId} is a ${existing.kind}; choose an opening of the same kind.`);
  if (derived.offsetMm + derived.widthMm > site.designWall.lengthMm) throw new Error('The calibrated opening extends beyond the recorded design-wall length.');
  if (derived.sillHeightMm + derived.heightMm > site.designWall.wallHeightMm) throw new Error('The calibrated opening extends above the recorded wall height.');

  const opening: HouseOpening = {
    ...existing,
    id: openingId,
    kind: input.openingKind,
    offsetMm: derived.offsetMm,
    widthMm: derived.widthMm,
    sillHeightMm: derived.sillHeightMm,
    heightMm: derived.heightMm,
    evidenceStatus: 'scaled-photo-derived',
    sourceEvidenceIds: [...new Set([...(existing?.sourceEvidenceIds || []), input.sourceEvidenceId])],
    sourceAiObservationRefs: existing?.sourceAiObservationRefs || [],
  };
  const calibration: PhotoWallCalibration = {
    schema: 'photo-wall-calibration/v1',
    id: input.id,
    sourceEvidenceId: input.sourceEvidenceId,
    openingId,
    openingKind: input.openingKind,
    method: 'two-axis-affine',
    horizontalReference: normalizeReference(input.horizontalReference),
    verticalReference: normalizeReference(input.verticalReference),
    openingBox: normalizeBox(input.openingBox),
    result: { offsetMm: derived.offsetMm, widthMm: derived.widthMm, sillHeightMm: derived.sillHeightMm, heightMm: derived.heightMm },
    recordedBy: input.recordedBy.trim(),
    recordedAt: input.recordedAt,
    status: 'homeowner-measured-unverified',
    warnings: derived.warnings,
  };
  return {
    ...site,
    status: 'field-input-unverified',
    capture: { ...site.capture, wallCalibrations: [...(site.capture.wallCalibrations || []).filter((record) => record.openingId !== openingId), calibration] },
    designWall: { ...site.designWall, openings: existing ? site.designWall.openings.map((candidate) => candidate.id === openingId ? opening : candidate) : [...site.designWall.openings, opening] },
    measuredBy: site.measuredBy || input.recordedBy.trim(),
    updatedAt: new Date().toISOString(),
  };
}

function solve(point: NormalizedPhotoPoint, origin: NormalizedPhotoPoint, horizontal: NormalizedPhotoPoint, vertical: NormalizedPhotoPoint, determinant: number): { horizontal: number; vertical: number } {
  const delta = subtract(point, origin);
  return {
    horizontal: (delta.x * vertical.y - delta.y * vertical.x) / determinant,
    vertical: (horizontal.x * delta.y - horizontal.y * delta.x) / determinant,
  };
}

function boxCorners(box: NormalizedPhotoBox): NormalizedPhotoPoint[] {
  return [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y }, { x: box.x, y: box.y + box.height }, { x: box.x + box.width, y: box.y + box.height }];
}

function subtract(end: NormalizedPhotoPoint, start: NormalizedPhotoPoint): NormalizedPhotoPoint { return { x: end.x - start.x, y: end.y - start.y }; }
function length(vector: NormalizedPhotoPoint): number { return Math.hypot(vector.x, vector.y); }
function angleBetween(first: NormalizedPhotoPoint, second: NormalizedPhotoPoint): number { return Math.acos(Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / (length(first) * length(second))))) * 180 / Math.PI; }
function validatePoint(point: NormalizedPhotoPoint, label: string): void { if (![point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error(`${label} must be inside the source photo.`); }
function validateBox(box: NormalizedPhotoBox): void { validatePoint(box, 'Opening box'); if (![box.width, box.height].every((value) => Number.isFinite(value) && value > 0) || box.x + box.width > 1 || box.y + box.height > 1) throw new Error('Opening box must fit inside the source photo.'); }
function validateDistance(value: number, minimum: number, maximum: number, label: string): void { if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} distance must be between ${minimum} mm and ${maximum.toLocaleString()} mm.`); }
function normalizePoint(point: NormalizedPhotoPoint): NormalizedPhotoPoint { return { x: round(point.x), y: round(point.y) }; }
function normalizeReference(reference: ApplyPhotoWallCalibrationInput['horizontalReference']): ApplyPhotoWallCalibrationInput['horizontalReference'] { return { label: reference.label.trim(), start: normalizePoint(reference.start), end: normalizePoint(reference.end), distanceMm: Math.round(reference.distanceMm) }; }
function normalizeBox(box: NormalizedPhotoBox): NormalizedPhotoBox { return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) }; }
function round(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
function nextOpeningId(openings: HouseOpening[], kind: HouseOpening['kind']): string { const prefix = kind === 'door' ? 'D' : 'W'; let number = 1; while (openings.some((opening) => opening.id === `${prefix}${number}`)) number += 1; return `${prefix}${number}`; }
