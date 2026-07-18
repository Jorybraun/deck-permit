import type { PointMm } from '../deckDesign';

export type FramingStatus = 'table-screened' | 'review-required' | 'engineering-required';

export interface FramingCodeProfile {
  id: 'bcbc-2024' | 'vbbl-2025';
  label: string;
  effectiveDate: string;
  sourceUrl: string;
  jurisdiction: string;
}

export interface FramingAssumptions {
  deadLoadKpa: number;
  liveLoadKpa: number;
  snowLoadKpa: number;
  governingAreaLoadKpa: number;
  soilBearingKpa: number;
  lumberSpecies: 'S-P-F';
  lumberGrade: 'No.2 or better';
  treatment: 'incised' | 'not-incised';
  maximumPostSpacingMm: number;
}

export interface JoistMember {
  id: string;
  platformId: string;
  startMm: PointMm;
  endMm: PointMm;
  spanMm: number;
  spacingMm: number;
  section: string;
  status: FramingStatus;
  ruleId: string;
}

export interface BeamMember {
  id: string;
  platformId: string;
  startMm: PointMm;
  endMm: PointMm;
  lengthMm: number;
  section: string;
  supportRole: 'exterior-beam' | 'interior-beam';
  status: FramingStatus;
  ruleId: string;
}

export interface LedgerMember {
  id: string;
  platformId: string;
  edgeId: string;
  startMm: PointMm;
  endMm: PointMm;
  lengthMm: number;
  section: string;
  status: 'review-required';
}

export interface PostMember {
  id: string;
  platformId: string;
  beamId: string;
  pointMm: PointMm;
  heightMm: number;
  section: string;
  estimatedReactionKn: number;
  status: FramingStatus;
}

export interface FootingMember {
  id: string;
  platformId: string;
  postId: string;
  centerMm: PointMm;
  widthMm: number;
  lengthMm: number;
  depthMm: null;
  assumedSoilBearingKpa: number;
  estimatedReactionKn: number;
  status: 'review-required';
}

export interface GuardAssembly {
  id: string;
  platformId: string;
  edgeId: string;
  startMm: PointMm;
  endMm: PointMm;
  heightMm: 900 | 1070;
  system: string;
  status: 'review-required';
}

export interface StairStringerMember {
  id: string;
  stairId: string;
  startMm: PointMm;
  endMm: PointMm;
  runMm: number;
  riseMm: number;
  section: string;
  status: 'review-required';
}

/** A framed interruption at a platform edge receiving one end of a stair flight. */
export interface StairOpeningMember {
  id: string;
  stairId: string;
  endpoint: 'from' | 'to';
  platformId: string;
  edgeId: string;
  centerMm: PointMm;
  clearWidthMm: number;
  projectedWidthMm: number;
  skewDeg: number;
  headerStartMm: PointMm;
  headerEndMm: PointMm;
  headerSection: 'Engineer design';
  status: 'review-required';
}

/** Concept geometry for doubled framing beside a stair opening; size and fastening remain reviewed. */
export interface StairTrimmerMember {
  id: string;
  stairId: string;
  openingId: string;
  platformId: string;
  side: 'left' | 'right';
  startMm: PointMm;
  endMm: PointMm;
  lengthMm: number;
  section: 'Engineer design';
  status: 'review-required';
}

/** Traceable interface between a stair flight and a platform header, landing, or grade. */
export interface StairConnection {
  id: string;
  stairId: string;
  endpoint: 'from' | 'to';
  hostKind: 'platform-edge' | 'terrain';
  platformId?: string;
  edgeId?: string;
  pointMm: PointMm;
  elevationMm: number;
  connectionType: 'stringer-to-header' | 'stringer-to-landing-edge' | 'stringer-to-grade-landing';
  receivingMemberIds: string[];
  requirements: string[];
  status: 'review-required';
}

export type StructuralConnectionKind = 'ledger-to-house' | 'joist-to-ledger' | 'joist-to-beam' | 'beam-to-post' | 'post-to-footing' | 'guard-to-frame' | 'stair-to-support';

/** A keyed connection work package located on S2.0 and resolved on A4.0. */
export interface StructuralConnectionGroup {
  id: string;
  kind: StructuralConnectionKind;
  platformId?: string;
  pointMm: PointMm;
  quantity: number;
  fromMemberIds: string[];
  receivingMemberIds: string[];
  designActionKn: number | null;
  actionScope: 'each' | 'group' | 'unresolved';
  demandBasis: string;
  hardware: {
    product: null;
    fastenerSchedule: null;
    corrosionClass: null;
  };
  requirements: string[];
  status: 'design-required';
}

export interface PlatformFramingSystem {
  platformId: string;
  joistAxis: 'x' | 'y';
  joistDesignSpanMm: number;
  supportStrategy: 'ledger' | 'freestanding';
  rectangular: boolean;
  status: FramingStatus;
  explanation: string;
}

export interface FramingCheck {
  id: string;
  title: string;
  status: 'pass' | 'review' | 'blocked';
  objectId: string;
  result: string;
  basis: string;
}

export interface FramingReviewGate {
  id: string;
  discipline: 'site' | 'structural' | 'building-envelope' | 'code';
  title: string;
  status: 'required' | 'not-required';
  reason: string;
}

export interface FramingRuleSource {
  id: string;
  title: string;
  edition: string;
  url: string;
  scope: string;
  exclusions: string[];
}

export interface FramingDesign {
  schema: 'framing-design/v2';
  units: 'mm';
  inputFingerprint: string;
  generatedAt: string;
  codeProfile: FramingCodeProfile;
  assumptions: FramingAssumptions;
  platformSystems: PlatformFramingSystem[];
  joists: JoistMember[];
  beams: BeamMember[];
  ledgers: LedgerMember[];
  posts: PostMember[];
  footings: FootingMember[];
  guards: GuardAssembly[];
  stairStringers: StairStringerMember[];
  stairOpenings: StairOpeningMember[];
  stairTrimmers: StairTrimmerMember[];
  stairConnections: StairConnection[];
  connections: StructuralConnectionGroup[];
  checks: FramingCheck[];
  reviewGates: FramingReviewGate[];
  sources: FramingRuleSource[];
  status: FramingStatus;
}

export interface GenerateFramingInput {
  snowLoadKpa: number;
  municipality: string;
  treatment?: 'incised' | 'not-incised';
  soilBearingKpa?: number;
}

export class FramingDesignError extends Error {
  constructor(public readonly code: 'empty-design' | 'invalid-platform' | 'unsupported-joist-direction', message: string) {
    super(message);
    this.name = 'FramingDesignError';
  }
}
