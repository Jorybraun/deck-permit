export interface HouseOpening {
  id: string;
  kind: 'door' | 'window';
  offsetMm: number;
  widthMm: number;
  sillHeightMm: number;
  /** Recorded opening height. Legacy records use a diagrammatic default until measured. */
  heightMm?: number;
  /** A photograph can establish presence, but not construction dimensions without a scale workflow. */
  evidenceStatus?: 'photo-observed' | 'field-measured' | 'professional-verified';
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
  measuredBy: string;
  measuredAt: string;
  notes: string;
  updatedAt: string;
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

export type CaptureEvidenceChanges = Partial<Pick<CaptureEvidence, 'category' | 'label' | 'notes' | 'status' | 'observationTags' | 'viewpoint' | 'referenceLabel' | 'referenceDimensionMm'>>;

/** Metadata for locally stored private capture files; bytes are owned by capture-file storage. */
export interface ExistingConditionCapture {
  schema: 'existing-condition-capture/v1';
  evidence: CaptureEvidence[];
  /** AI observations remain a separate, homeowner-reviewed draft layer. */
  aiAnalyses?: AiPhotoAnalysisDraft[];
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
