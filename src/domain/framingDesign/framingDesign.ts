import { assessStairPlanGeometry, type DeckDesign, type DeckPlatform, type PointMm } from '../deckDesign';
import { assessExistingConditionCapture, terrainElevationAt, type SiteModel } from '../siteModel';
import { boundaryBounds, clipAxisLine, isAxisAlignedRectangle, isHorizontal, lineLength, platformEdgePoints, stationsAlong } from './geometry';
import { codeProfileForMunicipality, CWC_DECK_GUIDE, selectPreliminarySections } from './rules';
import type { BeamMember, FramingCheck, FramingDesign, FramingReviewGate, FramingStatus, GenerateFramingInput, GuardAssembly, JoistMember, LedgerMember, PlatformFramingSystem, StairStringerMember } from './types';
import { FramingDesignError } from './types';
import { generateStairConnectionFraming } from './stairConnections';

const DEAD_LOAD_KPA = 0.5;
const LIVE_LOAD_KPA = 1.9;
const DEFAULT_SOIL_BEARING_KPA = 75;
const MAX_POST_SPACING_MM = 1800;

/**
 * FramingDesign v1 owns generated structural intent for one canonical DeckDesign input.
 * It produces reviewable member geometry and rule provenance, never professional certification.
 */
export function generateFramingDesign(design: DeckDesign, site: SiteModel, input: GenerateFramingInput, generatedAt = new Date().toISOString()): FramingDesign {
  if (!design.platforms.length) throw new FramingDesignError('empty-design', 'Draw at least one platform before generating framing.');
  const treatment = input.treatment || 'incised';
  const soilBearingKpa = input.soilBearingKpa || DEFAULT_SOIL_BEARING_KPA;
  const assumptions = {
    deadLoadKpa: DEAD_LOAD_KPA,
    liveLoadKpa: LIVE_LOAD_KPA,
    snowLoadKpa: input.snowLoadKpa,
    governingAreaLoadKpa: DEAD_LOAD_KPA + Math.max(LIVE_LOAD_KPA, input.snowLoadKpa),
    soilBearingKpa,
    lumberSpecies: 'S-P-F' as const,
    lumberGrade: 'No.2 or better' as const,
    treatment,
    maximumPostSpacingMm: MAX_POST_SPACING_MM,
  };
  const platformSystems: PlatformFramingSystem[] = [];
  const joists: JoistMember[] = [];
  const beams: BeamMember[] = [];
  const ledgers: LedgerMember[] = [];
  const posts: FramingDesign['posts'] = [];
  const footings: FramingDesign['footings'] = [];
  const guards: GuardAssembly[] = [];
  const checks: FramingCheck[] = [];
  const stairEdgeIds = new Set(design.stairs.flatMap((stair) => [stair.fromEdgeId, stair.toEdgeId].filter((value): value is string => Boolean(value))));

  design.platforms.forEach((platform) => {
    if (platform.boundary.vertices.length < 3) throw new FramingDesignError('invalid-platform', `${platform.name} does not have a closed platform boundary.`);
    const bounds = boundaryBounds(platform.boundary);
    const rectangular = isAxisAlignedRectangle(platform.boundary);
    const houseEdge = platform.edges.find((edge) => edge.role === 'house') || null;
    const housePoints = houseEdge ? platformEdgePoints(platform, houseEdge.id) : null;
    const joistAxis = resolveJoistAxis(platform, housePoints);
    const supportStrategy = platform.framingIntent.supportStrategy === 'ledger' || (platform.framingIntent.supportStrategy === 'auto' && houseEdge)
      ? 'ledger' : 'freestanding';
    const mainMin = joistAxis === 'y' ? bounds.minY : bounds.minX;
    const mainMax = joistAxis === 'y' ? bounds.maxY : bounds.maxX;
    const supportCoordinates = supportLines(mainMin, mainMax, supportStrategy, housePoints, joistAxis);
    const joistDesignSpanMm = Math.max(300, Math.round(Math.abs(supportCoordinates[supportCoordinates.length - 1] - supportCoordinates[0])));
    const sections = selectPreliminarySections(joistDesignSpanMm, treatment);
    const houseAxisAligned = !housePoints || Math.abs(housePoints[1][0] - housePoints[0][0]) < 2 || Math.abs(housePoints[1][1] - housePoints[0][1]) < 2;
    const tableEligible = rectangular && supportStrategy === 'ledger' && Boolean(houseEdge) && houseAxisAligned
      && platform.framingIntent.joistSpacingMm === 400 && input.snowLoadKpa <= LIVE_LOAD_KPA
      && sections.joistMaxSpanMm !== null && sections.beamSection !== 'Engineer design';
    const structuralStatus: FramingStatus = tableEligible ? 'table-screened' : 'engineering-required';
    platformSystems.push({
      platformId: platform.id, joistAxis, joistDesignSpanMm, supportStrategy, rectangular,
      status: tableEligible ? 'review-required' : 'engineering-required',
      explanation: tableEligible
        ? `Axis-aligned single-span ledger layout screened against the CWC guide; attachment, lateral bracing, footings, guards, and connections remain excluded.`
        : framingReason(platform, rectangular, supportStrategy, houseEdge?.id || null, input.snowLoadKpa, sections.joistMaxSpanMm),
    });

    const crossMin = joistAxis === 'y' ? bounds.minX : bounds.minY;
    const crossMax = joistAxis === 'y' ? bounds.maxX : bounds.maxY;
    const joistStations = memberStations(crossMin, crossMax, platform.framingIntent.joistSpacingMm);
    joistStations.forEach((station, stationIndex) => {
      clipAxisLine(platform.boundary, joistAxis, station).forEach(([start, end], segmentIndex) => joists.push({
        id: `${platform.id}-J${stationIndex + 1}${segmentIndex ? `.${segmentIndex + 1}` : ''}`, platformId: platform.id,
        startMm: start, endMm: end, spanMm: joistDesignSpanMm, spacingMm: platform.framingIntent.joistSpacingMm,
        section: tableEligible ? sections.joistSection : 'Engineer design', status: structuralStatus, ruleId: CWC_DECK_GUIDE.id,
      }));
    });

    if (supportStrategy === 'ledger' && houseEdge && housePoints) ledgers.push({
      id: `${platform.id}-L1`, platformId: platform.id, edgeId: houseEdge.id, startMm: housePoints[0], endMm: housePoints[1],
      lengthMm: lineLength(housePoints[0], housePoints[1]), section: sections.joistSection === 'Engineer design' ? 'Engineer design' : `Match joist depth · ${sections.joistSection}`, status: 'review-required',
    });

    const beamCoordinates = supportStrategy === 'ledger' ? supportCoordinates.slice(1) : supportCoordinates;
    beamCoordinates.forEach((coordinate, supportIndex) => {
      const beamAxis = joistAxis === 'y' ? 'x' : 'y';
      clipAxisLine(platform.boundary, beamAxis, coordinate).forEach(([start, end], segmentIndex) => {
        const beam: BeamMember = {
          id: `${platform.id}-B${supportIndex + 1}${segmentIndex ? `.${segmentIndex + 1}` : ''}`, platformId: platform.id, startMm: start, endMm: end,
          lengthMm: lineLength(start, end), section: tableEligible ? sections.beamSection : 'Engineer design',
          supportRole: supportIndex === beamCoordinates.length - 1 ? 'exterior-beam' : 'interior-beam', status: structuralStatus, ruleId: CWC_DECK_GUIDE.id,
        };
        beams.push(beam);
        const reactionKn = round(assumptions.governingAreaLoadKpa * (MAX_POST_SPACING_MM / 1000) * (joistDesignSpanMm / 1000) / 2, 2);
        stationsAlong(start, end, MAX_POST_SPACING_MM).forEach((point, postIndex) => {
          const postId = `${beam.id}-P${postIndex + 1}`;
          const grade = terrainElevationAt(site.terrain, point);
          posts.push({ id: postId, platformId: platform.id, beamId: beam.id, pointMm: point, heightMm: Math.max(0, platform.elevationMm - grade.elevationMm), section: tableEligible ? '140×140 (6×6)' : 'Engineer design', estimatedReactionKn: reactionKn, status: structuralStatus });
          const footingSide = Math.max(300, Math.ceil(Math.sqrt(reactionKn / soilBearingKpa) * 1000 / 50) * 50);
          footings.push({ id: `${postId}-F`, platformId: platform.id, postId, centerMm: point, widthMm: footingSide, lengthMm: footingSide, depthMm: null, assumedSoilBearingKpa: soilBearingKpa, estimatedReactionKn: reactionKn, status: 'review-required' });
        });
      });
    });

    platform.edges.forEach((edge, edgeIndex) => {
      if (stairEdgeIds.has(edge.id) || edge.role === 'house' || edge.role === 'shared' || edge.role === 'stair') return;
      const start = platform.boundary.vertices[edgeIndex]; const end = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
      const edgePoints: PointMm[] = [[start.xMm, start.yMm], [(start.xMm + end.xMm) / 2, (start.yMm + end.yMm) / 2], [end.xMm, end.yMm]];
      const maximumDropMm = Math.max(...edgePoints.map((point) => platform.elevationMm - terrainElevationAt(site.terrain, point).elevationMm));
      if (edge.role !== 'guard' && maximumDropMm <= 600) return;
      guards.push({ id: `${platform.id}-G${edgeIndex + 1}`, platformId: platform.id, edgeId: edge.id, startMm: [start.xMm, start.yMm], endMm: [end.xMm, end.yMm], heightMm: maximumDropMm > 1800 ? 1070 : 900, system: platform.finish.guardSystem, status: 'review-required' });
    });

    checks.push({
      id: `${platform.id}-member-sizing`, title: `${platform.name} member sizing`, objectId: platform.id,
      status: tableEligible ? 'pass' : 'blocked',
      result: tableEligible ? `${sections.joistSection} joists at 400 mm o.c.; ${sections.beamSection}; 1.8 m maximum post spacing.` : 'Generated layout requires project-specific structural design.',
      basis: tableEligible ? `${CWC_DECK_GUIDE.title}; ${CWC_DECK_GUIDE.edition}.` : framingReason(platform, rectangular, supportStrategy, houseEdge?.id || null, input.snowLoadKpa, sections.joistMaxSpanMm),
    });
  });

  const stairStringers = generateStairStringers(design);
  const stairConnectionFraming = generateStairConnectionFraming(design);
  const invalidStairCount = design.stairs.filter((stair) => assessStairPlanGeometry(design, stair).status !== 'valid').length;
  if (design.stairs.length) checks.push({
    id: 'stair-connections', title: 'Hosted stair openings and connections', objectId: 'framing', status: invalidStairCount ? 'blocked' : 'review',
    result: `${stairConnectionFraming.openings.length} header opening(s), ${stairConnectionFraming.trimmers.length} trimmer line(s), and ${stairConnectionFraming.connections.length} endpoint connection(s) generated.${invalidStairCount ? ` ${invalidStairCount} stair flight(s) have unresolved A→B geometry.` : ''}`,
    basis: 'Connection geometry is coordinated to hosted platform edges. Header capacity, stringer hardware, fasteners, reactions, and landing support remain project-specific structural design.',
  });
  checks.push(...globalChecks(site, footings.length, ledgers.length, guards.length, stairStringers.length));
  const hasEngineering = platformSystems.some((system) => system.status === 'engineering-required');
  const reviewGates = buildReviewGates(site, hasEngineering, ledgers.length, guards.length, stairStringers.length);
  return {
    schema: 'framing-design/v1', units: 'mm', inputFingerprint: framingInputFingerprint(design, site, input), generatedAt,
    codeProfile: codeProfileForMunicipality(input.municipality), assumptions, platformSystems, joists, beams, ledgers, posts, footings, guards, stairStringers,
    stairOpenings: stairConnectionFraming.openings, stairTrimmers: stairConnectionFraming.trimmers, stairConnections: stairConnectionFraming.connections,
    checks, reviewGates, sources: [CWC_DECK_GUIDE], status: hasEngineering ? 'engineering-required' : 'review-required',
  };
}

export function framingInputFingerprint(design: DeckDesign, site: SiteModel, input: GenerateFramingInput): string {
  const structuralInput = {
    platforms: design.platforms.map((platform) => ({ id: platform.id, boundary: platform.boundary.vertices.map(({ xMm, yMm }) => [xMm, yMm]), elevationMm: platform.elevationMm, edges: platform.edges.map(({ id, role, hostId }) => ({ id, role, hostId })), framingIntent: platform.framingIntent, finish: { decking: platform.finish.decking, deckingThicknessMm: platform.finish.deckingThicknessMm, guardSystem: platform.finish.guardSystem } })),
    stairs: design.stairs.map((stair) => ({ id: stair.id, from: stair.from, to: stair.to, fromEdgeId: stair.fromEdgeId, toEdgeId: stair.toEdgeId, startMm: stair.startMm, endMm: stair.endMm, directionDeg: stair.directionDeg, widthMm: stair.widthMm, riserCount: stair.riserCount, riserHeightMm: stair.riserHeightMm, treadDepthMm: stair.treadDepthMm, totalRunMm: stair.totalRunMm, stringerCount: stair.stringerCount, handrailSides: stair.handrailSides })),
    site: { terrain: site.terrain, capture: site.capture.evidence.map(({ id, category, sha256, status }) => ({ id, category, sha256, status })), wall: { selectionStatus: site.designWall.selectionStatus, sourceBuildingId: site.designWall.sourceBuildingId, sourceEdgeIndex: site.designWall.sourceEdgeIndex, lengthMm: site.designWall.lengthMm, rimMaterial: site.designWall.rimMaterial, rimDepthMm: site.designWall.rimDepthMm, cladding: site.designWall.cladding, flashingFeasible: site.designWall.flashingFeasible } },
    input: { municipality: input.municipality, snowLoadKpa: input.snowLoadKpa, treatment: input.treatment || 'incised', soilBearingKpa: input.soilBearingKpa || DEFAULT_SOIL_BEARING_KPA },
  };
  return `fd2-${fnv1a(JSON.stringify(structuralInput))}`;
}

export function isFramingStale(framing: FramingDesign | null, design: DeckDesign, site: SiteModel, input: GenerateFramingInput): boolean {
  return !framing || framing.inputFingerprint !== framingInputFingerprint(design, site, input);
}

function resolveJoistAxis(platform: DeckPlatform, housePoints: readonly [PointMm, PointMm] | null): 'x' | 'y' {
  if (typeof platform.framingIntent.joistDirectionDeg === 'number') {
    const angle = ((platform.framingIntent.joistDirectionDeg % 180) + 180) % 180;
    if (angle <= 5 || angle >= 175) return 'x';
    if (Math.abs(angle - 90) <= 5) return 'y';
  }
  if (housePoints) return isHorizontal(housePoints[0], housePoints[1]) ? 'y' : 'x';
  const bounds = boundaryBounds(platform.boundary);
  return bounds.width <= bounds.height ? 'x' : 'y';
}

function supportLines(minimum: number, maximum: number, strategy: 'ledger' | 'freestanding', housePoints: readonly [PointMm, PointMm] | null, axis: 'x' | 'y'): number[] {
  const inset = Math.min(150, Math.max(50, (maximum - minimum) / 10));
  if (strategy === 'freestanding') return [minimum + inset, maximum - inset];
  const ledgerCoordinate = housePoints ? average(housePoints.map((point) => axis === 'y' ? point[1] : point[0])) : minimum;
  const exterior = Math.abs(ledgerCoordinate - minimum) <= Math.abs(ledgerCoordinate - maximum) ? maximum - inset : minimum + inset;
  return [ledgerCoordinate, exterior];
}

function memberStations(minimum: number, maximum: number, spacingMm: number): number[] {
  if (maximum - minimum <= 100) return [(minimum + maximum) / 2];
  const stations: number[] = [];
  for (let value = minimum + 50; value < maximum; value += spacingMm) stations.push(Math.round(value));
  if (!stations.length || maximum - stations[stations.length - 1] > spacingMm) stations.push(Math.round(maximum - 50));
  return stations;
}

function framingReason(platform: DeckPlatform, rectangular: boolean, strategy: 'ledger' | 'freestanding', houseEdgeId: string | null, snowLoadKpa: number, maxSpanMm: number | null): string {
  if (!rectangular) return 'Irregular platform geometry is outside the encoded rectangular CWC table configuration; joist regions and beam reactions require structural review.';
  if (strategy === 'freestanding') return 'The encoded table slice does not cover this generated two-beam freestanding load path.';
  if (!houseEdgeId) return 'Ledger framing was requested without a platform edge classified as house attachment.';
  if (platform.framingIntent.joistSpacingMm !== 400) return `The encoded table slice is limited to 400 mm joist spacing, not ${platform.framingIntent.joistSpacingMm} mm.`;
  if (snowLoadKpa > LIVE_LOAD_KPA) return `Site snow load ${snowLoadKpa.toFixed(2)} kPa exceeds the guide's 1.9 kPa load basis.`;
  if (!maxSpanMm) return 'The generated joist span exceeds the encoded CWC rows.';
  return 'The proposed framing configuration needs project-specific structural review.';
}

function generateStairStringers(design: DeckDesign): StairStringerMember[] {
  return design.stairs.flatMap((stair) => {
    const riseMm = Math.abs(endpointElevation(design, stair.from) - endpointElevation(design, stair.to));
    const count = stair.stringerCount ?? Math.max(3, Math.ceil(stair.widthMm / 450) + 1);
    const runMm = Math.round(Math.hypot(stair.endMm[0] - stair.startMm[0], stair.endMm[1] - stair.startMm[1]));
    const direction: PointMm = runMm ? [(stair.endMm[0] - stair.startMm[0]) / runMm, (stair.endMm[1] - stair.startMm[1]) / runMm] : [1, 0];
    const lateral: PointMm = [-direction[1], direction[0]];
    return Array.from({ length: count }, (_, index) => {
      const offset = count === 1 ? 0 : -stair.widthMm / 2 + stair.widthMm * index / (count - 1);
      const start: PointMm = [Math.round(stair.startMm[0] + lateral[0] * offset), Math.round(stair.startMm[1] + lateral[1] * offset)];
      const end: PointMm = [Math.round(stair.endMm[0] + lateral[0] * offset), Math.round(stair.endMm[1] + lateral[1] * offset)];
      return { id: `${stair.id}-STR${index + 1}`, stairId: stair.id, startMm: start, endMm: end, runMm, riseMm, section: 'Engineer / manufacturer design', status: 'review-required' };
    });
  });
}

function endpointElevation(design: DeckDesign, endpoint: DeckDesign['stairs'][number]['from']): number {
  return endpoint.kind === 'terrain' ? endpoint.elevationMm : design.platforms.find((platform) => platform.id === endpoint.platformId)?.elevationMm || 0;
}

function globalChecks(site: SiteModel, footingCount: number, ledgerCount: number, guardCount: number, stringerCount: number): FramingCheck[] {
  return [
    { id: 'footing-bearing', title: 'Footings and soil', objectId: 'framing', status: 'review', result: `${footingCount} preliminary bearing-only footing sizes generated.`, basis: 'Assumed soil bearing only; frost depth, soil, uplift, thickness, reinforcement, and setbacks require verification.' },
    { id: 'lateral-load-path', title: 'Lateral load path', objectId: 'framing', status: 'blocked', result: 'No automatic lateral bracing or house lateral-tie design has been certified.', basis: CWC_DECK_GUIDE.exclusions.join(', ') },
    { id: 'ledger-envelope', title: 'Ledger and building envelope', objectId: 'site', status: ledgerCount && site.designWall.selectionStatus === 'field-measured' && site.designWall.rimMaterial !== 'unknown' && site.designWall.flashingFeasible === 'yes' ? 'review' : ledgerCount ? 'blocked' : 'pass', result: ledgerCount ? `${ledgerCount} ledger line(s); wall substrate and flashing inputs ${site.designWall.selectionStatus === 'field-measured' ? 'recorded' : 'not field-confirmed'}.` : 'No ledger lines generated.', basis: 'House attachment and waterproofing are excluded from the span guide and require project-specific review.' },
    { id: 'guards', title: 'Guards', objectId: 'framing', status: guardCount ? 'review' : 'pass', result: `${guardCount} guard edge${guardCount === 1 ? '' : 's'} generated from platform elevation and edge roles.`, basis: 'Guard system capacity, posts, anchorage, openings, and climbability require code/product review.' },
    { id: 'stairs', title: 'Stair structure', objectId: 'framing', status: stringerCount ? 'review' : 'pass', result: `${stringerCount} stair stringer line${stringerCount === 1 ? '' : 's'} generated.`, basis: 'Stringer sizing, connections, landings, guards, and handrails require structural and code review.' },
  ];
}

function buildReviewGates(site: SiteModel, engineering: boolean, ledgerCount: number, guardCount: number, stringerCount: number): FramingReviewGate[] {
  const capture = assessExistingConditionCapture(site.capture, { hasDoor: site.designWall.openings.some((opening) => opening.kind === 'door') });
  return [
    { id: 'field-geometry', discipline: 'site', title: 'Field-verify house, grade, and property offsets', status: site.designWall.selectionStatus === 'field-measured' && site.terrain.gradePoints.length >= 3 && site.terrain.gradePoints.every((point) => point.verificationStatus !== 'reference') ? 'not-required' : 'required', reason: 'Municipal GIS, provisional alignment, and an assumed grade datum are not construction measurements.' },
    { id: 'existing-condition-capture', discipline: 'site', title: 'Complete and confirm existing-condition photo set', status: capture.readyForProfessionalReview ? 'not-required' : 'required', reason: capture.readyForAiDraft ? 'Required views are recorded but still need homeowner confirmation and reviewer acceptance.' : `${capture.recordedRequiredCount} of ${capture.requiredCount} required photo views are recorded.` },
    { id: 'structural-design', discipline: 'structural', title: 'Structural member and load-path review', status: engineering ? 'required' : 'not-required', reason: engineering ? 'At least one platform lies outside the encoded prescriptive table slice.' : 'Gravity member sizes are table-screened, subject to all remaining gates.' },
    { id: 'footing-design', discipline: 'structural', title: 'Footing, frost, soil, uplift, and lateral design', status: 'required', reason: 'The CWC span guide explicitly excludes footings and lateral bracing.' },
    { id: 'connection-design', discipline: 'structural', title: 'Beam, post, joist, and lateral connections', status: 'required', reason: 'Connector types, fastener schedules, splices, bearing, and lateral ties are not automatically certified.' },
    { id: 'ledger-envelope', discipline: 'building-envelope', title: 'Ledger substrate and flashing review', status: ledgerCount ? 'required' : 'not-required', reason: ledgerCount ? 'House attachment and water management require field evidence and a reviewed detail.' : 'No ledger is proposed.' },
    { id: 'guard-system', discipline: 'code', title: 'Guard system and anchorage review', status: guardCount ? 'required' : 'not-required', reason: guardCount ? 'Life-safety guard assemblies require compliant system and connection data.' : 'No guard edges were generated.' },
    { id: 'stair-system', discipline: 'code', title: 'Stair, landing, guard, and handrail review', status: stringerCount ? 'required' : 'not-required', reason: stringerCount ? 'Vertical circulation requires coordinated structural and code review.' : 'No stairs are present.' },
  ];
}

function average(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function round(value: number, decimals: number): number { const scale = 10 ** decimals; return Math.round(value * scale) / scale; }
function fnv1a(value: string): string { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(16).padStart(8, '0'); }
