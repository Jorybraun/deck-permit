import type { DeckDesign, DeckPlatform, PointMm } from '../domain/deckDesign';
import type { FramingDesign } from '../domain/framingDesign';
import { projectPropertyToLocal, terrainElevationAt, type LocalPropertyGeometry, type SiteModel } from '../domain/siteModel';
import type { PlanSheet, Property } from '../types';

const CONTENT_BOTTOM = 970;

interface CanonicalPlanSetInput {
  property: Property;
  site: SiteModel;
  design: DeckDesign;
  framing: FramingDesign;
  revision?: number;
  issuedAt?: string;
}

export interface CanonicalPlanSet {
  fingerprint: string;
  sheets: PlanSheet[];
}

interface IssueMeta { fingerprint: string; revision: number; issuedAt: string }

/** Generates seven coordinated 11×17 review sheets from canonical v1 design/framing. */
export function generateCanonicalPlanSet(input: CanonicalPlanSetInput): CanonicalPlanSet {
  const issue: IssueMeta = {
    fingerprint: `DP-${input.framing.inputFingerprint.slice(-8).toUpperCase()}`,
    revision: input.revision || 1,
    issuedAt: input.issuedAt || new Date().toISOString(),
  };
  const sheets = [
    coverSheet(input, issue),
    siteSheet(input, issue),
    framingSheet(input, issue),
    elevationSheet(input, issue),
    sectionSheet(input, issue),
    detailSheet(input, issue),
    calculationSheet(input, issue),
  ];
  return { fingerprint: issue.fingerprint, sheets };
}

function coverSheet(input: CanonicalPlanSetInput, issue: IssueMeta): PlanSheet {
  const { property, site, design, framing } = input;
  const totalArea = design.platforms.reduce((sum, platform) => sum + polygonArea(platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm])) / 1_000_000, 0);
  const projectRows = [
    ['Project', 'Exterior residential deck alteration / addition'],
    ['Address', property.address?.fullAddress || 'Address unconfirmed'],
    ['Parcel', `PID ${property.parcel?.pid || 'unconfirmed'} · Plan ${property.parcel?.planNumber || 'unconfirmed'}`],
    ['Jurisdiction', `${property.parcel?.municipality || property.address?.locality || 'Unconfirmed'} · ${property.zoning?.zone || 'zone unconfirmed'}`],
    ['Deck design', `${design.platforms.length} platform(s) · ${totalArea.toFixed(1)} m² · ${design.stairs.length} stair(s)`],
    ['Code profile', `${framing.codeProfile.label} · effective ${framing.codeProfile.effectiveDate}`],
    ['Design loads', `${framing.assumptions.deadLoadKpa.toFixed(2)} kPa dead + max(${framing.assumptions.liveLoadKpa.toFixed(2)} live, ${framing.assumptions.snowLoadKpa.toFixed(2)} snow)`],
    ['Existing wall', `${site.designWall.label} · ${site.designWall.lengthMm} mm · ${site.designWall.selectionStatus}`],
    ['Issue', `Rev ${pad(issue.revision)} · ${issue.fingerprint}`],
  ];
  const indexRows = [
    ['A0.0', 'Cover, project data, drawing index'], ['A1.0', 'Site and dimensioned deck plan'], ['S1.0', 'Framing plan and member schedule'],
    ['A2.0', 'Platform and stair elevations'], ['S2.0', 'Typical building sections'], ['A3.0', 'Stair, guard, footing, connection details'], ['S3.0', 'Design basis, checks, review gates'],
  ];
  const required = framing.reviewGates.filter((gate) => gate.status === 'required');
  return makeSheet('cover', 'Cover & Project Data', 'NTS', 'A0.0', input, issue, `
    <text class="sheet-heading" x="70" y="92">DECK PERMIT REVIEW SET</text>
    <text class="subheading" x="70" y="128">${esc(property.address?.fullAddress || 'Address unconfirmed')}</text>
    ${notice(70, 160, 1560, 78, 'ISSUED FOR COORDINATED PROFESSIONAL REVIEW — NOT FOR CONSTRUCTION', 'Field geometry, structural capacity, footings, connections, guards, stairs, and municipal requirements remain subject to the review gates shown in this set.')}
    <text class="section" x="70" y="286">PROJECT DATA</text>${table(projectRows, 70, 310, 850, 48, 185)}
    <text class="section" x="970" y="286">DRAWING INDEX</text>${table(indexRows, 970, 310, 660, 42, 100)}
    <text class="section" x="970" y="648">REQUIRED REVIEW WORK PACKAGES</text>
    ${required.slice(0, 5).map((gate, index) => statusBox(970, 675 + index * 52, 660, gate.discipline.toUpperCase(), gate.title, 'review')).join('')}
    ${notice(70, 790, 850, 120, 'GENERAL NOTES', 'Do not scale drawings. Written dimensions govern. Verify property boundaries, house wall, openings, grade, utilities, and existing construction before issue. No construction may begin until the authority having jurisdiction issues a permit and required professional documents are accepted.')}`);
}

function siteSheet(input: CanonicalPlanSetInput, issue: IssueMeta): PlanSheet {
  const geometry = projectPropertyToLocal(input.property, input.site);
  const points = [...(geometry?.parcel || []), ...input.design.platforms.flatMap((platform) => platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm]))];
  const tx = drawingTransform(points, { x: 70, y: 90, width: 1110, height: 760 });
  const siteDrawing = geometry ? siteGeometrySvg(geometry, input.design, input.site, tx) : `<text class="note" x="120" y="180">Municipal parcel geometry unavailable. Provide an accepted dimensioned survey.</text>`;
  const zoning = input.property.zoning;
  const rows = [
    ['PID', input.property.parcel?.pid || 'unconfirmed'], ['Lot area', input.property.parcel?.areaSqm ? `${input.property.parcel.areaSqm.toFixed(0)} m²` : 'unconfirmed'],
    ['Zone', zoning?.zone || 'unconfirmed'], ['Front yard', zoning ? `${zoning.setbacks.front} m` : 'unconfirmed'], ['Rear yard', zoning ? `${zoning.setbacks.rear} m` : 'unconfirmed'],
    ['Interior side', zoning ? `${zoning.setbacks.side} m` : 'unconfirmed'], ['Exterior side', zoning ? `${zoning.setbacks.exteriorSide} m` : 'unconfirmed'],
    ['Wall evidence', input.site.designWall.selectionStatus], ['Geometry status', input.site.status],
  ];
  return makeSheet('site', 'Site & Dimensioned Deck Plan', 'DIAGRAMMATIC · DIMENSIONS GOVERN', 'A1.0', input, issue, `
    <text class="view-title" x="625" y="68" text-anchor="middle">SITE AND DECK LOCATION PLAN</text>
    <rect x="55" y="78" width="1140" height="810" class="panel"/>${siteDrawing}
    <rect x="1230" y="78" width="400" height="810" class="panel"/><text class="section" x="1260" y="118">SITE / ZONING SCHEDULE</text>${table(rows, 1260, 142, 340, 46, 145)}
    <text class="section" x="1260" y="600">EVIDENCE BASIS</text>${noteList(input.property.evidence.slice(0, 5).map((source) => `${source.label}: ${source.status}; retrieved ${source.retrievedAt.slice(0, 10)}.`), 1260, 628, 50, 330)}
    ${notice(1230, 825, 400, 64, 'SURVEY / SETBACK GATE', 'Municipal GIS is reference evidence, not a legal survey. Confirm deck and footing offsets before permit submission.')}`);
}

function framingSheet(input: CanonicalPlanSetInput, issue: IssueMeta): PlanSheet {
  const { design, framing } = input;
  const tx = drawingTransform(designAndFramingPoints(design, framing), { x: 70, y: 95, width: 1080, height: 720 });
  const schedule = [
    ['Joists', `${framing.joists.length} · ${unique(framing.joists.map((member) => member.section)).join(' / ')}`],
    ['Beams', `${framing.beams.length} · ${unique(framing.beams.map((member) => member.section)).join(' / ')}`],
    ['Ledgers', `${framing.ledgers.length} · attachment / flashing review required`], ['Posts', `${framing.posts.length} · ${unique(framing.posts.map((member) => member.section)).join(' / ')}`],
    ['Footings', `${framing.footings.length} preliminary bearing pads · depth unresolved`], ['Guards', `${framing.guards.length} exposed edge assemblies`],
    ['Stringers', `${framing.stairStringers.length} review-required lines`], ['Overall status', framing.status.replace(/-/g, ' ')],
  ];
  return makeSheet('framing', 'Framing Plan & Member Schedule', 'DIMENSIONED MODEL · DO NOT SCALE', 'S1.0', input, issue, `
    <text class="view-title" x="610" y="70" text-anchor="middle">FRAMING PLAN</text><rect x="55" y="82" width="1125" height="800" class="panel"/>
    ${framingPlanSvg(design, framing, tx)}
    <rect x="1210" y="82" width="420" height="800" class="panel"/><text class="section" x="1240" y="120">MEMBER SCHEDULE</text>${table(schedule, 1240, 144, 360, 48, 115)}
    <text class="section" x="1240" y="570">PLAN NOTES</text>${noteList(['Member coordinates derive from the current canonical platform polygons.', 'Joist/beam sections marked Engineer design are layout intent only.', 'Footing sizes use assumed soil bearing; frost, uplift, reinforcement, and depth remain unresolved.', 'Provide reviewed connectors, blocking, splices, bearing, bracing, and lateral load path.'], 1240, 598, 55, 340)}
    ${notice(1210, 820, 420, 62, 'STRUCTURAL REVIEW', `${input.framing.reviewGates.filter((gate) => gate.status === 'required' && gate.discipline === 'structural').length} structural work packages remain required.`)}`);
}

function elevationSheet(input: CanonicalPlanSetInput, issue: IssueMeta): PlanSheet {
  const platforms = input.design.platforms;
  const views = platforms.map((platform, index) => elevationView(platform, 100, 120 + index * Math.min(330, 680 / Math.max(1, platforms.length)), 1030, Math.min(285, 620 / Math.max(1, platforms.length)), terrainElevationAt(input.site.terrain, platformReferencePoint(platform)).elevationMm)).join('');
  const stairRows = input.design.stairs.map((stair) => [stair.name, `${stair.riserCount} risers @ ${stair.riserHeightMm} mm · ${stair.treadDepthMm} mm treads · ${stair.totalRunMm} mm run`]);
  return makeSheet('elevations', 'Platform & Stair Elevations', 'DIMENSIONED MODEL · DO NOT SCALE', 'A2.0', input, issue, `
    <text class="view-title" x="620" y="70" text-anchor="middle">PLATFORM ELEVATIONS</text><rect x="55" y="82" width="1135" height="800" class="panel"/>${views}
    <rect x="1220" y="82" width="410" height="800" class="panel"/><text class="section" x="1250" y="120">ELEVATION SCHEDULE</text>${table(platforms.map((platform) => [platform.name, `surface ${platform.elevationMm} mm above datum · ${platform.finish.decking}`]), 1250, 145, 350, 52, 115)}
    <text class="section" x="1250" y="410">STAIR SCHEDULE</text>${table(stairRows.length ? stairRows : [['Stairs', 'None']], 1250, 435, 350, 65, 95)}
    ${notice(1220, 770, 410, 112, 'GRADE / GUARD VERIFICATION', 'Confirm finished grades at every platform and landing. Guard and handrail requirements must be reviewed against verified elevation differences and product assemblies.')}`);
}

function sectionSheet(input: CanonicalPlanSetInput, issue: IssueMeta): PlanSheet {
  const first = input.framing.platformSystems[0];
  const platform = input.design.platforms.find((candidate) => candidate.id === first?.platformId);
  const joist = input.framing.joists.find((member) => member.platformId === platform?.id);
  const beam = input.framing.beams.find((member) => member.platformId === platform?.id);
  const post = input.framing.posts.find((member) => member.platformId === platform?.id);
  const footing = input.framing.footings.find((member) => member.platformId === platform?.id);
  return makeSheet('sections', 'Typical Building Sections', 'NTS · DIMENSIONS SHOWN', 'S2.0', input, issue, `
    <text class="view-title" x="560" y="70" text-anchor="middle">TYPICAL DECK SECTION · ${esc((first?.supportStrategy || 'UNRESOLVED').toUpperCase())}</text>
    ${sectionDiagram(platform, joist?.section || 'Engineer design', beam?.section || 'Engineer design', post?.section || 'Engineer design', footing?.widthMm || 0, Boolean(input.framing.ledgers.length))}
    <rect x="1120" y="82" width="510" height="800" class="panel"/><text class="section" x="1150" y="120">SECTION KEYNOTES</text>
    ${table([['1', `${platform?.finish.deckingThicknessMm || 25} mm ${platform?.finish.decking || 'decking'}`], ['2', `${joist?.section || 'Engineer design'} joists @ ${platform?.framingIntent.joistSpacingMm || '—'} mm o.c.`], ['3', `${beam?.section || 'Engineer design'} beam; ply/splice schedule required`], ['4', `${post?.section || 'Engineer design'} post; cap/base connections required`], ['5', footing ? `${footing.widthMm}×${footing.lengthMm} mm preliminary pad; depth required` : 'Footing design required'], ['6', input.framing.ledgers.length ? 'Ledger, fasteners, lateral ties, flashing, and wall substrate require reviewed details' : 'Freestanding lateral system and bracing require reviewed design']], 1150, 145, 450, 72, 55)}
    ${notice(1120, 760, 510, 122, 'TYPICAL SECTION LIMIT', 'This section coordinates member intent. It does not specify proprietary connectors, fasteners, flashing transitions, reinforcement, frost depth, uplift resistance, or lateral bracing until reviewed.')}`);
}

function detailSheet(input: CanonicalPlanSetInput, issue: IssueMeta): PlanSheet {
  const stair = input.design.stairs[0];
  const guard = input.framing.guards[0];
  return makeSheet('details', 'Stair, Guard, Footing & Connection Details', 'NTS · DIMENSIONS SHOWN', 'A3.0', input, issue, `
    <text class="view-title" x="390" y="66" text-anchor="middle">D1 · STAIR GEOMETRY</text>${stairDetail(stair, 70, 95, 650, 350)}
    <text class="view-title" x="1040" y="66" text-anchor="middle">D2 · GUARD INTENT</text>${guardDetail(guard, 740, 95, 580, 350)}
    <text class="view-title" x="1480" y="66" text-anchor="middle">D3 · FOOTING INTENT</text>${footingDetail(input.framing.footings[0], 1350, 95, 280, 350)}
    <text class="section" x="70" y="520">CONNECTION / ENVELOPE / LIFE-SAFETY SCHEDULE</text>
    ${input.framing.reviewGates.map((gate, index) => statusBox(70 + (index % 2) * 780, 545 + Math.floor(index / 2) * 82, 740, `${gate.discipline.toUpperCase()} · ${gate.status.toUpperCase()}`, gate.title, gate.status === 'required' ? 'blocked' : 'pass', gate.reason)).join('')}`);
}

function calculationSheet(input: CanonicalPlanSetInput, issue: IssueMeta): PlanSheet {
  const { framing } = input;
  const loadRows = [['Dead load', `${framing.assumptions.deadLoadKpa.toFixed(2)} kPa`], ['Residential live load', `${framing.assumptions.liveLoadKpa.toFixed(2)} kPa`], ['Site snow load', `${framing.assumptions.snowLoadKpa.toFixed(2)} kPa`], ['Governing area load', `${framing.assumptions.governingAreaLoadKpa.toFixed(2)} kPa`], ['Assumed soil bearing', `${framing.assumptions.soilBearingKpa} kPa`], ['Lumber basis', `${framing.assumptions.lumberSpecies} ${framing.assumptions.lumberGrade} · ${framing.assumptions.treatment}`]];
  return makeSheet('calculations', 'Design Basis, Checks & Review Gates', 'NTS', 'S3.0', input, issue, `
    <text class="section" x="70" y="70">DESIGN BASIS</text>${table(loadRows, 70, 95, 650, 54, 220)}
    <text class="section" x="70" y="465">PLATFORM SYSTEM SCREENING</text>${input.framing.platformSystems.map((system, index) => statusBox(70, 490 + index * 100, 650, system.status.toUpperCase().replace(/-/g, ' '), `${system.platformId} · ${system.supportStrategy} · ${system.joistDesignSpanMm} mm span`, system.status === 'engineering-required' ? 'blocked' : 'review', system.explanation)).join('')}
    <text class="section" x="780" y="70">FRAMING CHECKS</text>${framing.checks.map((check, index) => statusBox(780, 95 + index * 90, 850, check.status.toUpperCase(), check.title, check.status, `${check.result} Basis: ${check.basis}`)).join('')}
    <text class="section" x="780" y="680">PROFESSIONAL REVIEW GATES</text>${framing.reviewGates.slice(0, 4).map((gate, index) => statusBox(780, 705 + index * 56, 850, `${gate.discipline.toUpperCase()} · ${gate.status.toUpperCase()}`, gate.title, gate.status === 'required' ? 'blocked' : 'pass')).join('')}`);
}

function makeSheet(id: PlanSheet['id'], title: string, scale: string, number: string, input: CanonicalPlanSetInput, issue: IssueMeta, body: string): PlanSheet {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1700" height="1100" viewBox="0 0 1700 1100" role="img" aria-label="${esc(title)}">${styles()}<rect x="20" y="20" width="1660" height="1060" class="sheet-border"/>${body}${titleBlock(number, title, scale, input, issue)}</svg>`;
  return { id, number, title, scale, revision: issue.revision, designFingerprint: issue.fingerprint, issuedAt: issue.issuedAt, issuePurpose: 'professional-review', svg };
}

function titleBlock(number: string, title: string, scale: string, input: CanonicalPlanSetInput, issue: IssueMeta): string { return `<g transform="translate(20 ${CONTENT_BOTTOM})"><rect width="1660" height="110" class="title-block"/><line x1="690" y1="0" x2="690" y2="110" class="thin"/><line x1="960" y1="0" x2="960" y2="110" class="thin"/><line x1="1220" y1="0" x2="1220" y2="110" class="thin"/><line x1="1510" y1="0" x2="1510" y2="110" class="thin"/>
  <text class="title-name" x="20" y="28">PERMITLY · DECK REVIEW SET</text><text class="small" x="20" y="50">${esc(input.property.address?.fullAddress || 'Address unconfirmed')}</text><text class="tiny" x="20" y="70">PID ${esc(input.property.parcel?.pid || 'unconfirmed')} · DIMENSIONS IN MILLIMETRES</text><text class="title-warning" x="20" y="94">PROFESSIONAL REVIEW · NOT FOR CONSTRUCTION</text>
  <text class="label" x="710" y="22">ISSUE CONTROL</text><text class="title-drawing" x="710" y="46">REV ${pad(issue.revision)} · ${issue.fingerprint}</text><text class="tiny" x="710" y="68">ISSUED ${issue.issuedAt.slice(0, 10)}</text><text class="tiny" x="710" y="88">SOURCE ${esc(input.framing.inputFingerprint)}</text>
  <rect x="976" y="12" width="228" height="84" class="seal-box"/><text class="seal-title" x="1090" y="31" text-anchor="middle">PROFESSIONAL SEAL / SIGNATURE</text><line x1="992" y1="62" x2="1188" y2="62" class="thin"/><text class="seal-note" x="1090" y="80" text-anchor="middle">BLANK UNTIL APPLIED</text><text class="seal-note" x="1090" y="92" text-anchor="middle">NOT VALIDATED BY SOFTWARE</text>
  <text class="title-drawing" x="1238" y="30">${esc(title)}</text><text class="small" x="1238" y="54">${esc(scale)} · 11×17</text><text class="tiny" x="1238" y="78">DRAWN: CANONICAL MODEL</text><text class="tiny" x="1238" y="95">CHECKED: QUALIFIED REVIEWER</text><text class="sheet-no" x="1585" y="58" text-anchor="middle">${esc(number)}</text><text class="small" x="1585" y="84" text-anchor="middle">REV ${pad(issue.revision)}</text></g>`; }

interface Tx { scale: number; x: (value: number) => number; y: (value: number) => number }
function drawingTransform(points: PointMm[], frame: { x: number; y: number; width: number; height: number }): Tx { const source = points.length ? points : [[0, 0], [1000, 1000]]; const minX = Math.min(...source.map((point) => point[0])); const maxX = Math.max(...source.map((point) => point[0])); const minY = Math.min(...source.map((point) => point[1])); const maxY = Math.max(...source.map((point) => point[1])); const scale = Math.min(frame.width / Math.max(1000, maxX - minX), frame.height / Math.max(1000, maxY - minY)); const ox = frame.x + (frame.width - (maxX - minX) * scale) / 2 - minX * scale; const oy = frame.y + (frame.height - (maxY - minY) * scale) / 2 - minY * scale; return { scale, x: (value) => ox + value * scale, y: (value) => oy + value * scale }; }
function siteGeometrySvg(geometry: LocalPropertyGeometry, design: DeckDesign, site: SiteModel, tx: Tx): string { return `<polygon points="${pts(geometry.parcel, tx)}" class="parcel"/>${geometry.buildings.map((building) => `<polygon points="${pts(building.polygon, tx)}" class="${building.primary ? 'existing-primary' : 'existing'}"/>`).join('')}${design.platforms.map((platform) => `<polygon points="${pts(platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm]), tx)}" class="deck-area"/>${edgeDimensions(platform, tx)}`).join('')}${site.terrain.gradePoints.map((point) => `<circle cx="${tx.x(point.xMm)}" cy="${tx.y(point.yMm)}" r="6" class="post"/><text class="tiny" x="${tx.x(point.xMm) + 9}" y="${tx.y(point.yMm) - 8}">${esc(point.id)} · EL. ${point.elevationMm}</text>`).join('')}<line x1="${tx.x(0)}" y1="${tx.y(0)}" x2="${tx.x(geometry.anchorLengthMm)}" y2="${tx.y(0)}" class="wall"/><text class="note" x="${tx.x(0)}" y="${tx.y(0) - 12}">SELECTED HOUSE WALL · ${geometry.anchorLengthMm} mm</text><text class="tiny" x="80" y="865">GREEN DASHED: MUNICIPAL PARCEL · GREY: MUNICIPAL BUILDING · OCHRE: PROPOSED DECK · DOTS: GRADE OBSERVATIONS</text>`; }
function framingPlanSvg(design: DeckDesign, framing: FramingDesign, tx: Tx): string { return `${design.platforms.map((platform) => `<polygon points="${pts(platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm]), tx)}" class="outline"/>${edgeDimensions(platform, tx)}`).join('')}${framing.footings.map((member) => `<circle cx="${tx.x(member.centerMm[0])}" cy="${tx.y(member.centerMm[1])}" r="${Math.max(8, member.widthMm * tx.scale / 2)}" class="footing"/>`).join('')}${framing.joists.map((member) => line(member.startMm, member.endMm, tx, 'member')).join('')}${framing.ledgers.map((member) => line(member.startMm, member.endMm, tx, 'ledger')).join('')}${framing.beams.map((member) => `${line(member.startMm, member.endMm, tx, 'beam')}<text class="tiny" x="${tx.x((member.startMm[0] + member.endMm[0]) / 2)}" y="${tx.y((member.startMm[1] + member.endMm[1]) / 2) - 12}" text-anchor="middle">${esc(member.id)} · ${esc(member.section)}</text>`).join('')}${framing.posts.map((member) => `<rect x="${tx.x(member.pointMm[0]) - 7}" y="${tx.y(member.pointMm[1]) - 7}" width="14" height="14" class="post"/>`).join('')}${framing.guards.map((member) => line(member.startMm, member.endMm, tx, 'guard')).join('')}${framing.stairStringers.map((member) => line(member.startMm, member.endMm, tx, 'stringer')).join('')}`; }
function edgeDimensions(platform: DeckPlatform, tx: Tx): string { return platform.boundary.vertices.map((start, index, vertices) => { const end = vertices[(index + 1) % vertices.length]; const x = (tx.x(start.xMm) + tx.x(end.xMm)) / 2; const y = (tx.y(start.yMm) + tx.y(end.yMm)) / 2; const length = Math.round(Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm)); return `<rect x="${x - 31}" y="${y - 9}" width="62" height="16" rx="3" class="dim-bg"/><text class="dimension-text" x="${x}" y="${y + 3}" text-anchor="middle">${length}</text>`; }).join(''); }
function elevationView(platform: DeckPlatform, x: number, y: number, width: number, height: number, terrain: number): string { const bounds = platformBounds(platform); const sx = width / Math.max(1000, bounds.maxX - bounds.minX); const sy = Math.min(.22, (height - 70) / Math.max(1200, platform.elevationMm - terrain + 1200)); const deckY = y + height - 35 - (platform.elevationMm - terrain) * sy; const gradeY = y + height - 35; const surfaceX1 = x + 30; const surfaceX2 = x + 30 + (bounds.maxX - bounds.minX) * sx; const guards = platform.edges.some((edge) => edge.role === 'guard') || platform.elevationMm - terrain > 600; return `<g><text class="section" x="${x + 18}" y="${y + 22}">${esc(platform.name.toUpperCase())} · EL. ${platform.elevationMm}</text><line x1="${x + 20}" y1="${gradeY}" x2="${x + width - 20}" y2="${gradeY}" class="grade"/><line x1="${surfaceX1}" y1="${deckY}" x2="${surfaceX2}" y2="${deckY}" class="deck-line"/><line x1="${surfaceX1 + 25}" y1="${deckY}" x2="${surfaceX1 + 25}" y2="${gradeY}" class="post-line"/><line x1="${surfaceX2 - 25}" y1="${deckY}" x2="${surfaceX2 - 25}" y2="${gradeY}" class="post-line"/>${guards ? `<line x1="${surfaceX1}" y1="${deckY - 900 * sy}" x2="${surfaceX2}" y2="${deckY - 900 * sy}" class="guard"/>` : ''}${dimV(deckY, gradeY, surfaceX1 - 40, `${platform.elevationMm - terrain} mm`)}<text class="tiny" x="${surfaceX1}" y="${gradeY + 15}">FINISHED GRADE · FIELD VERIFY</text></g>`; }
function sectionDiagram(platform: DeckPlatform | undefined, joist: string, beam: string, post: string, footing: number, ledger: boolean): string { const elevation = platform?.elevationMm || 600; return `<g><rect x="90" y="100" width="900" height="780" class="panel"/><line x1="120" y1="800" x2="960" y2="800" class="grade"/><rect x="150" y="180" width="80" height="620" class="existing"/>${ledger ? '<rect x="230" y="430" width="28" height="100" class="ledger-fill"/><path d="M230 420 h45 v-22 h-65" class="flashing"/>' : ''}<rect x="250" y="430" width="560" height="22" class="decking"/><rect x="260" y="452" width="520" height="75" class="member-fill"/><rect x="690" y="520" width="120" height="70" class="beam-fill"/><rect x="730" y="590" width="42" height="210" class="post-fill"/><rect x="675" y="800" width="150" height="48" class="concrete"/><text class="callout" x="835" y="460">1 · DECKING</text><text class="callout" x="835" y="510">2 · ${esc(joist)} JOIST</text><text class="callout" x="835" y="560">3 · ${esc(beam)}</text><text class="callout" x="835" y="640">4 · ${esc(post)}</text><text class="callout" x="835" y="825">5 · ${footing || '—'} mm PAD</text>${dimV(430, 800, 620, `${elevation} mm`)}${ledger ? '<text class="callout" x="90" y="405">6 · LEDGER / FLASHING REVIEW</text>' : '<text class="callout" x="90" y="405">6 · FREESTANDING BRACING REVIEW</text>'}</g>`; }
function stairDetail(stair: DeckDesign['stairs'][number] | undefined, x: number, y: number, width: number, height: number): string { if (!stair) return `<rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel"/><text class="note" x="${x + 30}" y="${y + 50}">No stair in current design.</text>`; const sx = Math.min(.55, (width - 120) / Math.max(1, stair.totalRunMm)); const sy = Math.min(.5, (height - 100) / Math.max(1, stair.riserCount * stair.riserHeightMm)); const startX = x + 60; const startY = y + 55; const stepPath = Array.from({ length: stair.riserCount }, (_, index) => `h${index === 0 ? 0 : stair.treadDepthMm * sx} v${stair.riserHeightMm * sy}`).join(' '); return `<rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel"/><path d="M${startX} ${startY} ${stepPath}" class="stair" fill="none"/><line x1="${startX}" y1="${startY - 35}" x2="${startX + stair.totalRunMm * sx}" y2="${startY + stair.riserCount * stair.riserHeightMm * sy - 35}" class="rail"/><text class="note" x="${x + 30}" y="${y + height - 52}">${stair.riserCount} RISERS @ ${stair.riserHeightMm} · ${stair.treadDepthMm} TREAD · ${stair.totalRunMm} RUN</text><text class="note" x="${x + 30}" y="${y + height - 28}">${stair.stringerCount} STRINGERS · ${esc(stair.handrailSides.toUpperCase())} HANDRAIL INTENT · ${stair.widthMm} WIDE</text>`; }
function guardDetail(guard: FramingDesign['guards'][number] | undefined, x: number, y: number, width: number, height: number): string { const h = guard?.heightMm || 900; const scale = .22; return `<rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel"/><line x1="${x + 55}" y1="${y + height - 70}" x2="${x + width - 55}" y2="${y + height - 70}" class="deck-line"/><line x1="${x + 80}" y1="${y + height - 70}" x2="${x + 80}" y2="${y + height - 70 - h * scale}" class="rail"/><line x1="${x + width - 80}" y1="${y + height - 70}" x2="${x + width - 80}" y2="${y + height - 70 - h * scale}" class="rail"/><line x1="${x + 80}" y1="${y + height - 70 - h * scale}" x2="${x + width - 80}" y2="${y + height - 70 - h * scale}" class="rail"/>${dimV(y + height - 70 - h * scale, y + height - 70, x + 35, `${h} mm`)}<text class="note" x="${x + 55}" y="${y + height - 28}">${esc(guard?.system || 'GUARD SYSTEM TO BE SELECTED')} · ANCHORAGE REVIEW REQUIRED</text>`; }
function footingDetail(footing: FramingDesign['footings'][number] | undefined, x: number, y: number, width: number, height: number): string { const side = footing?.widthMm || 300; return `<rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel"/><line x1="${x + 20}" y1="${y + 95}" x2="${x + width - 20}" y2="${y + 95}" class="grade"/><rect x="${x + width / 2 - 20}" y="${y + 50}" width="40" height="150" class="post-fill"/><path d="M${x + 55} ${y + 200} h${width - 110} l20 70 h-${width - 70} z" class="concrete"/><text class="note" x="${x + 28}" y="${y + 305}">${side}×${footing?.lengthMm || side} PAD</text><text class="tiny" x="${x + 28}" y="${y + 325}">DEPTH / FROST / REBAR / UPLIFT: DESIGN REQUIRED</text>`; }

function table(rows: string[][], x: number, y: number, width: number, rowHeight: number, labelWidth: number): string { return rows.map((row, index) => { const yy = y + index * rowHeight; return `<rect x="${x}" y="${yy}" width="${width}" height="${rowHeight}" class="table-line"/><line x1="${x + labelWidth}" y1="${yy}" x2="${x + labelWidth}" y2="${yy + rowHeight}" class="thin"/><text class="label" x="${x + 10}" y="${yy + 25}">${esc(row[0])}</text>${wrapped(row[1] || '', x + labelWidth + 10, yy + 22, width - labelWidth - 20, 10, 13, 2)}`; }).join(''); }
function statusBox(x: number, y: number, width: number, label: string, title: string, status: 'pass' | 'review' | 'blocked' | 'engineering-required', detail = ''): string { const style = status === 'pass' ? 'status-pass' : status === 'review' ? 'status-review' : 'status-blocked'; return `<rect x="${x}" y="${y}" width="${width}" height="${detail ? 74 : 44}" rx="4" class="${style}"/><text class="tiny" x="${x + 12}" y="${y + 16}">${esc(label)}</text><text class="label" x="${x + 12}" y="${y + 34}">${esc(title)}</text>${detail ? wrapped(detail, x + 12, y + 51, width - 24, 8, 10, 2) : ''}`; }
function notice(x: number, y: number, width: number, height: number, title: string, copy: string): string { return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" class="notice"/><text class="notice-title" x="${x + 16}" y="${y + 25}">${esc(title)}</text>${wrapped(copy, x + 16, y + 46, width - 32, 10, 13, 4)}`; }
function noteList(notes: string[], x: number, y: number, spacing: number, width: number): string { return notes.map((note, index) => `<text class="note" x="${x}" y="${y + index * spacing}">•</text>${wrapped(note, x + 18, y + index * spacing, width - 18, 10, 13, 3)}`).join(''); }
function wrapped(value: string, x: number, y: number, maxWidth: number, fontSize: number, lineHeight: number, maxLines: number): string { const maxChars = Math.max(16, Math.floor(maxWidth / (fontSize * .56))); const words = value.split(/\s+/); const lines: string[] = []; let line = ''; for (const word of words) { if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word; } if (line) lines.push(line); return `<text x="${x}" y="${y}" font-size="${fontSize}">${lines.slice(0, maxLines).map((item, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${esc(item)}</tspan>`).join('')}</text>`; }
function styles(): string { return `<style>text{font-family:Arial,Helvetica,sans-serif;fill:#17231d}.sheet-border,.title-block,.panel{fill:#fff;stroke:#17231d;stroke-width:2}.thin{stroke:#68756e;stroke-width:1}.sheet-heading{font-size:36px;font-weight:700}.subheading{font-size:20px}.section,.view-title{font-size:16px;font-weight:700;letter-spacing:.5px}.note{font-size:11px}.small{font-size:11px}.tiny{font-size:8px}.label{font-size:10px;font-weight:700}.title-name{font-size:19px;font-weight:700}.title-drawing{font-size:13px;font-weight:700}.title-warning{font-size:10px;font-weight:700;fill:#a33b27}.sheet-no{font-size:29px;font-weight:700}.seal-box{fill:#f7f9f8;stroke:#68756e;stroke-dasharray:5 3}.seal-title{font-size:8px;font-weight:700}.seal-note{font-size:7px;fill:#56625c}.table-line{fill:#fff;stroke:#8c9891;stroke-width:1}.notice{fill:#fff4da;stroke:#af6d00;stroke-width:1.5}.notice-title{font-size:12px;font-weight:700;fill:#7a4700}.status-pass{fill:#e8f5ed;stroke:#2c7652}.status-review{fill:#edf4ff;stroke:#476f9c}.status-blocked{fill:#ffe8e3;stroke:#b33e2b}.parcel{fill:#e6f4eb;stroke:#167252;stroke-width:4;stroke-dasharray:10 5}.existing-primary{fill:#d2dbd6;stroke:#263b31;stroke-width:3}.existing{fill:#e5eae7;stroke:#748078}.deck-area{fill:#dca66e;stroke:#7e4c22;stroke-width:3}.wall{stroke:#d35420;stroke-width:7}.outline{fill:none;stroke:#17241d;stroke-width:4}.member{stroke:#3d8a6c;stroke-width:2}.beam{stroke:#173f67;stroke-width:9}.ledger{stroke:#d35420;stroke-width:7;stroke-dasharray:12 4}.post{fill:#173f67;stroke:#fff}.footing{fill:none;stroke:#b27b1e;stroke-width:2;stroke-dasharray:5 3}.guard{stroke:#754c9b;stroke-width:6;stroke-dasharray:5 4}.stringer{stroke:#9b5e2d;stroke-width:4;stroke-dasharray:7 3}.dim-bg{fill:#fff;stroke:#7a8b82}.dimension-text{font-size:8px;font-weight:700;fill:#175ec7}.dimension{stroke:#175ec7;stroke-width:1}.grade{stroke:#425149;stroke-width:2;stroke-dasharray:12 5}.deck-line{stroke:#17241d;stroke-width:8}.post-line{stroke:#6d4325;stroke-width:7}.rail{stroke:#17241d;stroke-width:4}.stair{stroke:#b56a15;stroke-width:4}.existing{fill:#d9dfdb;stroke:#5b6861}.ledger-fill{fill:#c97a59;stroke:#793a28}.flashing{stroke:#c2462d;stroke-width:4;fill:none}.decking{fill:#c79562;stroke:#5b3b21}.member-fill{fill:#d9b78f;stroke:#5b3b21}.beam-fill{fill:#bd8954;stroke:#5b3b21}.post-fill{fill:#9b6639;stroke:#5b3b21}.concrete{fill:#d5d8d6;stroke:#59645e}.callout{font-size:11px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:5}</style>`; }
function line(first: PointMm, second: PointMm, tx: Tx, className: string): string { return `<line x1="${tx.x(first[0])}" y1="${tx.y(first[1])}" x2="${tx.x(second[0])}" y2="${tx.y(second[1])}" class="${className}"/>`; }
function dimV(y1: number, y2: number, x: number, label: string): string { return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="dimension"/><line x1="${x - 8}" y1="${y1}" x2="${x + 8}" y2="${y1}" class="dimension"/><line x1="${x - 8}" y1="${y2}" x2="${x + 8}" y2="${y2}" class="dimension"/><text class="dimension-text" x="${x - 10}" y="${(y1 + y2) / 2}" text-anchor="middle" transform="rotate(-90 ${x - 10} ${(y1 + y2) / 2})">${esc(label)}</text>`; }
function pts(points: PointMm[], tx: Tx): string { return points.map((point) => `${tx.x(point[0])},${tx.y(point[1])}`).join(' '); }
function designAndFramingPoints(design: DeckDesign, framing: FramingDesign): PointMm[] { return [...design.platforms.flatMap((platform) => platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm])), ...framing.joists.flatMap((member) => [member.startMm, member.endMm]), ...framing.stairStringers.flatMap((member) => [member.startMm, member.endMm])]; }
function platformBounds(platform: DeckPlatform) { const xs = platform.boundary.vertices.map((vertex) => vertex.xMm); const ys = platform.boundary.vertices.map((vertex) => vertex.yMm); return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }; }
function platformReferencePoint(platform: DeckPlatform): PointMm { const count = Math.max(1, platform.boundary.vertices.length); return [platform.boundary.vertices.reduce((sum, vertex) => sum + vertex.xMm, 0) / count, platform.boundary.vertices.reduce((sum, vertex) => sum + vertex.yMm, 0) / count]; }
function polygonArea(points: PointMm[]): number { return Math.abs(points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0) / 2); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function pad(value: number): string { return String(value).padStart(2, '0'); }
function esc(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] || character); }
