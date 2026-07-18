// Core domain types for the deck permit app

export type LatLng = [number, number]; // [lng, lat]

export interface Parcel {
  pid: string; // formatted PID e.g. "007-952-449"
  pidRaw: string;
  parcelName: string;
  planNumber: string;
  municipality: string;
  ownerType: string;
  parcelClass: string;
  areaSqm: number;
  polygon: LatLng[]; // ring of coordinates
  center: LatLng;
  geometrySource?: 'live' | 'pilot-estimate';
  zoningCode?: string;
  legalDescription?: string;
  yearBuilt?: string;
  lastUpdated?: string;
  sourceUrl?: string;
}

export interface EvidenceSource {
  id: string;
  label: string;
  url: string;
  authority: 'municipal' | 'provincial' | 'user' | 'derived';
  retrievedAt: string;
  status: 'authoritative' | 'reference' | 'estimated';
  notes?: string;
}

export interface BuildingFootprint {
  id: string;
  polygon: LatLng[];
  areaSqm: number;
  kind: 'roofline' | 'building-footprint' | 'user-traced';
  primary: boolean;
  sourceId: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface Address {
  fullAddress: string;
  civicNumber: string;
  streetName: string;
  streetType: string;
  locality: string;
  localityType: string;
  province: string;
  postalCode: string;
  coordinates: LatLng;
  score: number;
}

export interface ZoningInfo {
  zone: string;
  setbacks: {
    front: number; // meters
    rear: number;
    side: number;
    exteriorSide: number; // for corner lots
  };
  maxLotCoverage: number; // percentage 0-100
  maxHeight: number; // meters
  source: string;
  notes: string[];
}

export interface Property {
  address: Address | null;
  parcel: Parcel | null;
  zoning: ZoningInfo | null;
  buildableEnvelope: LatLng[] | null; // polygon of buildable area
  snowLoad: number; // kPa
  buildings: BuildingFootprint[];
  evidence: EvidenceSource[];
}

export type DeckShape = 'rectangle' | 'l-shape' | 'wraparound' | 'custom';

export interface DeckOutlineVertex {
  id: string;
  xMm: number;
  yMm: number;
}

/** Dimensioned plan geometry in local construction coordinates. */
export interface DeckOutline {
  schema: 'deck-outline/v1';
  units: 'mm';
  vertices: DeckOutlineVertex[];
  closed: boolean;
  updatedAt: string;
}

export interface DeckFootprint {
  shape: DeckShape;
  /** Local source geometry. Legacy projects are normalized on first edit. */
  outline?: DeckOutline;
  // For rectangle: single polygon
  // For l-shape: two rectangles
  // For wraparound: two rectangles along two walls
  polygons: LatLng[][];
  heightAboveGrade: number; // meters
  attachedToHouse: boolean;
  houseWall: 'north' | 'south' | 'east' | 'west';
}

export interface DeckSitePlacement {
  schema: 'deck-site-placement/v1';
  status: 'generated-unverified' | 'field-input-unverified';
  referenceSource: 'municipal-roofline' | 'field-measurement' | 'parcel-centre-estimate';
  wallStartOffsetM: number;
  outwardGapM: number;
  recordedBy: string;
  recordedAt: string;
  notes: string;
  updatedAt: string;
}

/** Local construction coordinates measured from the house-side/left deck corner. */
export interface DeckLayout {
  schema: 'deck-layout/v1';
  beamOffsetsFromHouseM: number[];
  postStationsM: number[];
  stairOffsetM: number;
  stairLandingDepthM: number;
  updatedAt: string;
}

export interface StairConfig {
  enabled: boolean;
  edge: 'north' | 'south' | 'east' | 'west';
  width: number; // meters
  riserHeight: number; // mm
  numRisers: number;
  treadRun: number; // mm
}

export interface GuardConfig {
  enabled: boolean;
  height: number; // mm
  openingMax: number; // mm (100mm sphere rule)
  material: string;
}

export interface StructureConfig {
  joistSize: string; // e.g. "2x8"
  joistSpacing: number; // mm
  joistSpecies: string; // e.g. "S-P-F #2"
  beamSize: string; // e.g. "3-2x10"
  postSize: string; // e.g. "6x6"
  postSpacing: number; // meters
  footingType: string; // e.g. "concrete pad"
  footingSize: number; // mm (square side)
  footingDepth: number; // mm below grade
  ledgerAttachment: string; // e.g. "lag bolt 1/2in"
  deckingMaterial: string;
  deckingThickness: number; // mm
  lumberTreatment: 'incised' | 'not-incised';
  selection: StructuralTableSelection;
}

export interface StructuralTableSelection {
  status: 'table-supported' | 'engineering-required' | 'modified-after-selection';
  sourceTitle: string;
  sourceUrl: string;
  sourceEdition: string;
  joistTable: string;
  beamTable: string;
  joistMaxSpanM: number | null;
  beamLookupSpanM: number | null;
  assumptions: string[];
  exclusions: string[];
  reason?: string;
}

export interface Deck {
  dimensions: {
    width: number; // meters
    depth: number; // meters
  };
  footprint: DeckFootprint;
  sitePlacement?: DeckSitePlacement;
  layout?: DeckLayout;
  stairs: StairConfig;
  guard: GuardConfig;
  structure: StructureConfig;
  area: number; // sqm
}

export interface PlanSheet {
  id: 'cover' | 'existing-conditions' | 'site' | 'deck-plan' | 'foundations' | 'framing' | 'elevations' | 'sections' | 'details' | 'assembly-schedule' | `assembly-schedule-${number}` | 'calculations';
  number: string;
  title: string;
  scale: string;
  revision: number;
  designFingerprint: string;
  issuedAt: string;
  issuePurpose: 'professional-review';
  svg: string; // rendered SVG content
}

export interface PermitSubmissionRecord {
  id: string;
  provider: 'resend';
  providerMessageId: string;
  recipient: string;
  submittedAt: string;
  designFingerprint: string;
  revision: number;
  packageFileName: string;
  packageByteSize: number;
  packageSha256: string;
  status: 'delivered-to-email-provider';
  deliveryMeaning: string;
  duplicatePrevented?: boolean;
}

export type ReviewStatus = 'pass' | 'review' | 'blocked';

export interface DesignCheck {
  id: string;
  title: string;
  status: ReviewStatus;
  result: string;
  basis: string;
}

export interface ReviewGate {
  id: string;
  label: string;
  status: 'confirmed' | 'required' | 'not-applicable';
  responsibleParty: 'owner' | 'designer' | 'surveyor' | 'engineer' | 'municipality';
  detail: string;
}

export interface StructuralReport {
  generatedAt: string;
  codeEdition: string;
  designBasis: {
    deadLoadKpa: number;
    liveOrSnowLoadKpa: number;
    totalAreaLoadKpa: number;
    assumedSoilBearingKpa: number;
  };
  quantities: {
    deckAreaSqm: number;
    joistSpanM: number;
    joistCount: number;
    beamSpanM: number;
    postCount: number;
    beamCount: number;
    postsPerBeam: number;
    actualPostSpacingM: number;
    totalDesignLoadKn: number;
    joistLineLoadKnM: number;
    joistMomentDemandKnM: number;
    joistShearDemandKn: number;
    joistSpanUtilization: number | null;
    beamLineLoadKnM: number;
    exteriorBeamReactionKn: number;
    ledgerReactionKn: number;
    governingPostReactionKn: number;
    tributaryAreaPerPostSqm: number;
    estimatedPostReactionKn: number;
    requiredFootingAreaSqm: number;
    providedFootingAreaSqm: number;
  };
  loadPath: string[];
  checks: DesignCheck[];
  calculations: StructuralCalculation[];
  connectionSchedule: ConnectionScheduleItem[];
  professionalChecklist: ProfessionalChecklistItem[];
  gates: ReviewGate[];
  limitations: string[];
}

export interface StructuralCalculation {
  id: string;
  title: string;
  status: ReviewStatus;
  equation: string;
  result: string;
  basis: string;
}

export interface ConnectionScheduleItem {
  id: string;
  component: string;
  requirement: string;
  status: 'specified' | 'professional-selection-required' | 'field-verification-required';
  basis: string;
}

export interface ProfessionalChecklistItem {
  id: string;
  discipline: 'site' | 'structure' | 'envelope' | 'life-safety' | 'municipal';
  label: string;
  status: 'ready-for-review' | 'evidence-required' | 'design-required';
  evidence: string;
}

export interface SubmissionReadiness {
  status: 'review-package' | 'ready-to-submit';
  confirmedCount: number;
  requiredCount: number;
  gates: ReviewGate[];
  summary: string;
}

export type VerificationEvidenceKind =
  | 'legal-survey'
  | 'municipal-confirmation'
  | 'field-report'
  | 'soil-report'
  | 'sealed-structural-review'
  | 'application-checklist';

export interface VerificationEvidence {
  id: string;
  gateId: string;
  kind: VerificationEvidenceKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  issuerName: string;
  issuerRole: 'owner' | 'designer' | 'surveyor' | 'engineer' | 'architect' | 'municipality';
  licenseNumber?: string;
  referenceNumber?: string;
  decision?: 'accepted' | 'changes-requested';
  designFingerprint?: string;
  professionalRegistry?: 'egbc' | 'aibc' | 'abcls';
  registryUrl?: string;
  registryCheckedAt?: string;
  registryStatus?: 'directory-confirmed-by-user';
  recordedAt: string;
  status: 'recorded-unverified';
}

export interface PermitManifest {
  issueId: string;
  revision: number;
  designFingerprint: string;
  generatedAt: string;
  issuePurpose: 'professional-review';
  supersedesDesignFingerprint?: string;
  address: string;
  pid: string;
  sheetIds: PlanSheet['id'][];
  status: 'professional-review';
}

export interface ReviewExchangePublication {
  projectId: string;
  ownerToken: string;
  reviewerUrl: string;
  designFingerprint: string;
  revision?: number;
  issueIssuedAt?: string;
  publishedAt: string;
  expiresAt: string;
}

export type ReviewRedlineCategory = 'code' | 'structure' | 'site' | 'coordination' | 'documentation';

export interface ReviewRedline {
  id: string;
  designFingerprint: string;
  sheetId: PlanSheet['id'];
  category: ReviewRedlineCategory;
  severity: 'required' | 'advisory';
  title: string;
  comment: string;
  anchor: { xPercent: number; yPercent: number };
  createdAt: string;
}

export interface ReviewRedlineResolution {
  id: string;
  redlineId: string;
  sourceDesignFingerprint: string;
  targetDesignFingerprint: string;
  disposition: 'addressed-in-revision' | 'response-only';
  response: string;
  recordedAt: string;
  recordedBy: 'owner-or-designer';
}

export interface ProfessionalReviewCycle {
  id: string;
  exchangeProjectId: string;
  sourceDesignFingerprint: string;
  decision: 'accepted' | 'changes-requested';
  issuerName: string;
  issuerRole: 'engineer' | 'architect';
  licenseNumber: string;
  importedAt: string;
  evidenceId: string;
  redlines: ReviewRedline[];
  resolutions: ReviewRedlineResolution[];
  structuralResolutions: import('../services/professionalWorkResolution').ProfessionalWorkResolution[];
}

export interface SidneyApplicationData {
  civicAddress: string;
  ownerName: string;
  ownerCompany: string;
  ownerAddress: string;
  ownerCityProvince: string;
  ownerPostalCode: string;
  ownerPhone: string;
  ownerEmail: string;
  applicantName: string;
  applicantCompany: string;
  applicantBusinessLicence: string;
  applicantAddress: string;
  applicantCityProvince: string;
  applicantPostalCode: string;
  applicantPhone: string;
  applicantEmail: string;
  projectDescription: string;
  constructionValue: string;
  existingFloorAreaSqm: string;
  deckAreaSqm: string;
}
