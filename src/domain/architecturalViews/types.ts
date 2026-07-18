import type { DeckDesign, DeckPlatform } from '../deckDesign';
import type { FramingDesign } from '../framingDesign';
import type { SiteModel } from '../siteModel';

export type ProjectionAxis = readonly [x: number, y: number];
export type OrthographicViewKey = 'house-wall' | 'yard-section' | `edge:${string}:${number}`;

export interface OrthographicPlatform {
  id: string;
  name: string;
  purpose: DeckPlatform['purpose'];
  minimumProjectionMm: number;
  maximumProjectionMm: number;
  surfaceElevationMm: number;
  localGradeElevationMm: number;
  deckingThicknessMm: number;
  joistDepthMm: number;
  beamDepthMm: number;
  joistLabel: string;
  beamLabel: string;
  finishLabel: string;
}

export interface OrthographicHouseOpening {
  id: string;
  kind: 'door' | 'window';
  minimumProjectionMm: number;
  maximumProjectionMm: number;
  sillElevationMm: number;
  headElevationMm: number;
}

export interface OrthographicStair {
  id: string;
  name: string;
  startProjectionMm: number;
  endProjectionMm: number;
  startElevationMm: number;
  endElevationMm: number;
  riserCount: number;
  riserHeightMm: number;
  treadDepthMm: number;
  widthMm: number;
  handrailSides: DeckDesign['stairs'][number]['handrailSides'];
  destinationLabel: string;
}

export interface OrthographicPost {
  id: string;
  platformId: string;
  projectionMm: number;
  bottomElevationMm: number;
  topElevationMm: number;
  section: string;
}

export interface OrthographicFooting {
  id: string;
  postId: string;
  projectionMm: number;
  gradeElevationMm: number;
  widthMm: number;
  lengthMm: number;
}

export interface OrthographicGuard {
  id: string;
  platformId: string;
  minimumProjectionMm: number;
  maximumProjectionMm: number;
  baseElevationMm: number;
  topElevationMm: number;
  system: string;
}

export interface OrthographicGradePoint {
  id: string;
  projectionMm: number;
  elevationMm: number;
  observed: boolean;
}

export interface OrthographicProjection {
  schema: 'orthographic-projection/v1';
  axis: ProjectionAxis;
  minimumProjectionMm: number;
  maximumProjectionMm: number;
  minimumElevationMm: number;
  maximumElevationMm: number;
  house: {
    minimumProjectionMm: number;
    maximumProjectionMm: number;
    baseElevationMm: number;
    topElevationMm: number;
    openings: OrthographicHouseOpening[];
  };
  platforms: OrthographicPlatform[];
  stairs: OrthographicStair[];
  posts: OrthographicPost[];
  footings: OrthographicFooting[];
  guards: OrthographicGuard[];
  gradePoints: OrthographicGradePoint[];
}

export interface CreateOrthographicProjectionInput {
  design: DeckDesign;
  site: SiteModel;
  framing?: FramingDesign;
  axis: ProjectionAxis;
  elevationOverrides?: Readonly<Record<string, number>>;
}
