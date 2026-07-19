export interface HouseOpening {
  id: string;
  kind: 'door' | 'window';
  offsetMm: number;
  widthMm: number;
  sillHeightMm: number;
  /** Recorded opening height. Legacy records use a diagrammatic default until measured. */
  heightMm?: number;
  /** A photograph can establish presence, but not construction dimensions without a scale workflow. */
  evidenceStatus?: 'photo-observed' | 'scaled-photo-derived' | 'field-measured' | 'professional-verified';
  sourceEvidenceIds?: string[];
  /** Stable analysis/observation references preserve the explicit AI-to-model admission decision. */
  sourceAiObservationRefs?: string[];
}

export interface HouseWallReference {
  id: string;
  label: string;
  selectionStatus: 'unselected' | 'user-selected' | 'field-measured';
  sourceBuildingId?: string;
  sourceEdgeIndex?: number;
  reverseDirection: boolean;
  invertOutward: boolean;
  lengthMm: number;
  wallHeightMm: number;
  cladding: 'unknown' | 'wood-siding' | 'fiber-cement' | 'vinyl' | 'stucco' | 'brick-veneer' | 'other';
  rimMaterial: 'unknown' | 'solid-sawn' | 'engineered-wood' | 'concrete';
  rimDepthMm: number | null;
  flashingFeasible: 'unknown' | 'yes' | 'no';
  openings: HouseOpening[];
}

export type TerrainEvidenceSource = 'assumed-datum' | 'homeowner-measurement' | 'lidar-scan' | 'survey';
export type TerrainVerificationStatus = 'reference' | 'recorded' | 'professional-verified';

export interface TerrainDatum {
  id: 'DATUM-1';
  label: string;
  elevationMm: number;
  source: TerrainEvidenceSource;
  verificationStatus: TerrainVerificationStatus;
}

/** A grade observation in the local house-wall coordinate system. */
export interface TerrainGradePoint {
  id: string;
  label: string;
  xMm: number;
  yMm: number;
  elevationMm: number;
  source: TerrainEvidenceSource;
  verificationStatus: TerrainVerificationStatus;
  notes: string;
}

/** Owns the vertical datum and observations used to derive local grade. */
export interface TerrainSurface {
  schema: 'terrain-surface/v1';
  datum: TerrainDatum;
  gradePoints: TerrainGradePoint[];
  fieldRecord?: TerrainFieldRecord | null;
}

export type TerrainMeasurementInstrument = 'laser-level' | 'rotary-laser' | 'optical-level' | 'total-station';

export interface TerrainFieldPointMeasurement {
  pointId: string;
  label: string;
  xMm: number;
  yMm: number;
  elevationMm: number;
  notes: string;
}

/** Controlled local-grade observations tied to one explicit project benchmark. */
export interface TerrainFieldRecord {
  schema: 'terrain-field-record/v1';
  id: string;
  status: 'homeowner-recorded-unverified' | 'professional-verified';
  recordedBy: string;
  recordedAt: string;
  instrument: TerrainMeasurementInstrument;
  benchmark: { datumId: 'DATUM-1'; label: string; elevationMm: number; description: string };
  points: TerrainFieldPointMeasurement[];
  sourceEvidenceIds: string[];
  notes: string;
}

export interface TerrainFieldRecordAssessment {
  status: 'missing' | 'stale' | 'current-homeowner-unverified' | 'current-professional-verified';
  current: boolean;
  messages: string[];
}

export interface ParcelYardReference {
  schema: 'parcel-yard-reference/v1';
  status: 'unselected' | 'homeowner-selected' | 'survey-verified';
  frontEdgeIndex: number | null;
  rearEdgeIndex: number | null;
  exteriorSideEdgeIndex: number | null;
  selectedBy: string;
  selectedAt: string;
  notes: string;
}

export interface SiteModel {
  schema: 'site-model/v4';
  units: 'mm';
  status: 'reference-unverified' | 'field-input-unverified';
  referenceSource: 'municipal-roofline' | 'estimated' | 'field-measurement';
  houseDepthMm: number;
  designWall: HouseWallReference;
  terrain: TerrainSurface;
  yardReference: ParcelYardReference;
  capture: ExistingConditionCapture;
  fieldSurvey?: ExistingConditionFieldSurvey | null;
  measuredBy: string;
  measuredAt: string;
  notes: string;
  updatedAt: string;
}

export type FieldMeasurementInstrument = 'tape-measure' | 'laser-distance-meter' | 'survey-instrument';

export interface FieldOpeningMeasurement {
  openingId: string;
  kind: HouseOpening['kind'];
  offsetMm: number;
  widthMm: number;
  sillHeightMm: number;
  heightMm: number;
}

/** Controlled homeowner/professional measurements of the selected existing wall. */
export interface ExistingConditionFieldSurvey {
  schema: 'existing-condition-field-survey/v1';
  id: string;
  status: 'homeowner-recorded-unverified' | 'professional-verified';
  recordedBy: string;
  recordedAt: string;
  instrument: FieldMeasurementInstrument;
  designWallId: string;
  wallLengthMm: number;
  wallHeightMm: number;
  houseDepthMm: number;
  verticalDatum: { id: 'DATUM-1'; label: string; elevationMm: number };
  openings: FieldOpeningMeasurement[];
  sourceEvidenceIds: string[];
  notes: string;
}

export interface ExistingConditionFieldSurveyAssessment {
  status: 'missing' | 'stale' | 'current-homeowner-unverified' | 'current-professional-verified';
  current: boolean;
  messages: string[];
}

export interface SiteAssessment {
  errors: string[];
  warnings: string[];
}

export interface TerrainElevationResult {
  elevationMm: number;
  method: 'datum' | 'observed' | 'interpolated';
  sourcePointIds: string[];
  nearestDistanceMm: number | null;
  verificationStatus: TerrainVerificationStatus;
}

export type CaptureCategory = 'house-overview' | 'design-wall' | 'door-threshold' | 'grade-context' | 'wall-assembly' | 'obstruction' | 'survey-or-sketch';
export type CaptureEvidenceStatus = 'recorded-unverified' | 'homeowner-confirmed' | 'professional-verified';
export type CaptureObservationTag = 'house-context' | 'complete-wall' | 'wall-corners' | 'door-opening' | 'window-opening' | 'threshold-grade' | 'grade-slope' | 'drainage-path' | 'visible-foundation' | 'cladding-condition' | 'obstruction-service' | 'scale-reference' | 'measured-sketch';

export interface CaptureEvidence {
  id: string;
  category: CaptureCategory;
  label: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  recordedAt: string;
  status: CaptureEvidenceStatus;
  notes: string;
  /** Controlled homeowner observations; an image is not treated as a fact by itself. */
  observationTags?: CaptureObservationTag[];
  viewpoint?: string;
  referenceLabel?: string;
  referenceDimensionMm?: number | null;
}

export type AiPhotoObservationKind = 'house-wall' | 'door' | 'window' | 'landing' | 'stair' | 'grade' | 'vent-service' | 'drainage' | 'obstruction' | 'other';
export interface AiPhotoObservationDraft {
  id: string;
  sourceEvidenceId: string;
  kind: AiPhotoObservationKind;
  confidence: number;
  description: string;
  measurementStatus: 'not-measured';
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  uncertainties: string[];
  decision: 'proposed' | 'homeowner-accepted' | 'homeowner-rejected';
}

export interface AiPhotoAnalysisDraft {
  schema: 'ai-photo-observation-draft/v1';
  id: string;
  summary: string;
  observations: AiPhotoObservationDraft[];
  unknowns: string[];
  generation: { model: string; responseId: string; generatedAt: string };
}

export interface NormalizedPhotoPoint {
  /** Horizontal image coordinate from 0 (left) to 1 (right). */
  x: number;
  /** Vertical image coordinate from 0 (top) to 1 (bottom). */
  y: number;
}

export interface NormalizedPhotoBox extends NormalizedPhotoPoint {
  width: number;
  height: number;
}

/**
 * One source-bound, two-axis affine measurement of a single planar wall photo.
 * The record preserves exactly what the homeowner clicked and measured; it is
 * never treated as a survey, photogrammetry result, or professional verification.
 */
export interface PhotoWallCalibration {
  schema: 'photo-wall-calibration/v1';
  id: string;
  sourceEvidenceId: string;
  openingId: string;
  openingKind: HouseOpening['kind'];
  method: 'two-axis-affine';
  horizontalReference: { label: string; start: NormalizedPhotoPoint; end: NormalizedPhotoPoint; distanceMm: number };
  verticalReference: { label: string; start: NormalizedPhotoPoint; end: NormalizedPhotoPoint; distanceMm: number };
  openingBox: NormalizedPhotoBox;
  result: { offsetMm: number; widthMm: number; sillHeightMm: number; heightMm: number };
  recordedBy: string;
  recordedAt: string;
  status: 'homeowner-measured-unverified';
  warnings: string[];
}

export type CaptureEvidenceChanges = Partial<Pick<CaptureEvidence, 'category' | 'label' | 'notes' | 'status' | 'observationTags' | 'viewpoint' | 'referenceLabel' | 'referenceDimensionMm'>>;

/** Metadata for locally stored private capture files; bytes are owned by capture-file storage. */
export interface ExistingConditionCapture {
  schema: 'existing-condition-capture/v1';
  evidence: CaptureEvidence[];
  /** AI observations remain a separate, homeowner-reviewed draft layer. */
  aiAnalyses?: AiPhotoAnalysisDraft[];
  /** Explicit, source-bound photo calibrations; raw AI observations never populate these. */
  wallCalibrations?: PhotoWallCalibration[];
}

export interface CaptureRequirement {
  category: CaptureCategory;
  title: string;
  reason: string;
  required: boolean;
  status: 'missing' | 'recorded' | 'confirmed';
  evidenceIds: string[];
}

export interface ExistingConditionCaptureAssessment {
  requirements: CaptureRequirement[];
  requiredCount: number;
  recordedRequiredCount: number;
  confirmedRequiredCount: number;
  readyForAiDraft: boolean;
  readyForProfessionalReview: boolean;
}
