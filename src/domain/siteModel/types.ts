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

export interface SiteModel {
  schema: 'site-model/v1';
  units: 'mm';
  status: 'reference-unverified' | 'field-input-unverified';
  referenceSource: 'municipal-roofline' | 'estimated' | 'field-measurement';
  houseDepthMm: number;
  designWall: HouseWallReference;
  terrainElevationMm: number;
  measuredBy: string;
  measuredAt: string;
  notes: string;
  updatedAt: string;
}

export interface SiteAssessment {
  errors: string[];
  warnings: string[];
}
