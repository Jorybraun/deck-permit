export type PointMm = readonly [xMm: number, yMm: number];

export interface BoundaryVertex {
  id: string;
  xMm: number;
  yMm: number;
}

export interface ClosedBoundary {
  schema: 'closed-boundary/v1';
  vertices: BoundaryVertex[];
}

export type PlatformEdgeRole = 'house' | 'open' | 'guard' | 'stair' | 'shared';

export interface PlatformEdge {
  id: string;
  startVertexId: string;
  endVertexId: string;
  role: PlatformEdgeRole;
  hostId?: string;
}

export interface PlatformFramingIntent {
  supportStrategy: 'auto' | 'ledger' | 'freestanding';
  joistDirectionDeg: 'auto' | number;
  joistSpacingMm: 300 | 400 | 600;
}

export interface PlatformFinish {
  decking: string;
  deckingThicknessMm: number;
  borderBoards: number;
  boardDirectionDeg: 'auto' | number;
  guardSystem: string;
}

export interface DeckPlatform {
  id: string;
  name: string;
  /** A landing is still a fully framed platform; this role only describes its circulation purpose. */
  purpose?: 'deck' | 'landing';
  boundary: ClosedBoundary;
  elevationMm: number;
  edges: PlatformEdge[];
  framingIntent: PlatformFramingIntent;
  finish: PlatformFinish;
}

export type VerticalEndpoint =
  | { kind: 'platform'; platformId: string }
  | { kind: 'terrain'; elevationMm: number };

export interface DeckStair {
  id: string;
  name: string;
  from: VerticalEndpoint;
  to: VerticalEndpoint;
  fromEdgeId?: string;
  toEdgeId?: string;
  /** Normalized position along the connected platform edge; keeps Point A attached through edits. */
  fromEdgeT?: number;
  /** Normalized position along the destination edge; keeps Point B attached through edits. */
  toEdgeT?: number;
  startMm: PointMm;
  endMm: PointMm;
  directionDeg: number;
  widthMm: number;
  landingDepthMm: number;
  stringerCount: number;
  handrailSides: 'none' | 'left' | 'right' | 'both';
  riserCount: number;
  riserHeightMm: number;
  treadDepthMm: number;
  totalRunMm: number;
}

export interface DeckDesign {
  schema: 'deck-design/v1';
  units: 'mm';
  platforms: DeckPlatform[];
  stairs: DeckStair[];
  selectedObjectId: string | null;
  updatedAt: string;
}

export interface BoundaryAssessment {
  areaSqM: number;
  widthMm: number;
  depthMm: number;
  minXmm: number;
  minYmm: number;
  maxXmm: number;
  maxYmm: number;
  errors: string[];
  warnings: string[];
}

export interface DesignAssessment {
  areaSqM: number;
  errors: Array<{ objectId: string; message: string }>;
  warnings: Array<{ objectId: string; message: string }>;
}

export interface AddPlatformInput {
  name?: string;
  purpose?: DeckPlatform['purpose'];
  boundary: ClosedBoundary;
  elevationMm: number;
  houseEdgeIndex?: number;
}

export interface AddStairInput {
  name?: string;
  from: VerticalEndpoint;
  to: VerticalEndpoint;
  fromEdgeId?: string;
  toEdgeId?: string;
  startMm: PointMm;
  endMm?: PointMm;
  directionDeg: number;
  widthMm?: number;
  landingDepthMm?: number;
  stringerCount?: number;
  handrailSides?: DeckStair['handrailSides'];
  treadDepthMm?: number;
  riserCount?: number;
}

export interface PointToPointStairGeometry {
  status: 'valid' | 'no-stair' | 'invalid-rise' | 'too-short' | 'too-long';
  riseMm: number;
  runMm: number;
  minimumRunMm: number;
  maximumRunMm: number;
  riserCount?: number;
  riserHeightMm?: number;
  treadCount?: number;
  treadDepthMm?: number;
}

export interface StairLandingCandidate {
  platformId: string;
  platformName: string;
  elevationMm: number;
  edgeId: string;
  pointMm: PointMm;
  distanceFromCurrentEndMm: number;
}
