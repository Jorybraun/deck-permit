import type { ConnectionScheduleItem, Deck, DesignCheck, ProfessionalChecklistItem, Property, ReviewGate, StructuralCalculation, StructuralReport } from '../types';
import { assessExistingConditions, existingConditionBasis, ledgerConditionSummary } from './existingConditions';
import { assessSitePlacement, placementBasis } from './sitePlacement';
import { assessDeckLayout, layoutSummary } from './deckLayout';

const DEAD_LOAD_KPA = 0.5;
const MINIMUM_LIVE_LOAD_KPA = 1.9;
const ASSUMED_SOIL_BEARING_KPA = 75;

/**
 * Creates a transparent preliminary design-basis report.
 *
 * Responsibility: calculate quantities and expose assumptions/review gates.
 * This module deliberately does not certify member capacity or site conditions.
 */
export function analyzeStructure(property: Property, deck: Deck, generatedAt = new Date().toISOString()): StructuralReport {
  const liveOrSnowLoadKpa = round(Math.max(MINIMUM_LIVE_LOAD_KPA, property.snowLoad), 2);
  const totalAreaLoadKpa = round(DEAD_LOAD_KPA + liveOrSnowLoadKpa, 2);
  const joistCount = Math.ceil((deck.dimensions.width * 1000) / deck.structure.joistSpacing) + 1;
  const layoutAssessment = assessDeckLayout(deck);
  const layout = layoutAssessment.layout;
  const beamCount = layout.beamOffsetsFromHouseM.length;
  const postsPerBeam = layout.postStationsM.length;
  const postCount = postsPerBeam * beamCount;
  const actualPostSpacingM = layoutAssessment.maxPostBayM;
  const totalDesignLoadKn = deck.area * totalAreaLoadKpa;
  const joistLineLoadKnM = totalAreaLoadKpa * deck.structure.joistSpacing / 1000;
  const joistMomentDemandKnM = joistLineLoadKnM * deck.dimensions.depth ** 2 / 8;
  const joistShearDemandKn = joistLineLoadKnM * deck.dimensions.depth / 2;
  const joistSpanUtilization = deck.structure.selection.joistMaxSpanM
    ? deck.dimensions.depth / deck.structure.selection.joistMaxSpanM
    : null;
  const support = calculateSupportReactions(deck, totalAreaLoadKpa, layout.beamOffsetsFromHouseM);
  const beamLineLoadKnM = Math.max(...support.beamLineLoadsKnM, 0);
  const exteriorBeamReactionKn = (support.beamLineLoadsKnM[support.beamLineLoadsKnM.length - 1] || 0) * deck.dimensions.width;
  const ledgerReactionKn = support.ledgerLineLoadKnM * deck.dimensions.width;
  const governingPostReactionKn = beamLineLoadKnM * maxSupportTributaryWidth(layout.postStationsM, deck.dimensions.width);
  const estimatedPostReactionKn = exteriorBeamReactionKn / postsPerBeam;
  const tributaryAreaPerPostSqm = governingPostReactionKn / totalAreaLoadKpa;
  const requiredFootingAreaSqm = governingPostReactionKn / ASSUMED_SOIL_BEARING_KPA;
  const providedFootingAreaSqm = Math.pow(deck.structure.footingSize / 1000, 2);
  const tableSelection = deck.structure.selection;
  const tableSupported = tableSelection.status === 'table-supported' && layoutAssessment.errors.length === 0;
  const existingConditions = property.existingConditions;
  const existingConditionAssessment = existingConditions ? assessExistingConditions(existingConditions, deck) : null;
  const ledgerBlocked = deck.footprint.attachedToHouse && (
    !existingConditions || existingConditions.rimBoardMaterial === 'unknown' || existingConditions.flashingFeasible === 'no' || Boolean(existingConditionAssessment?.errors.length)
  );

  const checks: DesignCheck[] = [
    {
      id: 'geometry',
      title: 'Model geometry',
      status: dimensionsAreConsistent(deck) ? 'pass' : 'blocked',
      result: `${deck.dimensions.width.toFixed(2)} m × ${deck.dimensions.depth.toFixed(2)} m; ${deck.area.toFixed(2)} m² model area`,
      basis: 'Parametric deck model; dimensions govern.',
    },
    {
      id: 'support-layout',
      title: 'Beam, post, footing, and stair coordinates',
      status: layoutAssessment.errors.length ? 'blocked' : 'review',
      result: layoutSummary(deck),
      basis: layoutAssessment.errors.length ? layoutAssessment.errors.join(' ') : 'Explicit local construction coordinates; professional review and field layout remain required.',
    },
    {
      id: 'joists',
      title: 'Joist selection',
      status: tableSupported ? 'pass' : 'blocked',
      result: `${deck.structure.joistSize} ${deck.structure.joistSpecies} at ${deck.structure.joistSpacing} mm o.c.; ${deck.dimensions.depth.toFixed(2)} m design span${tableSelection.joistMaxSpanM ? ` ≤ ${tableSelection.joistMaxSpanM.toFixed(2)} m table maximum` : ''}`,
      basis: tableSupported
        ? `${tableSelection.sourceTitle}, ${tableSelection.joistTable}; assumptions listed in this report.`
        : tableSelection.reason || 'No supported prescriptive table selection is available.',
    },
    {
      id: 'beam-posts',
      title: 'Beam and posts',
      status: tableSupported ? 'pass' : 'blocked',
      result: `${beamCount} × ${deck.structure.beamSize} beam line${beamCount > 1 ? 's' : ''}; ${deck.structure.postSize} posts; ${postsPerBeam} posts/beam at ${actualPostSpacingM.toFixed(2)} m actual spacing`,
      basis: tableSupported
        ? `${tableSelection.sourceTitle}, ${tableSelection.beamTable}, lookup span ${tableSelection.beamLookupSpanM?.toFixed(2)} m. Built-up beam fastening, bearing, post stability, lateral restraint, and hardware remain excluded from this pass.`
        : tableSelection.reason || 'Engineering design is required.',
    },
    {
      id: 'footings',
      title: 'Preliminary footing bearing',
      status: providedFootingAreaSqm >= requiredFootingAreaSqm ? 'review' : 'blocked',
      result: `${round(governingPostReactionKn, 2)} kN governing interior post reaction; ${round(providedFootingAreaSqm, 3)} m² provided vs ${round(requiredFootingAreaSqm, 3)} m² required at assumed bearing`,
      basis: `Conservative uniform-load support reaction using ${ASSUMED_SOIL_BEARING_KPA} kPa assumed allowable soil bearing. Site soil, footing thickness/reinforcement, frost depth, uplift, and lateral resistance remain subject to professional verification.`,
    },
    {
      id: 'ledger',
      title: deck.footprint.attachedToHouse ? 'Ledger and house connection' : 'Freestanding lateral system',
      status: ledgerBlocked ? 'blocked' : 'review',
      result: deck.footprint.attachedToHouse
        ? existingConditions ? ledgerConditionSummary(existingConditions) : 'Existing attachment wall and substrate have not been measured'
        : 'Independent supports and lateral bracing required',
      basis: deck.footprint.attachedToHouse
        ? `${existingConditionBasis(property)}.${existingConditionAssessment?.errors.length ? ` Input errors: ${existingConditionAssessment.errors.join(' ')}` : ''} Existing wall construction, waterproofing, fastener type, edge distances, spacing, and lateral load connection must be professionally verified and designed.`
        : 'Freestanding deck bracing and foundation restraint must be designed for lateral loads.',
    },
    {
      id: 'guards',
      title: 'Guards and stairs',
      status: deck.guard.enabled || deck.footprint.heightAboveGrade <= 0.6 ? 'review' : 'blocked',
      result: deck.guard.enabled
        ? `${deck.guard.height} mm guard; ${deck.guard.openingMax} mm maximum opening${deck.stairs.enabled ? `; ${deck.stairs.numRisers} stair risers` : ''}`
        : 'No guard in model',
      basis: 'Heights, openings, concentrated loads, post connections, handrails, landings, and field geometry require code review.',
    },
  ];

  const calculations = buildCalculations(deck, {
    totalAreaLoadKpa, totalDesignLoadKn, joistLineLoadKnM, joistMomentDemandKnM, joistShearDemandKn,
    joistSpanUtilization, beamLineLoadKnM, exteriorBeamReactionKn, ledgerReactionKn, actualPostSpacingM,
    governingPostReactionKn, requiredFootingAreaSqm, providedFootingAreaSqm, tableSupported,
  });
  const connectionSchedule = buildConnectionSchedule(property, deck, ledgerBlocked);
  const professionalChecklist = buildProfessionalChecklist(property, deck, tableSupported, ledgerBlocked, providedFootingAreaSqm >= requiredFootingAreaSqm);
  const gates = buildReviewGates(property, deck);

  return {
    generatedAt,
    codeEdition: 'British Columbia Building Code 2024; Town of Sidney Zoning Bylaw No. 2275',
    designBasis: {
      deadLoadKpa: DEAD_LOAD_KPA,
      liveOrSnowLoadKpa,
      totalAreaLoadKpa,
      assumedSoilBearingKpa: ASSUMED_SOIL_BEARING_KPA,
    },
    quantities: {
      deckAreaSqm: round(deck.area, 2),
      joistSpanM: round(deck.dimensions.depth, 2),
      joistCount,
      beamCount,
      postsPerBeam,
      actualPostSpacingM: round(actualPostSpacingM, 3),
      totalDesignLoadKn: round(totalDesignLoadKn, 2),
      joistLineLoadKnM: round(joistLineLoadKnM, 3),
      joistMomentDemandKnM: round(joistMomentDemandKnM, 3),
      joistShearDemandKn: round(joistShearDemandKn, 3),
      joistSpanUtilization: joistSpanUtilization === null ? null : round(joistSpanUtilization, 3),
      beamLineLoadKnM: round(beamLineLoadKnM, 3),
      exteriorBeamReactionKn: round(exteriorBeamReactionKn, 2),
      ledgerReactionKn: round(ledgerReactionKn, 2),
      governingPostReactionKn: round(governingPostReactionKn, 2),
      beamSpanM: round(deck.dimensions.width, 2),
      postCount,
      tributaryAreaPerPostSqm: round(tributaryAreaPerPostSqm, 3),
      estimatedPostReactionKn: round(estimatedPostReactionKn, 2),
      requiredFootingAreaSqm: round(requiredFootingAreaSqm, 3),
      providedFootingAreaSqm: round(providedFootingAreaSqm, 3),
    },
    loadPath: [
      `Decking carries ${totalAreaLoadKpa.toFixed(2)} kPa preliminary area load to joists.`,
      `${joistCount} joists span ${deck.dimensions.depth.toFixed(2)} m between ${deck.footprint.attachedToHouse ? 'ledger and beam' : 'support beams'}.`,
      `${beamCount} ${deck.structure.beamSize} beam line${beamCount > 1 ? 's' : ''} at ${layout.beamOffsetsFromHouseM.map((value) => value.toFixed(3)).join(', ')} m carry gravity load to ${postsPerBeam} supports at stations ${layout.postStationsM.map((value) => value.toFixed(3)).join(', ')} m.`,
      `${deck.structure.postSize} posts transfer up to ${round(governingPostReactionKn, 2)} kN calculated gravity reaction to concrete footings.`,
      `Footings transfer load to soil; ${ASSUMED_SOIL_BEARING_KPA} kPa is an unverified design assumption.`,
    ],
    checks,
    calculations,
    connectionSchedule,
    professionalChecklist,
    gates,
    limitations: [
      'This is a preliminary design-basis report, not a sealed engineering calculation or authorization to construct.',
      property.existingConditions
        ? 'User-entered existing-condition measurements are coordination inputs only until supported by accepted field-verification evidence for this revision.'
        : 'Roofline GIS is context only and is not a legal survey or a field measurement of wall framing.',
      tableSupported
        ? `Joist, beam, and post selections match ${tableSelection.joistTable}/${tableSelection.beamTable} under the listed assumptions; connections, lateral loads, durability, drainage, guards, stairs, soil, and frost protection remain outside that scope.`
        : 'The framing configuration is outside the encoded table scope and requires engineering design.',
      'Drawing dimensions and verified site measurements govern over the rendered model.',
    ],
  };
}

function buildCalculations(deck: Deck, values: {
  totalAreaLoadKpa: number;
  totalDesignLoadKn: number;
  joistLineLoadKnM: number;
  joistMomentDemandKnM: number;
  joistShearDemandKn: number;
  joistSpanUtilization: number | null;
  beamLineLoadKnM: number;
  exteriorBeamReactionKn: number;
  ledgerReactionKn: number;
  actualPostSpacingM: number;
  governingPostReactionKn: number;
  requiredFootingAreaSqm: number;
  providedFootingAreaSqm: number;
  tableSupported: boolean;
}): StructuralCalculation[] {
  const layout = assessDeckLayout(deck).layout;
  const requiredFootingSideMm = Math.ceil(Math.sqrt(values.requiredFootingAreaSqm) * 1000 / 25) * 25;
  const stairTotalRiseMm = deck.stairs.numRisers * deck.stairs.riserHeight;
  const stairTreadCount = Math.max(0, deck.stairs.numRisers - 1);
  const stairTotalRunMm = stairTreadCount * deck.stairs.treadRun;
  const stairPitchDeg = deck.stairs.enabled && stairTotalRunMm > 0 ? Math.atan(stairTotalRiseMm / stairTotalRunMm) * 180 / Math.PI : 0;
  return [
    {
      id: 'gravity-load', title: 'Total gravity design load', status: 'pass',
      equation: `W = q × A = ${values.totalAreaLoadKpa.toFixed(2)} kPa × ${deck.area.toFixed(2)} m²`,
      result: `${values.totalDesignLoadKn.toFixed(2)} kN total preliminary gravity load`,
      basis: 'CWC guide basis: 1.9 kPa live load and 0.5 kPa dead load; project snow governs when higher.',
    },
    {
      id: 'joist-demand', title: 'Joist demand and table utilization', status: values.tableSupported && (values.joistSpanUtilization || Infinity) <= 1 ? 'pass' : 'blocked',
      equation: `w = q × s = ${values.totalAreaLoadKpa.toFixed(2)} × ${(deck.structure.joistSpacing / 1000).toFixed(3)} = ${values.joistLineLoadKnM.toFixed(3)} kN/m; M = wL²/8; V = wL/2`,
      result: `${values.joistMomentDemandKnM.toFixed(3)} kN·m moment; ${values.joistShearDemandKn.toFixed(3)} kN shear; ${values.joistSpanUtilization === null ? 'no table capacity' : `${(values.joistSpanUtilization * 100).toFixed(1)}% allowable-span utilization`}`,
      basis: `${deck.structure.selection.joistTable}; table pass covers the listed grade, species, wet-service, treatment, spacing, and lateral-support assumptions.`,
    },
    {
      id: 'beam-demand', title: 'Beam line and support reactions', status: values.tableSupported && values.actualPostSpacingM <= deck.structure.postSpacing + 0.001 ? 'pass' : 'blocked',
      equation: deck.footprint.attachedToHouse
        ? `Rbeam/L = qD²/(2b) = ${values.totalAreaLoadKpa.toFixed(2)} × ${deck.dimensions.depth.toFixed(3)}² ÷ (2 × ${layout.beamOffsetsFromHouseM[0]?.toFixed(3) || '—'}) = ${values.beamLineLoadKnM.toFixed(3)} kN/m`
        : `Beam reactions from ΣV = qD and ΣM = 0 at offsets ${layout.beamOffsetsFromHouseM.map((value) => value.toFixed(3)).join(', ')} m; governing line reaction ${values.beamLineLoadKnM.toFixed(3)} kN/m`,
      result: `${values.exteriorBeamReactionKn.toFixed(2)} kN exterior beam-line reaction; ${values.actualPostSpacingM.toFixed(3)} m actual support spacing; ${values.governingPostReactionKn.toFixed(2)} kN governing post reaction`,
      basis: `${deck.structure.selection.beamTable}; reactions use the modeled beam offsets, and each post reaction uses its adjacent half-bays plus any modeled beam end overhang.`,
    },
    {
      id: 'ledger-reaction', title: deck.footprint.attachedToHouse ? 'House ledger gravity reaction' : 'Second beam-line reaction', status: 'review',
      equation: deck.footprint.attachedToHouse ? 'Rledger = Wtotal − Rbeam from vertical equilibrium' : 'Beam-line reactions resolved from the two modeled support offsets by static equilibrium',
      result: deck.footprint.attachedToHouse ? `${values.ledgerReactionKn.toFixed(2)} kN total vertical ledger reaction` : `${values.exteriorBeamReactionKn.toFixed(2)} kN second beam-line reaction`,
      basis: deck.footprint.attachedToHouse ? 'Demand only. Fastener group capacity, substrate, edge distances, lateral ties, and envelope continuity require professional design.' : 'Freestanding bracing, overturning, sliding, uplift, and foundation restraint require professional design.',
    },
    {
      id: 'footing-bearing', title: 'Governing footing bearing', status: values.providedFootingAreaSqm >= values.requiredFootingAreaSqm ? 'review' : 'blocked',
      equation: `Areq = Rmax/qallow = ${values.governingPostReactionKn.toFixed(2)} kN ÷ ${ASSUMED_SOIL_BEARING_KPA} kPa = ${values.requiredFootingAreaSqm.toFixed(3)} m²`,
      result: `${requiredFootingSideMm} mm calculated square side before constructability/site minimums; model provides ${deck.structure.footingSize} × ${deck.structure.footingSize} mm`,
      basis: 'Bearing-only screening. Soil, frost, thickness, reinforcement, eccentricity, uplift, durability, and inspection criteria are not established by this result.',
    },
    {
      id: 'stair-geometry', title: 'Stair geometry', status: !deck.stairs.enabled || (deck.stairs.riserHeight >= 125 && deck.stairs.riserHeight <= 200 && deck.stairs.treadRun >= 255 && deck.stairs.treadRun <= 355 && deck.stairs.width >= .86) ? 'review' : 'blocked',
      equation: deck.stairs.enabled ? `${deck.stairs.numRisers} risers × ${deck.stairs.riserHeight} mm; ${stairTreadCount} treads × ${deck.stairs.treadRun} mm` : 'No stair in current model',
      result: deck.stairs.enabled ? `${stairTotalRiseMm} mm total rise; ${stairTotalRunMm} mm total run; ${stairPitchDeg.toFixed(1)}° pitch; ${(deck.stairs.width * 1000).toFixed(0)} mm clear width; ${layout.stairOffsetM.toFixed(3)} m offset on ${deck.stairs.edge} edge; ${layout.stairLandingDepthM.toFixed(3)} m landing` : 'Not applicable',
      basis: 'Geometry screening only. Landings, headroom, handrails, guards, stringers, connections, and actual grades require review.',
    },
  ];
}

function buildConnectionSchedule(property: Property, deck: Deck, ledgerBlocked: boolean): ConnectionScheduleItem[] {
  const exteriorFastenerBasis = 'Use manufacturer-approved, corrosion-resistant hardware and fasteners compatible with preservative-treated lumber and exterior exposure.';
  return [
    { id: 'decking-joist', component: 'Decking to joists', requirement: `${deck.structure.deckingThickness} mm ${deck.structure.deckingMaterial}; fastening, edge distance, gaps, and end joints per product installation requirements.`, status: 'professional-selection-required', basis: exteriorFastenerBasis },
    { id: 'joist-ledger', component: deck.footprint.attachedToHouse ? 'Joist to ledger' : 'Joist to inner beam', requirement: `Full-depth exterior-rated hanger or reviewed bearing detail sized for ${deck.structure.joistSize}; install only with the connector manufacturer’s specified fasteners.`, status: 'professional-selection-required', basis: exteriorFastenerBasis },
    { id: 'joist-beam', component: 'Joist to exterior beam', requirement: 'Provide positive uplift/lateral restraint at every joist; connector capacity and fasteners selected for the reviewed load path.', status: 'professional-selection-required', basis: 'CWC span tables rely on joist lateral support but do not select connection hardware.' },
    { id: 'beam-plies', component: 'Built-up beam plies', requirement: `${deck.structure.beamSize}; ply splices only over supports; fastening pattern, end distance, bearing, and moisture separation to reviewed detail.`, status: 'professional-selection-required', basis: 'CWC Figure 2 references NBC 9.23.8 built-up beam detailing.' },
    { id: 'beam-post', component: 'Beam to post', requirement: `Exterior-rated cap sized for ${deck.structure.beamSize} on ${deck.structure.postSize}; provide positive uplift and lateral restraint without unsupported notching.`, status: 'professional-selection-required', basis: exteriorFastenerBasis },
    { id: 'post-footing', component: 'Post to concrete', requirement: `${deck.structure.postSize} post on exterior-rated standoff base with reviewed anchor; keep wood clear of standing water and soil.`, status: 'professional-selection-required', basis: 'Town of Sidney example identifies a post saddle with anchor bolt; actual hardware and anchorage require selection.' },
    { id: 'ledger-house', component: 'Ledger to existing house', requirement: deck.footprint.attachedToHouse ? `Design fastener type, diameter, spacing, stagger, edge/end distances, blocking, and load transfer for ${property.existingConditions ? ledgerConditionSummary(property.existingConditions) : 'field-verified wall framing'}.` : 'Not applicable; provide a reviewed freestanding lateral system.', status: deck.footprint.attachedToHouse ? ledgerBlocked ? 'field-verification-required' : 'professional-selection-required' : 'professional-selection-required', basis: 'House attachment is expressly outside the CWC span-guide scope.' },
    { id: 'lateral', component: 'Lateral load path', requirement: deck.footprint.attachedToHouse ? 'Provide reviewed deck-to-house lateral-load connectors and diaphragm/blocking load path, or redesign as a fully freestanding braced system.' : 'Provide reviewed diagonal bracing and foundation restraint for lateral, overturning, sliding, and uplift actions.', status: 'professional-selection-required', basis: 'Lateral bracing is expressly outside the CWC span-guide scope.' },
    { id: 'guard', component: 'Guard posts / panels', requirement: deck.guard.enabled ? `${deck.guard.height} mm ${deck.guard.material}; provide a tested or engineered post/panel attachment and continuous load path to joists/rim/blocking.` : 'Confirm whether guards are required at every open edge and stair/landing; add a reviewed system where required.', status: 'professional-selection-required', basis: 'Guards and railings are expressly outside the CWC span-guide scope.' },
    { id: 'stairs', component: 'Stair stringers / landing', requirement: deck.stairs.enabled ? `${deck.stairs.numRisers} risers at ${deck.stairs.riserHeight} mm and ${Math.max(0, deck.stairs.numRisers - 1)} treads at ${deck.stairs.treadRun} mm; design stringers, top/bottom connections, landing, handrail, and guards.` : 'Not applicable in current model.', status: deck.stairs.enabled ? 'professional-selection-required' : 'specified', basis: 'Town of Sidney requires stairs and handrails to be shown; structural connection design remains project-specific.' },
    { id: 'flashing', component: 'Ledger flashing / envelope', requirement: deck.footprint.attachedToHouse ? 'Provide continuous corrosion-compatible flashing behind the water-resistive barrier, end dams, door-sill integration, and a drainage path; do not rely on face sealant alone.' : 'Maintain separation and drainage at the house; no ledger penetration.', status: deck.footprint.attachedToHouse && !property.existingConditions ? 'field-verification-required' : 'professional-selection-required', basis: 'Town of Sidney requires flashing details at the house connection.' },
  ];
}

function buildProfessionalChecklist(property: Property, deck: Deck, tableSupported: boolean, ledgerBlocked: boolean, footingBearingPass: boolean): ProfessionalChecklistItem[] {
  const placement = assessSitePlacement(property, deck);
  const layout = assessDeckLayout(deck);
  return [
    { id: 'survey', discipline: 'site', label: 'Legal site dimensions, yards, easements, and deck setbacks', status: 'evidence-required', evidence: 'Accepted legal survey or municipal site-plan confirmation bound to this issue.' },
    { id: 'placement', discipline: 'site', label: 'Deck location from house wall, openings, boundaries, stairs, posts, and footings', status: placement.errors.length || layout.errors.length ? 'design-required' : 'evidence-required', evidence: `${placementBasis(property, deck)}. ${layoutSummary(deck)}. Field/survey evidence required.` },
    { id: 'existing', discipline: 'structure', label: 'Existing wall, openings, rim/band, cladding, and utilities', status: deck.footprint.attachedToHouse && !property.existingConditions ? 'evidence-required' : 'ready-for-review', evidence: property.existingConditions ? existingConditionBasis(property) : 'Field report and photographs required.' },
    { id: 'members', discipline: 'structure', label: 'Joist, beam, and post table selection', status: tableSupported ? 'ready-for-review' : 'design-required', evidence: tableSupported ? `${deck.structure.selection.sourceTitle}, ${deck.structure.selection.joistTable}/${deck.structure.selection.beamTable}` : deck.structure.selection.reason || 'Engineering required.' },
    { id: 'connections', discipline: 'structure', label: 'Ledger, hangers, beam plies, caps, bases, bracing, and uplift', status: 'design-required', evidence: ledgerBlocked ? 'Field verification plus sealed connection schedule required.' : 'Qualified professional connector schedule required.' },
    { id: 'foundation', discipline: 'structure', label: 'Soil, frost, footing bearing, thickness, reinforcement, and anchorage', status: footingBearingPass ? 'evidence-required' : 'design-required', evidence: footingBearingPass ? 'Bearing screening passes assumed soil; confirm with field/engineering evidence.' : 'Model footing bearing is insufficient under the assumed value.' },
    { id: 'envelope', discipline: 'envelope', label: 'Flashing, drainage, treated-lumber compatibility, and door-sill integration', status: deck.footprint.attachedToHouse ? 'design-required' : 'ready-for-review', evidence: deck.footprint.attachedToHouse ? 'Reviewed envelope detail and field substrate evidence required.' : 'Verify clearances and drainage at freestanding deck.' },
    { id: 'guards-stairs', discipline: 'life-safety', label: 'Guards, handrails, stairs, landings, and attachment loads', status: deck.guard.enabled || deck.stairs.enabled ? 'design-required' : 'evidence-required', evidence: 'Tested system documentation or qualified design plus field geometry.' },
    { id: 'municipal', discipline: 'municipal', label: 'Current Sidney checklist, application, fees, stormwater, and fire safety', status: 'evidence-required', evidence: 'Current municipal confirmations and signed owner documents required.' },
  ];
}

function buildReviewGates(property: Property, deck: Deck): ReviewGate[] {
  const liveParcel = property.parcel?.geometrySource === 'live';
  const primaryBuilding = property.buildings.find((building) => building.primary);
  return [
    {
      id: 'legal-survey',
      label: 'Legal boundaries and setbacks confirmed',
      status: 'required',
      responsibleParty: 'surveyor',
      detail: liveParcel
        ? 'Municipal parcel geometry was retrieved, but legal pins, dimensions, easements, and setbacks still require survey confirmation.'
        : 'Parcel geometry is estimated; obtain a current legal survey or accepted site plan.',
    },
    {
      id: 'deck-placement',
      label: 'Deck-to-house placement and footing coordinates verified',
      status: 'required',
      responsibleParty: 'designer',
      detail: `${placementBasis(property, deck)}. ${layoutSummary(deck)}. ${[...assessSitePlacement(property, deck).errors, ...assessDeckLayout(deck).errors].join(' ') || 'Accept a dimensioned field report or survey coordination record before permit submission.'}`,
    },
    {
      id: 'yard-orientation',
      label: 'Street frontage and yard orientation confirmed',
      status: 'required',
      responsibleParty: 'municipality',
      detail: 'Confirm front, rear, interior-side, and exterior-side yards before relying on the setback envelope.',
    },
    {
      id: 'house-field-check',
      label: 'Existing house and attachment substrate field-verified',
      status: deck.footprint.attachedToHouse ? 'required' : 'not-applicable',
      responsibleParty: 'designer',
      detail: property.existingConditions
        ? `${existingConditionBasis(property)}. Attach a designer, engineer, or architect field report bound to the current design revision.`
        : primaryBuilding
        ? 'Municipal roofline is reference context only; verify wall face, cladding, rim/band joist, openings, and utilities on site.'
        : 'No authoritative building geometry is available; field measurement is required.',
    },
    {
      id: 'soil-frost',
      label: 'Soil bearing, footing depth, and frost protection confirmed',
      status: 'required',
      responsibleParty: 'engineer',
      detail: `Confirm soil capacity and footing construction; the report assumes ${ASSUMED_SOIL_BEARING_KPA} kPa bearing.`,
    },
    {
      id: 'structural-review',
      label: 'Structural members, connections, guards, and lateral system reviewed',
      status: 'required',
      responsibleParty: 'engineer',
      detail: deck.structure.selection.status === 'table-supported'
        ? `Joists, beam, and posts trace to ${deck.structure.selection.joistTable}/${deck.structure.selection.beamTable}. A qualified designer or engineer must still review excluded connections, hardware, bracing, guards, stairs, footings, and field conditions.`
        : `Framing is not supported by the encoded table scope: ${deck.structure.selection.reason || 'engineering design required'}`,
    },
    {
      id: 'stormwater',
      label: 'Stormwater requirement confirmed with Sidney Engineering',
      status: 'required',
      responsibleParty: 'municipality',
      detail: 'Sidney advises that work decreasing site permeability may require a civil-engineered stormwater system and covenant.',
    },
    {
      id: 'application',
      label: 'Current application, owner authorization, fees, and fire-safety documents assembled',
      status: 'required',
      responsibleParty: 'owner',
      detail: 'Use current Town forms and confirm the construction fire safety plan and any project-specific approvals.',
    },
  ];
}

function dimensionsAreConsistent(deck: Deck): boolean {
  if (deck.footprint.shape !== 'rectangle') return deck.area > 0;
  return Math.abs(deck.dimensions.width * deck.dimensions.depth - deck.area) < 0.02;
}

function calculateSupportReactions(deck: Deck, areaLoadKnM2: number, beamOffsetsM: number[]): { beamLineLoadsKnM: number[]; ledgerLineLoadKnM: number } {
  const depth = deck.dimensions.depth;
  const totalLineLoad = areaLoadKnM2 * depth;
  if (deck.footprint.attachedToHouse) {
    const beamOffset = beamOffsetsM[0];
    if (!Number.isFinite(beamOffset) || beamOffset <= 0) return { beamLineLoadsKnM: [totalLineLoad / 2], ledgerLineLoadKnM: totalLineLoad / 2 };
    const beamReaction = areaLoadKnM2 * depth * depth / (2 * beamOffset);
    return { beamLineLoadsKnM: [Math.max(0, beamReaction)], ledgerLineLoadKnM: Math.max(0, totalLineLoad - beamReaction) };
  }
  const inner = beamOffsetsM[0];
  const outer = beamOffsetsM[1];
  if (!Number.isFinite(inner) || !Number.isFinite(outer) || outer <= inner) return { beamLineLoadsKnM: [totalLineLoad / 2, totalLineLoad / 2], ledgerLineLoadKnM: 0 };
  const outerReaction = areaLoadKnM2 * depth * (depth / 2 - inner) / (outer - inner);
  return { beamLineLoadsKnM: [Math.max(0, totalLineLoad - outerReaction), Math.max(0, outerReaction)], ledgerLineLoadKnM: 0 };
}

function maxSupportTributaryWidth(stationsM: number[], widthM: number): number {
  if (stationsM.length < 2) return widthM;
  return Math.max(...stationsM.map((station, index) => {
    const left = index === 0 ? station : (station - stationsM[index - 1]) / 2;
    const right = index === stationsM.length - 1 ? widthM - station : (stationsM[index + 1] - station) / 2;
    return Math.max(0, left + right);
  }));
}

function round(value: number, decimals: number): number {
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
}
