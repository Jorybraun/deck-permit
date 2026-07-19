import type { DeckDesign, DeckPlatform, PlatformEdge, PointMm } from '../deckDesign';
import type { HouseOpening, SiteModel } from './types';
import { architecturalCoordinationProfileForMunicipality, architecturalRule, architecturalRuleParameter, type ArchitecturalCoordinationProfile, type ArchitecturalRuleClassification } from './architecturalCoordinationProfile';

export type WallOpeningCoordinationStatus = 'pass' | 'review' | 'blocked';
export type WallOpeningCheckKind = 'opening-evidence' | 'house-edge-alignment' | 'door-access' | 'window-clearance' | 'ledger-zone';

export interface WallOpeningCoordinationCheck {
  id: string;
  kind: WallOpeningCheckKind;
  status: WallOpeningCoordinationStatus;
  openingId: string | null;
  platformId: string | null;
  message: string;
  basis: string;
  ruleId: string;
  basisType: ArchitecturalRuleClassification;
  horizontalOverlapMm: number;
}

export interface WallOpeningCoordinationAssessment {
  schema: 'wall-opening-coordination/v2';
  status: WallOpeningCoordinationStatus;
  profile: ArchitecturalCoordinationProfile;
  checks: WallOpeningCoordinationCheck[];
  blockedCount: number;
  reviewCount: number;
}

/**
 * Coordinates modeled platforms with recorded wall openings. These are geometric
 * design checks, not code certification: operability, egress, guards, flashing,
 * waterproofing, and structural headers remain professional review items.
 */
export function assessWallOpeningCoordination(design: DeckDesign, site: SiteModel, municipality = 'British Columbia'): WallOpeningCoordinationAssessment {
  const profile = architecturalCoordinationProfileForMunicipality(municipality);
  const wallAlignmentToleranceMm = architecturalRuleParameter(profile, 'AC-02-house-edge-datum', 'wallAlignmentToleranceMm');
  const checks: WallOpeningCoordinationCheck[] = [];
  const hostedEdges = design.platforms.flatMap((platform) => platform.edges
    .filter((edge) => edge.role === 'house')
    .map((edge) => ({ platform, edge, points: edgePoints(platform, edge) })));

  for (const opening of site.designWall.openings) {
    if ((opening.evidenceStatus || 'field-measured') === 'photo-observed') checks.push({
      id: `${opening.id}-evidence`, kind: 'opening-evidence', status: 'review', openingId: opening.id, platformId: null, horizontalOverlapMm: 0,
      message: `${opening.id} ${opening.kind} is photo-observed. Measure its wall offset, width, sill, and head before relying on clearance checks.`,
      basis: 'A photograph establishes visible presence only unless a calibrated measurement workflow is recorded.',
      ruleId: 'AC-01-opening-evidence', basisType: architecturalRule(profile, 'AC-01-opening-evidence').classification,
    });
    if (opening.evidenceStatus === 'scaled-photo-derived') checks.push({
      id: `${opening.id}-evidence`, kind: 'opening-evidence', status: 'review', openingId: opening.id, platformId: null, horizontalOverlapMm: 0,
      message: `${opening.id} ${opening.kind} is scaled from a homeowner-calibrated wall photo. Verify its offset, width, sill, and head with a tape or laser before professional issue.`,
      basis: 'Two-axis affine photo calibration is a wall-plane field aid; it does not remove perspective error or establish concealed construction.',
      ruleId: 'AC-01-opening-evidence', basisType: architecturalRule(profile, 'AC-01-opening-evidence').classification,
    });

    for (const hosted of hostedEdges) {
      const alignmentOffsetMm = Math.max(Math.abs(hosted.points[0][1]), Math.abs(hosted.points[1][1]));
      if (alignmentOffsetMm > wallAlignmentToleranceMm) {
        checks.push({
          id: `${hosted.platform.id}-${hosted.edge.id}-wall-alignment`, kind: 'house-edge-alignment', status: 'blocked', openingId: null, platformId: hosted.platform.id, horizontalOverlapMm: 0,
          message: `${hosted.platform.name} marks ${hosted.edge.id} as a house edge, but it is ${Math.round(alignmentOffsetMm)} mm away from the selected wall datum. Reattach or reclassify the edge.`,
          basis: 'Opening offsets and ledger coordination are measured along the selected wall datum at y = 0.',
          ruleId: 'AC-02-house-edge-datum', basisType: architecturalRule(profile, 'AC-02-house-edge-datum').classification,
        });
        continue;
      }
      const overlapMm = intervalOverlap(opening.offsetMm, opening.offsetMm + opening.widthMm, Math.min(hosted.points[0][0], hosted.points[1][0]), Math.max(hosted.points[0][0], hosted.points[1][0]));
      if (overlapMm <= 0) continue;
      checks.push(...openingPlatformChecks(opening, hosted.platform, hosted.edge, overlapMm, site, profile));
    }
  }

  // Alignment is still a real error when there are no openings to trigger the loop.
  if (!site.designWall.openings.length) for (const hosted of hostedEdges) {
    const alignmentOffsetMm = Math.max(Math.abs(hosted.points[0][1]), Math.abs(hosted.points[1][1]));
    if (alignmentOffsetMm > wallAlignmentToleranceMm) checks.push({
      id: `${hosted.platform.id}-${hosted.edge.id}-wall-alignment`, kind: 'house-edge-alignment', status: 'blocked', openingId: null, platformId: hosted.platform.id, horizontalOverlapMm: 0,
      message: `${hosted.platform.name} marks ${hosted.edge.id} as a house edge, but it is ${Math.round(alignmentOffsetMm)} mm away from the selected wall datum. Reattach or reclassify the edge.`,
      basis: 'House-connected construction must be coordinated to the selected wall datum at y = 0.',
      ruleId: 'AC-02-house-edge-datum', basisType: architecturalRule(profile, 'AC-02-house-edge-datum').classification,
    });
  }

  const uniqueChecks = [...new Map(checks.map((check) => [check.id, check])).values()];
  const blockedCount = uniqueChecks.filter((check) => check.status === 'blocked').length;
  const reviewCount = uniqueChecks.filter((check) => check.status === 'review').length;
  return { schema: 'wall-opening-coordination/v2', status: blockedCount ? 'blocked' : reviewCount ? 'review' : 'pass', profile, checks: uniqueChecks, blockedCount, reviewCount };
}

function openingPlatformChecks(opening: HouseOpening, platform: DeckPlatform, edge: PlatformEdge, horizontalOverlapMm: number, site: SiteModel, profile: ArchitecturalCoordinationProfile): WallOpeningCoordinationCheck[] {
  const checks: WallOpeningCoordinationCheck[] = [];
  const heightMm = opening.heightMm ?? architecturalRuleParameter(profile, 'AC-06-provisional-opening-heights', opening.kind === 'door' ? 'provisionalDoorHeightMm' : 'provisionalWindowHeightMm');
  const openingHeadMm = opening.sillHeightMm + heightMm;
  const surfaceMm = platform.elevationMm;
  const openingLabel = `${opening.id} ${opening.kind}`;

  if (opening.kind === 'door') {
    const obstructionToleranceMm = architecturalRuleParameter(profile, 'AC-03-door-landing-transition', 'doorObstructionToleranceMm');
    const transitionReviewMm = architecturalRuleParameter(profile, 'AC-03-door-landing-transition', 'doorTransitionReviewMm');
    const thresholdDeltaMm = opening.sillHeightMm - surfaceMm;
    const status: WallOpeningCoordinationStatus = thresholdDeltaMm < -obstructionToleranceMm ? 'blocked' : thresholdDeltaMm > transitionReviewMm ? 'review' : 'pass';
    checks.push({
      id: `${platform.id}-${edge.id}-${opening.id}-door-access`, kind: 'door-access', status, openingId: opening.id, platformId: platform.id, horizontalOverlapMm,
      message: status === 'blocked'
        ? `${platform.name} surface is ${Math.abs(thresholdDeltaMm)} mm above ${openingLabel}'s recorded threshold and obstructs the access opening.`
        : status === 'review'
          ? `${platform.name} surface is ${thresholdDeltaMm} mm below ${openingLabel}'s threshold. Coordinate the landing/step condition, door swing, drainage, and accessible path.`
          : `${platform.name} surface is ${Math.max(0, thresholdDeltaMm)} mm below ${openingLabel}'s threshold; final door swing, landing, and drainage review remains required.`,
      basis: 'Architectural access and water-management coordination; this tolerance is a design screen, not a code-compliance determination.',
      ruleId: 'AC-03-door-landing-transition', basisType: architecturalRule(profile, 'AC-03-door-landing-transition').classification,
    });
  } else {
    const sillZoneBufferMm = architecturalRuleParameter(profile, 'AC-04-window-deck-interaction', 'windowSillZoneBufferMm');
    const proximityReviewMm = architecturalRuleParameter(profile, 'AC-04-window-deck-interaction', 'windowProximityReviewMm');
    const sillClearanceMm = opening.sillHeightMm - surfaceMm;
    const status: WallOpeningCoordinationStatus = surfaceMm >= opening.sillHeightMm - sillZoneBufferMm ? 'blocked' : sillClearanceMm < proximityReviewMm ? 'review' : 'pass';
    checks.push({
      id: `${platform.id}-${edge.id}-${opening.id}-window-clearance`, kind: 'window-clearance', status, openingId: opening.id, platformId: platform.id, horizontalOverlapMm,
      message: status === 'blocked'
        ? `${platform.name} surface at ${surfaceMm} mm reaches ${openingLabel}'s recorded ${opening.sillHeightMm} mm sill zone.`
        : status === 'review'
          ? `${openingLabel} sill is ${sillClearanceMm} mm above ${platform.name}. Confirm operability, safety glazing, fall protection, bedroom egress, and guard interaction.`
          : `${openingLabel} clears ${platform.name} surface by ${sillClearanceMm} mm; opening use and egress classification still require review.`,
      basis: 'Architectural opening and fall-protection coordination; window type, operability, glazing, and egress use are not inferred by the software.',
      ruleId: 'AC-04-window-deck-interaction', basisType: architecturalRule(profile, 'AC-04-window-deck-interaction').classification,
    });
  }

  const ledgerProposed = platform.framingIntent.supportStrategy !== 'freestanding';
  if (ledgerProposed) {
    const ledgerTopMm = surfaceMm - platform.finish.deckingThicknessMm;
    const ledgerDepthMm = site.designWall.rimDepthMm || architecturalRuleParameter(profile, 'AC-05-ledger-opening-zone', 'defaultLedgerDepthMm');
    const ledgerBottomMm = ledgerTopMm - ledgerDepthMm;
    const verticalOverlapMm = intervalOverlap(ledgerBottomMm, ledgerTopMm, opening.sillHeightMm, openingHeadMm);
    checks.push({
      id: `${platform.id}-${edge.id}-${opening.id}-ledger-zone`, kind: 'ledger-zone', status: verticalOverlapMm > 0 ? 'blocked' : 'pass', openingId: opening.id, platformId: platform.id, horizontalOverlapMm,
      message: verticalOverlapMm > 0
        ? `${platform.name}'s preliminary ledger zone overlaps ${openingLabel} by ${verticalOverlapMm} mm vertically across ${horizontalOverlapMm} mm of wall. Split, header, relocate, or use a reviewed freestanding strategy.`
        : `${platform.name}'s preliminary ledger zone does not intersect ${openingLabel}; flashing, substrate, fasteners, and load path remain unresolved.`,
      basis: `Preliminary ledger zone uses the deck surface less ${platform.finish.deckingThicknessMm} mm decking and a ${ledgerDepthMm} mm recorded/default rim depth. Final member depth and envelope detail govern.`,
      ruleId: 'AC-05-ledger-opening-zone', basisType: architecturalRule(profile, 'AC-05-ledger-opening-zone').classification,
    });
  }
  return checks;
}

function edgePoints(platform: DeckPlatform, edge: PlatformEdge): readonly [PointMm, PointMm] {
  const start = platform.boundary.vertices.find((vertex) => vertex.id === edge.startVertexId);
  const end = platform.boundary.vertices.find((vertex) => vertex.id === edge.endVertexId);
  return [[start?.xMm || 0, start?.yMm || 0], [end?.xMm || 0, end?.yMm || 0]];
}

function intervalOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.round(Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd)) - Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd))));
}
