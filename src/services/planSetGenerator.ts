import type { Deck, DrawingIssueRecord, PermitManifest, PlanSheet, Property, StructuralReport, SubmissionReadiness } from '../types';
import { renderSiteView } from './canvasRenderer';
import { analyzeStructure } from './structuralAnalysis';
import { evaluateSubmissionReadiness } from './submissionReadiness';
import { computeDesignFingerprint } from './designFingerprint';
import { existingConditionBasis, ledgerConditionSummary } from './existingConditions';
import { formatRevision, resolveDrawingIssue } from './drawingIssues';
import { assessSitePlacement, placementBasis } from './sitePlacement';
import { layoutSummary, normalizeDeckLayout } from './deckLayout';

const CONTENT_BOTTOM = 970;
const SCALE_1_50 = 100 / 25.4 / 50 * 1000; // SVG units per metre on a 100 units/in sheet.

export interface PermitPackage {
  sheets: PlanSheet[];
  report: StructuralReport;
  readiness: SubmissionReadiness;
  manifest: PermitManifest;
}

export interface GeneratePermitPackageOptions {
  issue: DrawingIssueRecord;
  issueHistory?: DrawingIssueRecord[];
}

export interface IssuedPermitPackage {
  permitPackage: PermitPackage;
  issue: DrawingIssueRecord;
  issueHistory: DrawingIssueRecord[];
}

/** Resolves a durable issue number, then generates every coordinated artifact from it. */
export function issuePermitPackage(property: Property, deck: Deck, history: DrawingIssueRecord[]): IssuedPermitPackage {
  const resolved = resolveDrawingIssue(property, deck, history);
  return {
    permitPackage: generatePermitPackage(property, deck, { issue: resolved.issue, issueHistory: resolved.history }),
    issue: resolved.issue,
    issueHistory: resolved.history,
  };
}

/** Generates one normalized professional-review package from the parametric model. */
export function generatePermitPackage(property: Property, deck: Deck, options?: GeneratePermitPackageOptions): PermitPackage {
  const designFingerprint = computeDesignFingerprint(property, deck);
  const issue: DrawingIssueRecord = options?.issue || {
    id: `ISSUE-01-${designFingerprint}`,
    revision: 1,
    designFingerprint,
    issuedAt: new Date().toISOString(),
    purpose: 'professional-review',
    description: 'Initial issue for professional review',
    sheetIds: ['cover', 'site', 'framing', 'elevations', 'sections', 'details', 'calculations'],
  };
  if (issue.designFingerprint !== designFingerprint) throw new Error('The drawing issue does not match the current design fingerprint.');
  const issueHistory = options?.issueHistory || [issue];
  const report = analyzeStructure(property, deck, issue.issuedAt);
  const readiness = evaluateSubmissionReadiness(report);
  const sheets = [
    coverSheet(property, deck, report, issue, issueHistory),
    siteSheet(property, deck, issue),
    framingSheet(property, deck, report, issue),
    elevationSheet(property, deck, issue),
    sectionSheet(property, deck, report, issue),
    detailSheet(property, deck, report, issue),
    calculationSheet(property, deck, report, issue),
  ];
  return {
    report,
    readiness,
    sheets,
    manifest: {
      issueId: issue.id,
      revision: issue.revision,
      designFingerprint,
      generatedAt: report.generatedAt,
      issuePurpose: issue.purpose,
      supersedesDesignFingerprint: issue.supersedesDesignFingerprint,
      address: property.address?.fullAddress || 'Address unconfirmed',
      pid: property.parcel?.pid || 'PID unconfirmed',
      sheetIds: sheets.map((sheet) => sheet.id),
      status: 'professional-review',
    },
  };
}

/** Backward-compatible sheet-only API used by agent actions. */
export function generatePlanSet(property: Property, deck: Deck): PlanSheet[] {
  return generatePermitPackage(property, deck).sheets;
}

function coverSheet(property: Property, deck: Deck, report: StructuralReport, issue: DrawingIssueRecord, issueHistory: DrawingIssueRecord[]): PlanSheet {
  const address = property.address?.fullAddress || 'Address not confirmed';
  const rows = [
    ['Project', 'New exterior residential wood deck'],
    ['Civic address', address],
    ['Parcel', `PID ${property.parcel?.pid || 'unconfirmed'} · Plan ${property.parcel?.planNumber || 'unconfirmed'}`],
    ['Jurisdiction / zone', `${property.parcel?.municipality || 'Town of Sidney'} · ${property.zoning?.zone || 'unconfirmed'}`],
    ['Lot / deck area', `${property.parcel?.areaSqm.toFixed(0) || '—'} m² / ${deck.area.toFixed(2)} m²`],
    ['Deck geometry', `${deck.dimensions.width.toFixed(2)} m wide × ${deck.dimensions.depth.toFixed(2)} m deep × ${(deck.footprint.heightAboveGrade * 1000).toFixed(0)} mm high`],
    ['Design basis', `${report.designBasis.totalAreaLoadKpa.toFixed(2)} kPa preliminary gravity area load`],
    ['Existing conditions', existingConditionBasis(property)],
    ['Site placement', placementBasis(property, deck)],
    ['Code basis', report.codeEdition],
    ['Drawing issue', `${formatRevision(issue.revision)} · ${issue.designFingerprint}`],
  ];
  const index = [
    ['A0.0', 'Cover, project data, drawing index'],
    ['A1.0', 'Site context and zoning review'],
    ['S1.0', 'Dimensioned framing plan'],
    ['A2.0', 'Exterior elevation and stair geometry'],
    ['S2.0', 'Building section and connection details'],
    ['S2.1', 'Connection, guard, stair, and footing criteria'],
    ['S3.0', 'Preliminary calculations and review gates'],
  ];
  const body = `
    <text class="sheet-heading" x="70" y="95">DECK DESIGN REVIEW PACKAGE</text>
    <text class="subheading" x="70" y="130">${escapeXml(address)}</text>
    ${noticeBox(70, 165, 1560, 90, 'ISSUED FOR PROFESSIONAL REVIEW — NOT FOR CONSTRUCTION', 'Survey, field conditions, member capacities, connections, and municipal requirements remain subject to confirmation.')}
    <text class="section" x="70" y="310">PROJECT DATA</text>
    ${table(rows, 70, 335, 850, 44)}
    <text class="section" x="990" y="310">DRAWING INDEX</text>
    ${table(index, 990, 335, 640, 40, 115)}
    <text class="section" x="990" y="640">DRAWING ISSUE REGISTER</text>
    ${revisionTable(issueHistory, 990, 665, 640)}
    <text class="section" x="990" y="835">GENERAL NOTES</text>
    ${noteList([
      'Do not scale drawings. Written dimensions govern.',
      'Verify all dimensions, grades, utilities, easements, and existing construction before work.',
      'Do not construct until the authority having jurisdiction issues a permit.',
    ], 1010, 870, 34)}`;
  return makeSheet('cover', 'Cover & Project Data', 'NTS', 'A0.0', property, body, issue);
}

function siteSheet(property: Property, deck: Deck, issue: DrawingIssueRecord): PlanSheet {
  const site = renderSiteView(property, deck, {
    view: 'site', width: 1160, height: 780, showLabels: true, showCompliance: false,
  }).replace('<svg ', '<svg x="55" y="65" ');
  const zoning = property.zoning;
  const sourceRows = property.evidence.slice(0, 4).map((source) => [source.label, source.status]);
  const placement = deck.sitePlacement;
  const placementAssessment = assessSitePlacement(property, deck);
  const placementRows = [
    ['Reference wall', deck.footprint.houseWall.toUpperCase()],
    ['Wall start offset', `${(placement?.wallStartOffsetM ?? 0).toFixed(3)} m`],
    ['Wall end offset', placementAssessment.wallEndOffsetM === null ? 'UNCONFIRMED' : `${placementAssessment.wallEndOffsetM.toFixed(3)} m`],
    ['House gap', `${(placement?.outwardGapM ?? 0).toFixed(3)} m`],
    ['Reference status', placementAssessment.basis.toUpperCase()],
    ['Recorded by / date', placement?.recordedBy ? `${placement.recordedBy} · ${placement.recordedAt || 'date missing'}` : 'NOT RECORDED'],
    ['Nearest parcel edge', placementAssessment.nearestParcelEdgeM === null ? 'UNCONFIRMED' : `${placementAssessment.nearestParcelEdgeM.toFixed(2)} m · GIS SCREEN ONLY`],
  ];
  const body = `
    ${site}
    <rect x="1250" y="65" width="380" height="780" class="panel"/>
    <text class="section" x="1280" y="105">PLACEMENT SCHEDULE</text>
    ${table(placementRows, 1280, 125, 320, 36, 135)}
    <text class="section" x="1280" y="410">SITE &amp; ZONING NOTES</text>
    ${noteList([
      `Zone: ${zoning?.zone || 'unconfirmed'}`,
      `Required yards: front ${zoning?.setbacks.front ?? '—'} m; rear ${zoning?.setbacks.rear ?? '—'} m; interior side ${zoning?.setbacks.side ?? '—'} m; exterior side ${zoning?.setbacks.exteriorSide ?? '—'} m.`,
      `Maximum lot coverage: ${zoning?.maxLotCoverage ?? '—'}%.`,
      'Street frontage and yard orientation are not inferred as legal facts. Confirm with the Town and a survey.',
      'Locate deck edges, stairs, posts, and footings from surveyed boundaries and field-verified house wall.',
    ], 1280, 435, 38, 325)}
    <text class="section" x="1280" y="665">EVIDENCE</text>
    ${table(sourceRows.length ? sourceRows : [['No evidence loaded', 'unconfirmed']], 1280, 685, 320, 32, 235)}
    ${noticeBox(1250, 875, 380, 70, 'SITE PLAN REQUIRES SURVEY', 'Diagrammatic GIS context; replace or validate against an accepted dimensioned survey.')}`;
  return makeSheet('site', 'Site Context & Zoning Review', 'DIAGRAMMATIC', 'A1.0', property, body, issue);
}

function framingSheet(property: Property, deck: Deck, report: StructuralReport, issue: DrawingIssueRecord): PlanSheet {
  const conditions = property.existingConditions;
  const layout = normalizeDeckLayout(deck);
  const drawingWidth = deck.dimensions.width * SCALE_1_50;
  const drawingDepth = deck.dimensions.depth * SCALE_1_50;
  const x = 160 + (900 - drawingWidth) / 2;
  const y = 180 + (590 - drawingDepth) / 2;
  const joistLines = Array.from({ length: report.quantities.joistCount }, (_, index) => {
    const lineX = x + Math.min(index * deck.structure.joistSpacing / 1000 * SCALE_1_50, drawingWidth);
    return `<line x1="${lineX}" y1="${y}" x2="${lineX}" y2="${y + drawingDepth}" class="member"/>`;
  }).join('');
  const beamLines = layout.beamOffsetsFromHouseM.map((offset, beamIndex) => {
    const py = y + offset * SCALE_1_50;
    return `<line x1="${x}" y1="${py}" x2="${x + drawingWidth}" y2="${py}" class="beam"/><text class="tiny" x="${x + drawingWidth + 12}" y="${py + 4}">B${beamIndex + 1} @ ${offset.toFixed(3)} m</text>`;
  }).join('');
  const postSymbols = layout.beamOffsetsFromHouseM.flatMap((beamOffset, beamIndex) => layout.postStationsM.map((station, postIndex) => {
    const px = x + station * SCALE_1_50;
    const py = y + beamOffset * SCALE_1_50;
    return `<rect x="${px - 8}" y="${py - 8}" width="16" height="16" class="post"/><circle cx="${px}" cy="${py}" r="18" class="footing"/><text class="tiny" x="${px + 10}" y="${py - 12}">P${beamIndex + 1}.${postIndex + 1}</text>`;
  })).join('');
  const rows = [
    ['Joists', `${deck.structure.joistSize} ${deck.structure.joistSpecies} @ ${deck.structure.joistSpacing} mm o.c.`],
    ['Beam', `${deck.structure.beamSize}; ${deck.structure.selection.beamTable}; verify ply fastening, bearing, and splices`],
    ['Posts', `${report.quantities.postsPerBeam}/beam × ${report.quantities.beamCount} beam line(s) = ${report.quantities.postCount} total; ${report.quantities.actualPostSpacingM.toFixed(2)} m actual`],
    ['Beam coordinates', layout.beamOffsetsFromHouseM.map((value, index) => `B${index + 1} ${value.toFixed(3)} m`).join(' · ')],
    ['Post stations', layout.postStationsM.map((value, index) => `P${index + 1} ${value.toFixed(3)} m`).join(' · ')],
    ['Stair / landing', `${deck.stairs.edge.toUpperCase()} edge @ ${layout.stairOffsetM.toFixed(3)} m; ${layout.stairLandingDepthM.toFixed(3)} m landing`],
    ['Footings', `${deck.structure.footingSize} × ${deck.structure.footingSize} mm preliminary pad; depth ${deck.structure.footingDepth} mm shown`],
    ['Decking', `${deck.structure.deckingThickness} mm ${deck.structure.deckingMaterial}`],
    ['Ledger', deck.footprint.attachedToHouse ? conditions ? ledgerConditionSummary(conditions) : deck.structure.ledgerAttachment : 'Freestanding — no ledger'],
    ['House basis', existingConditionBasis(property)],
    ['Attachment wall', conditions ? `${conditions.attachmentWall.toUpperCase()} · ${conditions.attachmentWallLengthM.toFixed(2)} m measured input` : `${deck.footprint.houseWall.toUpperCase()} · field measure`],
    ['Deck wall offsets', placementBasis(property, deck)],
    ['Rim / cladding', conditions ? `${conditions.rimBoardMaterial}${conditions.rimBoardDepthMm ? ` ${conditions.rimBoardDepthMm} mm` : ''}; ${conditions.cladding}` : 'Unknown · field verify'],
    ['Door opening', conditions ? `${conditions.doorOpeningWidthM.toFixed(2)} m wide at ${conditions.doorOpeningOffsetM.toFixed(2)} m from left; threshold ${conditions.doorThresholdHeightMm} mm` : 'Location and threshold field verify'],
    ['Selection source', `${deck.structure.selection.joistTable}/${deck.structure.selection.beamTable} · ${deck.structure.selection.status}`],
  ];
  const body = `
    <text class="view-title" x="600" y="85" text-anchor="middle">FRAMING PLAN</text>
    <rect x="${x}" y="${y}" width="${drawingWidth}" height="${drawingDepth}" class="outline"/>
    ${deck.footprint.attachedToHouse ? `<rect x="${x - 40}" y="${y - 35}" width="${drawingWidth + 80}" height="24" class="existing"/><text class="note" x="${x + drawingWidth / 2}" y="${y - 48}" text-anchor="middle">EXISTING ${escapeXml((conditions?.attachmentWall || deck.footprint.houseWall).toUpperCase())} WALL · ${conditions ? `${conditions.attachmentWallLengthM.toFixed(2)} m FIELD INPUT · EVIDENCE REQUIRED` : 'FIELD VERIFY'}</text><line x1="${x}" y1="${y}" x2="${x + drawingWidth}" y2="${y}" class="ledger"/>` : ''}
    ${joistLines}
    ${beamLines}
    ${postSymbols}
    ${dimensionHorizontal(x, x + drawingWidth, y + drawingDepth + 75, `${(deck.dimensions.width * 1000).toFixed(0)} mm`)}
    ${dimensionVertical(y, y + drawingDepth, x - 85, `${(deck.dimensions.depth * 1000).toFixed(0)} mm`)}
    <path d="M${x + drawingWidth * 0.55} ${y + drawingDepth * 0.45} l70 -55" class="leader"/><text class="note" x="${x + drawingWidth * 0.55 + 78}" y="${y + drawingDepth * 0.45 - 58}">${escapeXml(deck.structure.joistSize)} JOISTS</text>
    <rect x="1080" y="90" width="550" height="850" class="panel"/>
    <text class="section" x="1110" y="135">STRUCTURAL SCHEDULE</text>
    ${table(rows, 1110, 165, 490, 38, 115)}
    <text class="section" x="1110" y="760">PLAN NOTES</text>
    ${noteList([
      'Dimensions shown are model dimensions; verify house and site dimensions before construction.',
      'Provide blocking, hangers, rim boards, connectors, bracing, and fasteners to reviewed design.',
      'Do not attach ledger through unsupported veneer, overhang, or unverified framing.',
      `Local coordinate origin is the house-side left deck corner. ${layoutSummary(deck)}.`,
    ], 1130, 790, 32, 445)}`;
  return makeSheet('framing', 'Dimensioned Framing Plan', '1:50 @ 11×17', 'S1.0', property, body, issue);
}

function elevationSheet(property: Property, deck: Deck, issue: DrawingIssueRecord): PlanSheet {
  const conditions = property.existingConditions;
  const deckW = deck.dimensions.width * SCALE_1_50;
  const deckY = 690;
  const gradeY = deckY + deck.footprint.heightAboveGrade * SCALE_1_50;
  const x = 170 + (940 - deckW) / 2;
  const guardHeight = deck.guard.enabled ? deck.guard.height / 1000 * SCALE_1_50 : 0;
  const layout = normalizeDeckLayout(deck);
  const postLines = layout.postStationsM.map((station) => {
    const px = x + station * SCALE_1_50;
    return `<line x1="${px}" y1="${deckY + 12}" x2="${px}" y2="${gradeY}" class="post-line"/>`;
  }).join('');
  const rails = deck.guard.enabled ? `
    <line x1="${x}" y1="${deckY - guardHeight}" x2="${x + deckW}" y2="${deckY - guardHeight}" class="rail"/>
    ${Array.from({ length: Math.ceil(deck.dimensions.width / 0.12) + 1 }, (_, index) => {
      const px = x + Math.min(index * 0.12 * SCALE_1_50, deckW);
      return `<line x1="${px}" y1="${deckY - guardHeight}" x2="${px}" y2="${deckY}" class="baluster"/>`;
    }).join('')}` : '';
  const stairRise = deck.stairs.enabled ? deck.stairs.numRisers * deck.stairs.riserHeight / 1000 * SCALE_1_50 : 0;
  const stairRun = deck.stairs.enabled ? (deck.stairs.numRisers - 1) * deck.stairs.treadRun / 1000 * SCALE_1_50 : 0;
  const stairs = deck.stairs.enabled ? `<path d="M${x + deckW} ${deckY} ${Array.from({ length: deck.stairs.numRisers }, () => `h${deck.stairs.treadRun / 1000 * SCALE_1_50} v${deck.stairs.riserHeight / 1000 * SCALE_1_50}`).join(' ')}" class="stair" fill="none"/><text class="note" x="${x + deckW + stairRun / 2}" y="${deckY + stairRise + 35}" text-anchor="middle">${deck.stairs.numRisers} RISERS @ ${deck.stairs.riserHeight} mm; RUN ${deck.stairs.treadRun} mm</text>` : '';
  const body = `
    <text class="view-title" x="650" y="90" text-anchor="middle">EXTERIOR ELEVATION</text>
    <line x1="90" y1="${gradeY}" x2="1220" y2="${gradeY}" class="grade"/><text class="note" x="95" y="${gradeY - 12}">FINISHED GRADE — FIELD VERIFY</text>
    <line x1="${x}" y1="${deckY}" x2="${x + deckW}" y2="${deckY}" class="deck-line"/>
    ${postLines}${rails}${stairs}
    ${dimensionHorizontal(x, x + deckW, deckY - guardHeight - 75, `${(deck.dimensions.width * 1000).toFixed(0)} mm`)}
    ${dimensionVertical(deckY, gradeY, x - 75, `${(deck.footprint.heightAboveGrade * 1000).toFixed(0)} mm`)}
    ${deck.guard.enabled ? dimensionVertical(deckY - guardHeight, deckY, x + deckW + 75, `${deck.guard.height} mm GUARD`) : ''}
    <rect x="1270" y="90" width="360" height="690" class="panel"/>
    <text class="section" x="1300" y="135">ELEVATION NOTES</text>
    ${noteList([
      `Deck surface: ${deck.structure.deckingMaterial}.`,
      `Guard: ${deck.guard.enabled ? `${deck.guard.material}; ${deck.guard.openingMax} mm max opening` : 'not shown; verify whether required at all edges and stairs'}.`,
      `Posts: ${deck.structure.postSize}; provide reviewed post caps and bases.`,
      'Slope walking surface to drain away from the building after shrinkage.',
      conditions
        ? `Door input: ${conditions.doorOpeningWidthM.toFixed(2)} m opening; threshold ${conditions.doorThresholdHeightMm} mm above grade. Professional field evidence required.`
        : 'Verify door sill, flashing, cladding clearances, grade, and stair landing on site.',
    ], 1300, 175, 54, 300)}`;
  return makeSheet('elevations', 'Exterior Elevation & Stair Geometry', '1:50 @ 11×17', 'A2.0', property, body, issue);
}

function sectionSheet(property: Property, deck: Deck, report: StructuralReport, issue: DrawingIssueRecord): PlanSheet {
  const conditions = property.existingConditions;
  const rows = [
    ['1', 'Decking', `${deck.structure.deckingThickness} mm ${deck.structure.deckingMaterial}; orient and fasten per manufacturer.`],
    ['2', 'Joists', `${deck.structure.joistSize} @ ${deck.structure.joistSpacing} mm o.c.; span and cantilever require table verification.`],
    ['3', 'Beam', `${deck.structure.beamSize}; plies, splices, bearing, and connectors require reviewed detail.`],
    ['4', 'Posts', `${deck.structure.postSize}; provide rated cap/base and lateral restraint.`],
    ['5', 'Footings', `${deck.structure.footingSize} mm square preliminary pad, ${deck.structure.footingDepth} mm below grade shown; soil/frost unconfirmed.`],
    ['6', 'Ledger', deck.footprint.attachedToHouse ? conditions ? `${ledgerConditionSummary(conditions)}; flashing ${conditions.flashingFeasible}; professional connection design required.` : 'Field verify wall framing; design attachment, lateral ties, and continuous flashing.' : 'Not applicable — freestanding lateral system required.'],
  ];
  const h = deck.footprint.heightAboveGrade * SCALE_1_50;
  const body = `
    <text class="view-title" x="470" y="90" text-anchor="middle">TYPICAL BUILDING SECTION</text>
    <rect x="150" y="220" width="70" height="520" class="existing"/><text class="note" x="185" y="770" text-anchor="middle">EXISTING WALL</text>
    <rect x="220" y="420" width="500" height="18" class="decking"/>
    <rect x="220" y="438" width="500" height="42" class="member-fill"/>
    <rect x="620" y="480" width="100" height="55" class="beam-fill"/>
    <rect x="650" y="535" width="38" height="${Math.max(h - 115, 100)}" class="post-fill"/>
    <line x1="90" y1="${535 + Math.max(h - 115, 100)}" x2="850" y2="${535 + Math.max(h - 115, 100)}" class="grade"/>
    <rect x="610" y="${535 + Math.max(h - 115, 100)}" width="118" height="95" class="concrete"/>
    <path d="M220 410 h35 v-65" class="flashing"/><text class="note" x="275" y="355">CONTINUOUS FLASHING</text>
    ${dimensionVertical(420, 535 + Math.max(h - 115, 100), 800, `${(deck.footprint.heightAboveGrade * 1000).toFixed(0)} mm TO GRADE`)}
    <text class="callout" x="385" y="405">1</text><text class="callout" x="500" y="470">2</text><text class="callout" x="735" y="515">3</text><text class="callout" x="700" y="600">4</text><text class="callout" x="745" y="820">5</text><text class="callout" x="235" y="505">6</text>
    <rect x="920" y="75" width="710" height="790" class="panel"/>
    <text class="section" x="950" y="120">ASSEMBLY &amp; CONNECTION SCHEDULE</text>
    ${table(rows, 950, 150, 650, 93, 45, 135)}
    ${noticeBox(920, 890, 710, 65, 'CONNECTION DESIGN REQUIRED', `${report.checks.find((check) => check.id === 'ledger')?.basis || 'Verify all structural connections.'}`)}`;
  return makeSheet('sections', 'Building Section & Details', '1:20 / NTS', 'S2.0', property, body, issue);
}

function detailSheet(property: Property, deck: Deck, report: StructuralReport, issue: DrawingIssueRecord): PlanSheet {
  const conditions = property.existingConditions;
  const footingSide = deck.structure.footingSize;
  const requiredSide = Math.ceil(Math.sqrt(report.quantities.requiredFootingAreaSqm) * 1000 / 25) * 25;
  const stairTreads = Math.max(0, deck.stairs.numRisers - 1);
  const scheduleColumns = [report.connectionSchedule.slice(0, 6), report.connectionSchedule.slice(6)];
  const body = `
    <text class="view-title" x="420" y="70" text-anchor="middle">D1 · LEDGER, FLASHING &amp; JOIST BEARING CRITERIA</text>
    <rect x="60" y="90" width="720" height="360" class="panel"/>
    <rect x="110" y="135" width="70" height="245" class="existing"/><text class="tiny" x="145" y="405" text-anchor="middle">EXISTING WALL · FIELD VERIFY</text>
    <rect x="180" y="245" width="470" height="42" class="member-fill"/><text class="note" x="415" y="271" text-anchor="middle">${escapeXml(deck.structure.joistSize)} JOISTS @ ${deck.structure.joistSpacing} mm o.c.</text>
    <rect x="180" y="287" width="55" height="105" class="beam-fill"/><text class="tiny" x="207" y="412" text-anchor="middle">LEDGER</text>
    <path d="M175 235 h80 v-85 h-22 v70 h-58" class="flashing"/><text class="note" x="280" y="155">CONTINUOUS FLASHING BEHIND WRB · END DAMS</text>
    <rect x="235" y="285" width="42" height="45" class="connector"/><text class="note" x="310" y="330">FULL-DEPTH EXTERIOR JOIST HANGER</text>
    <path d="M205 315 h-38" class="leader"/><text class="note" x="285" y="365">LEDGER FASTENER GROUP: TYPE / SPACING / EDGES BY REVIEW</text>
    ${noticeBox(90, 105, 650, 52, deck.footprint.attachedToHouse ? 'FIELD + PROFESSIONAL DESIGN REQUIRED' : 'FREESTANDING SYSTEM', deck.footprint.attachedToHouse ? `${conditions ? ledgerConditionSummary(conditions) : 'Substrate unverified'}. Do not attach through unsupported veneer.` : 'No ledger; provide the reviewed second beam and lateral bracing system.')}

    <text class="view-title" x="420" y="495" text-anchor="middle">D2 · BEAM, POST &amp; FOOTING LOAD PATH</text>
    <rect x="60" y="515" width="720" height="420" class="panel"/>
    <rect x="190" y="570" width="440" height="58" class="beam-fill"/><text class="note" x="410" y="605" text-anchor="middle">${escapeXml(deck.structure.beamSize)} BUILT-UP BEAM · SPLICES OVER SUPPORTS</text>
    <rect x="380" y="628" width="60" height="145" class="post-fill"/><text class="note" x="455" y="700">${escapeXml(deck.structure.postSize)} POST</text>
    <rect x="355" y="615" width="110" height="22" class="connector"/><text class="tiny" x="485" y="633">RATED POST CAP</text>
    <rect x="365" y="765" width="90" height="20" class="connector"/><text class="tiny" x="475" y="782">STANDOFF BASE + ANCHOR</text>
    <line x1="100" y1="805" x2="690" y2="805" class="grade"/><text class="tiny" x="105" y="795">FINISHED GRADE</text>
    <rect x="300" y="805" width="220" height="95" class="concrete"/><text class="note" x="410" y="855" text-anchor="middle">${footingSide} × ${footingSide} mm MODEL PAD</text>
    ${dimensionHorizontal(300, 520, 920, `${footingSide} mm PROVIDED · ${requiredSide} mm BEARING-ONLY CALC.`)}
    <text class="note" x="95" y="670">GOVERNING POST REACTION</text><text class="section" x="95" y="698">${report.quantities.governingPostReactionKn.toFixed(2)} kN</text>
    <text class="note" x="535" y="670">ACTUAL POST SPACING</text><text class="section" x="535" y="698">${report.quantities.actualPostSpacingM.toFixed(3)} m</text>
    <text class="tiny" x="95" y="735">SOIL ${report.designBasis.assumedSoilBearingKpa} kPa ASSUMED · CONFIRM FROST, THICKNESS, REINFORCEMENT, UPLIFT</text>

    <text class="view-title" x="1225" y="70" text-anchor="middle">D3 · GUARD &amp; STAIR DESIGN CRITERIA</text>
    <rect x="820" y="90" width="810" height="360" class="panel"/>
    <line x1="875" y1="300" x2="1190" y2="300" class="deck-line"/>
    ${deck.guard.enabled ? `<line x1="880" y1="155" x2="1150" y2="155" class="rail"/><line x1="900" y1="155" x2="900" y2="300" class="post-line"/><line x1="1130" y1="155" x2="1130" y2="300" class="post-line"/>${dimensionVertical(155, 300, 1175, `${deck.guard.height} mm`)}` : '<text class="notice-title" x="900" y="205">GUARD NOT PRESENT IN MODEL · CONFIRM REQUIREMENT</text>'}
    ${deck.stairs.enabled ? `<path d="M1190 300 ${Array.from({ length: deck.stairs.numRisers }, () => `h${Math.min(42, deck.stairs.treadRun / 7)} v${Math.min(29, deck.stairs.riserHeight / 7)}`).join(' ')}" class="stair" fill="none"/><text class="note" x="1230" y="180">${deck.stairs.numRisers} RISERS @ ${deck.stairs.riserHeight} mm</text><text class="note" x="1230" y="205">${stairTreads} TREADS @ ${deck.stairs.treadRun} mm</text><text class="note" x="1230" y="230">${(deck.stairs.width * 1000).toFixed(0)} mm CLEAR WIDTH</text>` : '<text class="note" x="1230" y="205">NO STAIR IN CURRENT MODEL</text>'}
    <text class="tiny" x="870" y="340">GUARD / HANDRAIL / STRINGER ATTACHMENTS REQUIRE TESTED SYSTEM DATA OR QUALIFIED DESIGN</text>
    <text class="tiny" x="870" y="365">VERIFY LANDINGS, HEADROOM, GRADES, OPENINGS, CLIMBABILITY, AND CONTINUOUS LOAD PATH</text>
    ${noticeBox(860, 385, 730, 45, 'LIFE-SAFETY SYSTEM', `${deck.guard.material}; ${deck.guard.openingMax} mm modeled maximum opening. Product/system capacity is not inferred.`)}

    <text class="view-title" x="1225" y="495" text-anchor="middle">CONNECTION &amp; ENVELOPE SCHEDULE</text>
    <rect x="820" y="515" width="810" height="420" class="panel"/>
    ${connectionScheduleColumn(scheduleColumns[0], 840, 540, 375)}
    ${connectionScheduleColumn(scheduleColumns[1], 1235, 540, 375)}
  `;
  return makeSheet('details', 'Connection, Guard, Stair & Footing Criteria', '1:10 / NTS', 'S2.1', property, body, issue);
}

function calculationSheet(property: Property, deck: Deck, report: StructuralReport, issue: DrawingIssueRecord): PlanSheet {
  const body = `
    <text class="section" x="70" y="70">TRACEABLE PRELIMINARY CALCULATIONS</text>
    ${report.calculations.map((calculation, index) => calculationBlock(calculation, 70, 95 + index * 138, 770)).join('')}
    <text class="section" x="890" y="70">PROFESSIONAL REVIEW CHECKLIST</text>
    ${professionalChecklist(report, 890, 95, 740)}
    <text class="section" x="890" y="680">DESIGN BASIS &amp; SOURCE</text>
    ${table([
      ['Gravity loads', `${report.designBasis.deadLoadKpa.toFixed(2)} kPa dead + ${report.designBasis.liveOrSnowLoadKpa.toFixed(2)} kPa live/snow = ${report.designBasis.totalAreaLoadKpa.toFixed(2)} kPa`],
      ['CWC tables', `${deck.structure.selection.joistTable} / ${deck.structure.selection.beamTable} · ${deck.structure.selection.status}`],
      ['Lumber', deck.structure.joistSpecies],
      ['Footing soil', `${report.designBasis.assumedSoilBearingKpa} kPa assumed; evidence required`],
    ], 890, 705, 740, 48, 145)}
    ${noticeBox(890, 915, 740, 40, 'NOT A SEALED CALCULATION', 'Qualified review must resolve every DESIGN REQUIRED / EVIDENCE REQUIRED item before signature.')}`;
  return makeSheet('calculations', 'Preliminary Calculations & Review Gates', 'NTS', 'S3.0', property, body, issue);
}

function makeSheet(id: PlanSheet['id'], title: string, scale: string, number: string, property: Property, body: string, issue: DrawingIssueRecord): PlanSheet {
  const address = property.address?.fullAddress || 'Address unconfirmed';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1700" height="1100" viewBox="0 0 1700 1100" role="img" aria-label="${escapeXml(title)}">
    ${styles()}
    <rect x="20" y="20" width="1660" height="1060" class="sheet-border"/>
    ${body}
    ${titleBlock(number, title, scale, address, property.parcel?.pid || 'PID unconfirmed', issue)}
  </svg>`;
  return { id, number, title, scale, revision: issue.revision, designFingerprint: issue.designFingerprint, issuedAt: issue.issuedAt, issuePurpose: issue.purpose, svg };
}

function titleBlock(number: string, title: string, scale: string, address: string, pid: string, issue: DrawingIssueRecord): string {
  return `<g transform="translate(20 ${CONTENT_BOTTOM})">
    <rect x="0" y="0" width="1660" height="110" class="title-block"/>
    <line x1="640" y1="0" x2="640" y2="110" class="thin"/><line x1="925" y1="0" x2="925" y2="110" class="thin"/><line x1="1195" y1="0" x2="1195" y2="110" class="thin"/><line x1="1505" y1="0" x2="1505" y2="110" class="thin"/>
    <text class="title-name" x="20" y="31">DECK PERMIT STUDIO</text><text class="small" x="20" y="55">${escapeXml(address)}</text><text class="tiny" x="20" y="76">PID ${escapeXml(pid)} · DIMENSIONS IN MILLIMETRES UNLESS NOTED</text><text class="title-warning" x="20" y="98">ISSUED FOR PROFESSIONAL REVIEW · NOT FOR CONSTRUCTION</text>
    <text class="table-label" x="660" y="22">ISSUE CONTROL</text><text class="title-drawing" x="660" y="47">${formatRevision(issue.revision)} · ${escapeXml(issue.designFingerprint)}</text><text class="tiny" x="660" y="68">ISSUED ${escapeXml(issue.issuedAt.slice(0, 10))}</text><text class="tiny" x="660" y="88">${escapeXml(issue.description.toUpperCase())}</text>
    <rect x="942" y="12" width="236" height="86" class="seal-box"/><text class="seal-title" x="1060" y="33" text-anchor="middle">PROFESSIONAL SEAL / SIGNATURE</text><line x1="962" y1="65" x2="1158" y2="65" class="signature-line"/><text class="seal-note" x="1060" y="82" text-anchor="middle">SIGN / DATE · BLANK UNTIL APPLIED</text><text class="seal-note" x="1060" y="94" text-anchor="middle">NOT VALIDATED BY THIS SOFTWARE</text>
    <text class="title-drawing" x="1213" y="31">${escapeXml(title)}</text><text class="small" x="1213" y="56">Scale ${escapeXml(scale)} · 11×17</text><text class="tiny" x="1213" y="78">DRAWN: PARAMETRIC MODEL</text><text class="tiny" x="1213" y="96">CHECKED: QUALIFIED REVIEWER</text>
    <text class="sheet-no" x="1582" y="55" text-anchor="middle">${escapeXml(number)}</text><text class="small" x="1582" y="82" text-anchor="middle">${formatRevision(issue.revision)}</text>
  </g>`;
}

function styles(): string {
  return `<style>
    text{font-family:Arial,Helvetica,sans-serif;fill:#16211b}.sheet-border,.title-block,.panel{fill:#fff;stroke:#16211b;stroke-width:2}.thin{stroke:#16211b;stroke-width:1}.sheet-heading{font-size:36px;font-weight:700;letter-spacing:1px}.subheading{font-size:20px}.section{font-size:16px;font-weight:700;letter-spacing:.6px}.view-title{font-size:18px;font-weight:700}.note{font-size:12px}.small{font-size:11px}.tiny{font-size:9px}.title-name{font-size:20px;font-weight:700}.title-drawing{font-size:14px;font-weight:700}.title-warning{font-size:10px;font-weight:700;fill:#a33b27}.sheet-no{font-size:30px;font-weight:700}.seal-box{fill:#f7f9f8;stroke:#68756e;stroke-width:1;stroke-dasharray:5 3}.seal-title{font-size:9px;font-weight:700}.seal-note{font-size:7px;fill:#56625c}.signature-line{stroke:#68756e;stroke-width:1}.table-line{stroke:#8c9891;stroke-width:1}.table-label{font-size:11px;font-weight:700}.table-value{font-size:11px}.notice{fill:#fff4da;stroke:#af6d00;stroke-width:1.5}.notice-title{font-size:13px;font-weight:700;fill:#7a4700}.notice-copy{font-size:10px;fill:#684b1a}.outline{fill:none;stroke:#17241d;stroke-width:4}.member{stroke:#2e6250;stroke-width:2}.beam{stroke:#17241d;stroke-width:10}.post{fill:#fff;stroke:#17241d;stroke-width:2}.footing{fill:none;stroke:#6b7770;stroke-width:1.5;stroke-dasharray:5 3}.existing{fill:#d9dfdb;stroke:#5b6861;stroke-width:2}.ledger{stroke:#c2462d;stroke-width:6}.connector{fill:#dce9e4;stroke:#235d49;stroke-width:2}.dimension{stroke:#175ec7;stroke-width:1;fill:none}.dimension-text{font-size:12px;fill:#175ec7;font-weight:700}.leader{stroke:#17241d;stroke-width:1.5;fill:none}.grade{stroke:#425149;stroke-width:2;stroke-dasharray:12 5}.deck-line{stroke:#17241d;stroke-width:8}.post-line{stroke:#5b3b21;stroke-width:8}.rail{stroke:#17241d;stroke-width:5}.baluster{stroke:#6b7770;stroke-width:1.5}.stair{stroke:#b56a15;stroke-width:4}.decking{fill:#b78654;stroke:#5b3b21;stroke-width:2}.member-fill{fill:#d5b188;stroke:#5b3b21;stroke-width:2}.beam-fill{fill:#be8f5e;stroke:#5b3b21;stroke-width:2}.post-fill{fill:#a87849;stroke:#5b3b21;stroke-width:2}.concrete{fill:#d5d8d6;stroke:#59645e;stroke-width:2}.flashing{stroke:#c2462d;stroke-width:4;fill:none}.callout{font-size:13px;font-weight:700;fill:#fff;stroke:#17241d;stroke-width:1;paint-order:stroke;stroke-width:8}.checkbox{fill:#fff;stroke:#17241d;stroke-width:1.5}.status-pass{fill:#e8f5ed;stroke:#2c7652}.status-review{fill:#fff4da;stroke:#af6d00}.status-blocked{fill:#ffe8e3;stroke:#b33e2b}
  </style>`;
}

function table(rows: string[][], x: number, y: number, width: number, rowHeight: number, labelWidth = 180, middleWidth = 0): string {
  return rows.map((row, index) => {
    const rowY = y + index * rowHeight;
    const columns = row.length;
    return `<rect x="${x}" y="${rowY}" width="${width}" height="${rowHeight}" fill="#fff" class="table-line"/>
      <line x1="${x + labelWidth}" y1="${rowY}" x2="${x + labelWidth}" y2="${rowY + rowHeight}" class="table-line"/>
      ${columns > 2 ? `<line x1="${x + labelWidth + middleWidth}" y1="${rowY}" x2="${x + labelWidth + middleWidth}" y2="${rowY + rowHeight}" class="table-line"/>` : ''}
      <text class="table-label" x="${x + 12}" y="${rowY + 25}">${escapeXml(row[0])}</text>
      <text class="table-value" x="${x + labelWidth + 12}" y="${rowY + 25}">${escapeXml(row[1] || '')}</text>
      ${columns > 2 ? wrapText(row[2], x + labelWidth + middleWidth + 12, rowY + 20, width - labelWidth - middleWidth - 24, 10, 15) : ''}`;
  }).join('');
}

function connectionScheduleColumn(items: StructuralReport['connectionSchedule'], x: number, y: number, width: number): string {
  return items.map((item, index) => {
    const itemY = y + index * 61;
    const label = item.status === 'specified' ? 'SPECIFIED' : item.status === 'field-verification-required' ? 'FIELD VERIFY' : 'DESIGN REQUIRED';
    const statusClass = item.status === 'specified' ? 'status-pass' : item.status === 'field-verification-required' ? 'status-blocked' : 'status-review';
    return `<rect x="${x}" y="${itemY}" width="${width}" height="54" rx="3" class="${statusClass}"/><text class="table-label" x="${x + 10}" y="${itemY + 17}">${escapeXml(item.component.toUpperCase())}</text><text class="tiny" x="${x + width - 10}" y="${itemY + 17}" text-anchor="end">${label}</text>${wrapText(item.requirement, x + 10, itemY + 35, width - 20, 8, 10)}`;
  }).join('');
}

function calculationBlock(calculation: StructuralReport['calculations'][number], x: number, y: number, width: number): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="122" rx="4" class="status-${calculation.status}"/><text class="table-label" x="${x + 16}" y="${y + 23}">${escapeXml(calculation.status.toUpperCase())} · ${escapeXml(calculation.title.toUpperCase())}</text>${wrapText(calculation.equation, x + 16, y + 47, width - 32, 10, 13)}${wrapText(calculation.result, x + 16, y + 79, width - 32, 11, 14)}${wrapText(calculation.basis, x + 16, y + 105, width - 32, 8, 10)}`;
}

function professionalChecklist(report: StructuralReport, x: number, y: number, width: number): string {
  return report.professionalChecklist.map((item, index) => {
    const itemY = y + index * 68;
    const style = item.status === 'ready-for-review' ? 'status-pass' : item.status === 'design-required' ? 'status-blocked' : 'status-review';
    const label = item.status.replace(/-/g, ' ').toUpperCase();
    return `<rect x="${x}" y="${itemY}" width="${width}" height="60" rx="4" class="${style}"/><text class="table-label" x="${x + 12}" y="${itemY + 18}">${escapeXml(item.discipline.toUpperCase())} · ${escapeXml(label)}</text>${wrapText(item.label, x + 12, itemY + 36, width - 24, 10, 12)}${wrapText(item.evidence, x + 12, itemY + 51, width - 24, 8, 10)}`;
  }).join('');
}

function revisionTable(history: DrawingIssueRecord[], x: number, y: number, width: number): string {
  const visible = [...history].sort((a, b) => b.revision - a.revision).slice(0, 4);
  const header = `<rect x="${x}" y="${y}" width="${width}" height="28" fill="#edf1ef" class="table-line"/><text class="table-label" x="${x + 10}" y="${y + 19}">REV</text><text class="table-label" x="${x + 70}" y="${y + 19}">DATE</text><text class="table-label" x="${x + 175}" y="${y + 19}">DESIGN ID</text><text class="table-label" x="${x + 330}" y="${y + 19}">DESCRIPTION</text>`;
  return header + visible.map((record, index) => {
    const rowY = y + 28 + index * 32;
    return `<rect x="${x}" y="${rowY}" width="${width}" height="32" fill="#fff" class="table-line"/><text class="table-value" x="${x + 10}" y="${rowY + 21}">${String(record.revision).padStart(2, '0')}</text><text class="table-value" x="${x + 70}" y="${rowY + 21}">${escapeXml(record.issuedAt.slice(0, 10))}</text><text class="table-value" x="${x + 175}" y="${rowY + 21}">${escapeXml(record.designFingerprint)}</text><text class="table-value" x="${x + 330}" y="${rowY + 21}">${escapeXml(record.description)}</text>`;
  }).join('');
}

function noteList(notes: string[], x: number, y: number, spacing: number, maxWidth = 560): string {
  return notes.map((note, index) => `<text class="note" x="${x}" y="${y + index * spacing}">•</text>${wrapText(note, x + 20, y + index * spacing, maxWidth, 11, 15)}`).join('');
}

function wrapText(value: string, x: number, y: number, maxWidth: number, fontSize: number, lineHeight: number): string {
  const maxChars = Math.max(20, Math.floor(maxWidth / (fontSize * 0.57)));
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return `<text x="${x}" y="${y}" font-size="${fontSize}">${lines.slice(0, 4).map((item, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(item)}</tspan>`).join('')}</text>`;
}

function noticeBox(x: number, y: number, width: number, height: number, title: string, copy: string): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" class="notice"/><text class="notice-title" x="${x + 18}" y="${y + 26}">${escapeXml(title)}</text>${wrapText(copy, x + 18, y + 48, width - 36, 10, 13)}`;
}

function dimensionHorizontal(x1: number, x2: number, y: number, label: string): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="dimension"/><line x1="${x1}" y1="${y - 10}" x2="${x1}" y2="${y + 10}" class="dimension"/><line x1="${x2}" y1="${y - 10}" x2="${x2}" y2="${y + 10}" class="dimension"/><text class="dimension-text" x="${(x1 + x2) / 2}" y="${y - 10}" text-anchor="middle">${escapeXml(label)}</text>`;
}

function dimensionVertical(y1: number, y2: number, x: number, label: string): string {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="dimension"/><line x1="${x - 10}" y1="${y1}" x2="${x + 10}" y2="${y1}" class="dimension"/><line x1="${x - 10}" y1="${y2}" x2="${x + 10}" y2="${y2}" class="dimension"/><text class="dimension-text" x="${x - 12}" y="${(y1 + y2) / 2}" text-anchor="middle" transform="rotate(-90 ${x - 12} ${(y1 + y2) / 2})">${escapeXml(label)}</text>`;
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] || character);
}
