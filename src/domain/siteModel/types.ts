export interface HouseOpening {
  id: string;
  kind: 'door' | 'window';
  offsetMm: number;
  widthMm: number;
  sillHeightMm: number;
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

export interface SiteModel {
  schema: 'site-model/v2';
  units: 'mm';
  status: 'reference-unverified' | 'field-input-unverified';
  referenceSource: 'municipal-roofline' | 'estimated' | 'field-measurement';
  houseDepthMm: number;
  designWall: HouseWallReference;
  terrain: TerrainSurface;
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
