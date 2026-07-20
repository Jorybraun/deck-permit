import type { RulePack } from './rulePack';

/**
 * Rule pack #1 — Town of Sidney, BC.
 * Encodes the official "Building Permit Application: Single & Two-Family Residential
 * Buildings, Demolition, and Accessory Buildings" (April 2026) as data: application
 * fields, the full checklist with machine-evaluable triggers, and issuance-stage
 * requirements. The adaptive engine renders only what a given project actually needs.
 */
export const SIDNEY_RULE_PACK: RulePack = {
  id: 'town-of-sidney-bc',
  municipality: 'Town of Sidney',
  province: 'BC',
  effectiveDate: '2026-04',
  source: 'https://www.sidney.ca/wp-content/uploads/Building-Permit-Application-SF-2F-Demo-Accessory.pdf',
  contacts: {
    department: 'Development Services',
    phone: '250-656-1725',
    email: 'developmentservices@sidney.ca',
    address: '2440 Sidney Avenue, Sidney BC V8L 1Y7',
  },

  drawings: [
    { id: 'site-plan', label: 'Site plan (title, scale, legal desc, north arrow, property lines + dimensions, setbacks from all existing/proposed structures, proposed construction shaded, lot coverage, easements/ROWs)', minScale: '1:100', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'foundation-plan', label: 'Foundation plan (footings/posts)', minScale: '1:100', trigger: { kind: 'always' }, appliesToDeck: true, note: 'Required for decks per the Town drawings table.' },
    { id: 'floor-plan', label: 'Floor / framing plan (uses & dimensions of areas, joists, beams, roof)', minScale: '1:100', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'elevations', label: 'Exterior elevations (finishes, grade & floor levels, building height, spatial separation)', minScale: '1:100', trigger: { kind: 'userConfirmed', question: 'Does the deck need elevation drawings? (Town lists elevations as "Varies" for decks.)' }, appliesToDeck: true, note: 'Elevations "Varies" for decks per the Town drawings table.' },
    { id: 'building-section', label: 'Building section / cross-section (footing, framing, guard/rail assemblies, geodetic elevations)', minScale: '1:100', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'professional-engineering', label: 'Professional engineering drawings', trigger: { kind: 'requiredByInspector' }, appliesToDeck: true, note: 'Required for freestanding / long-span decks beyond the prescriptive span tables.' },
  ],

  applicationFields: [
    { id: 'civic-address', label: 'Civic address', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'owner-contact', label: 'Property-owner contact + signature', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'contractor', label: 'Contractor/applicant info incl. business-licence # + issuing municipality', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'owner-authorization', label: 'Owner authorization (Appointment of Agent)', trigger: { kind: 'applicantNotOwner' }, appliesToDeck: true },
    { id: 'corporate-registry', label: 'Corporate registry showing signing authority', trigger: { kind: 'ownerIsCompany' }, appliesToDeck: true },
    { id: 'construction-type', label: 'Construction type (new / addition / renovation / demolition / blasting / other)', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'building-use', label: 'Building use (single-family / duplex / accessory / deck / other)', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'project-description', label: 'Project description', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'service-sizes', label: 'Existing sewer, storm, water service sizes', trigger: { kind: 'always' }, appliesToDeck: false, },
    { id: 'construction-value', label: 'Estimated total construction value', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'floor-areas', label: 'Existing & proposed floor area, building area, residential/commercial unit counts', trigger: { kind: 'always' }, appliesToDeck: false, },
  ],

  checklist: [
    // Basic administrative
    { id: 'application-form', label: 'Completed application form & checklist', category: 'admin', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'appointment-of-agent', label: 'Appointment of Agent / Strata Approval letter', category: 'admin', trigger: { kind: 'applicantNotOwner' }, appliesToDeck: true },
    { id: 'corporate-registry', label: 'Corporate-registry documentation (signing authority)', category: 'admin', trigger: { kind: 'ownerIsCompany' }, appliesToDeck: true },
    { id: 'title-search', label: 'Land-title search + charges (within past 30 days; or authorize Town search $16+GST/title, $26+GST/charge)', category: 'admin', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'dp-dvp-conditions', label: 'Evidence DP/DVP conditions satisfied (covenants, landscape deposit, tree fencing)', category: 'admin', trigger: { kind: 'userConfirmed', question: 'Does the property have an active Development Permit or Variance with conditions?' }, appliesToDeck: true },

    // Engineering / structural
    { id: 'letters-of-assurance', label: 'Professional Letters of Assurance (Schedules A & B)', category: 'engineering', trigger: { kind: 'requiredByInspector' }, appliesToDeck: true },
    { id: 'lot-parking-coverage', label: 'Lot-coverage & parking-area calculations on the site plan', category: 'drawing', trigger: { kind: 'always' }, appliesToDeck: true },
    { id: 'bc-energy-report', label: 'BC Energy Compliance Report (pre-construction performance path)', category: 'engineering', trigger: { kind: 'newConstruction' }, appliesToDeck: false },

    // Environmental / site
    { id: 'site-servicing-plan', label: 'Site-servicing plan', category: 'environmental', trigger: { kind: 'esaOverlay' }, appliesToDeck: true, note: 'Also when work changes use, servicing, or street access.' },
    { id: 'fcl-flood-report', label: 'Flood Construction Level report + assurance statement', category: 'environmental', trigger: { kind: 'gisElevationBelowGeodetic', metres: 5.0 }, appliesToDeck: true, note: 'Waterfront/low-lying Peninsula lots — a flood-hazard covenant is then registered on title.' },
    { id: 'arborist-report', label: 'Arborist report + tree-protection fencing plan', category: 'environmental', trigger: { kind: 'nearProtectedTree' }, appliesToDeck: true, note: 'Deck footings within a protected tree root zone. Bylaw No. 2138.' },
    { id: 'tree-removal-permit', label: 'Tree Removal Permit', category: 'environmental', trigger: { kind: 'removesOrPrunesProtectedTree' }, appliesToDeck: true },
    { id: 'stormwater-plan', label: 'Civil-engineered stormwater-management plan', category: 'environmental', trigger: { kind: 'increasesImpermeableArea' }, appliesToDeck: true, note: 'A stormwater covenant is then registered on title.' },
    { id: 'archaeology', label: 'BC Archaeology Branch response', category: 'environmental', trigger: { kind: 'archaeologicalSite' }, appliesToDeck: true },
    { id: 'site-disclosure', label: 'Site Disclosure Statement', category: 'environmental', trigger: { kind: 'contaminatedSiteHistory' }, appliesToDeck: false },

    // Safety / demolition
    { id: 'construction-fire-safety', label: 'Construction Fire Safety Plan (Town template)', category: 'safety', trigger: { kind: 'userConfirmed', question: 'Does this project require a construction fire safety plan? (Town says most do.)' }, appliesToDeck: true },
    { id: 'construction-management-plan', label: 'Construction Management Plan', category: 'safety', trigger: { kind: 'requiredByInspector' }, appliesToDeck: false },
    { id: 'hpo-documents', label: 'Homeowner Protection Office (HPO) documents', category: 'admin', trigger: { kind: 'newConstruction' }, appliesToDeck: false },
    { id: 'worksafe-notice', label: 'WorkSafeBC Notice of Project', category: 'safety', trigger: { kind: 'userConfirmed', question: 'Will a contractor perform the work (WorkSafeBC Notice of Project)?' }, appliesToDeck: true },
    { id: 'hazmat-assessment', label: 'Hazardous Materials Assessment', category: 'safety', trigger: { kind: 'buildingBuiltBeforeYear', year: 1990 }, appliesToDeck: false, note: 'Demolition/renovation of pre-1990 buildings.' },
    { id: 'abatement-letter', label: 'Clearance / abatement letter', category: 'safety', trigger: { kind: 'buildingBuiltBeforeYear', year: 1990 }, appliesToDeck: false },

    // Utility / right-of-way
    { id: 'row-permit', label: 'Right-of-Way Permit', category: 'utility', trigger: { kind: 'occupiesRightOfWay' }, appliesToDeck: true, note: 'Deck, bins, fencing, or vehicles occupying sidewalk/lane/boulevard/on-street parking.' },
    { id: 'crd-cross-connection', label: 'CRD Cross Connection Control Survey', category: 'utility', trigger: { kind: 'temporaryConstructionWater' }, appliesToDeck: false },
    { id: 'bc-hydro-designer', label: 'BC Hydro confirmation of assigned designer (underground service)', category: 'utility', trigger: { kind: 'newConstruction' }, appliesToDeck: false },
    { id: 'business-licence', label: 'Contractor business-licence number + municipality', category: 'admin', trigger: { kind: 'userConfirmed', question: 'Will a licensed contractor perform the work?' }, appliesToDeck: true },
  ],

  issuance: {
    paperApprovedSets: 2,
    covenantsOnTitle: [
      'Stormwater-management covenant (when a stormwater system is required; civil engineer provides operating manual)',
      'Flood-hazard covenant (when an FCL report is required)',
    ],
    feesBeforeIssuance: [
      'Plan processing fee AT APPLICATION: $50 (construction value < $100k — covers virtually all decks), $100 (> $100k)',
      'BP Valuation Fee (Building Bylaw No. 2016, Schedule A) — based on construction valuation, payable at pickup',
      'Off-site Works Deposit (Section 5.2.3)',
      'Bonus Density Payment (Policy DV-013)',
      'Parking-in-lieu Payment (Bylaw No. 2140)',
      'On-site Landscape Deposit (per Development Permit)',
      'Development Cost Charges (Municipal Bylaw No. 1440 + CRD Bylaw No. 2758)',
    ],
    notes: [
      'The Town only begins review once the application is COMPLETE and the processing fee is paid.',
      'Two paper sets of Town-stamped approved drawings must be delivered before the permit is issued.',
      'Demolition of a single/two-family dwelling must generally be completed and the site cleared within 14 calendar days unless an approved construction-management plan sets another timeline.',
      'Accessory-building location, dimensions, setbacks, height, and lot coverage must comply with the parcel’s current zoning — confirm with Development Services before final plans.',
      'Intake: Town Hall by appointment or 8:30–10:00 a.m. and 3:00–4:00 p.m.; digital plans to developmentservices@sidney.ca.',
      'Victoria Airport (AZR/OLS) height restrictions may apply near the airport.',
      'Processing time ~2–3 weeks, reviewed in order of submission. Fees paid at pickup (cash/cheque/debit).',
      'Inspections are NOT automatic — the homeowner/contractor books them (250-656-1725, 24h ahead). Framing inspection requires an approved foundation survey first.',
    ],
  },
};

/**
 * Setback + lot-coverage regulations, encoded from Town of Sidney Zoning Bylaw No. 2275
 * (§5.2.1 coverage, §5.2.2 setbacks, §5.2.3 building regs, §5.1.6 projections).
 * Lets the app auto-check whether a proposed deck clears the required yards.
 */
export interface ZoneRule {
  maxLotAreaSqm: number; // upper bound for this row (use Infinity for the last)
  frontM: number; rearM: number; interiorSideM: number; exteriorSideM: number;
  maxCoveragePct: number;
}

export const SIDNEY_SETBACKS: {
  source: string;
  zones: Record<string, ZoneRule[]>;
  naturalBoundarySetbackM: number;
  deckProjection: { intoYardWhenSetbackUnder4_5M: number; intoYardWhenSetback4_5MOrGreater: number; minFromLotLineM: number; unenclosedPorchProjectionM: number; note: string };
} = {
  source: 'Town of Sidney Zoning Bylaw No. 2275 · §5.2.1–5.2.3, §5.1.6',
  zones: {
    R1: [
      { maxLotAreaSqm: 400, frontM: 3.0, rearM: 3.0, interiorSideM: 1.2, exteriorSideM: 3.0, maxCoveragePct: 50 },
      { maxLotAreaSqm: Infinity, frontM: 4.5, rearM: 3.0, interiorSideM: 2.0, exteriorSideM: 3.0, maxCoveragePct: 50 },
    ],
    'R1-ESA': [{ maxLotAreaSqm: Infinity, frontM: 3.0, rearM: 5.5, interiorSideM: 2.0, exteriorSideM: 3.0, maxCoveragePct: 35 }],
    R2: [{ maxLotAreaSqm: Infinity, frontM: 4.5, rearM: 4.5, interiorSideM: 2.0, exteriorSideM: 3.0, maxCoveragePct: 45 }],
    'R2-ESA': [
      { maxLotAreaSqm: 1000, frontM: 4.5, rearM: 5.5, interiorSideM: 2.0, exteriorSideM: 3.0, maxCoveragePct: 30 },
      { maxLotAreaSqm: Infinity, frontM: 4.5, rearM: 7.5, interiorSideM: 3.0, exteriorSideM: 4.5, maxCoveragePct: 20 },
    ],
    R3: [{ maxLotAreaSqm: Infinity, frontM: 3.0, rearM: 3.0, interiorSideM: 1.5, exteriorSideM: 3.0, maxCoveragePct: 50 }],
    R4: [{ maxLotAreaSqm: Infinity, frontM: 3.0, rearM: 1.5, interiorSideM: 1.5, exteriorSideM: 3.0, maxCoveragePct: 40 }],
  },
  // §5.2.3.b — no building/structure within 15m of the sea/water natural boundary (seawalls exempt).
  // Pairs with the High_Water_Mark GIS layer: a waterfront deck is governed by THIS, not the yard setbacks.
  naturalBoundarySetbackM: 15,
  deckProjection: {
    intoYardWhenSetbackUnder4_5M: 1.5, // §5.1.6.b.i
    intoYardWhenSetback4_5MOrGreater: 3.0, // §5.1.6.b.ii
    minFromLotLineM: 1.5, // §5.1.6.b.iii
    unenclosedPorchProjectionM: 0.6, // §5.1.6.a.v
    note: 'A raised or covered deck must meet the full yard setback. Low (≤1.2m above grade), unenclosed, uncovered stairs/ramps/landings may project into the front/exterior-side/rear yard by the amounts above, keeping ≥1.5m from any lot line.',
  },
};

/** Resolve the applicable setback row for a zone class + lot area. */
export function setbacksForZone(zoneClass: string | null | undefined, lotAreaSqm: number | null | undefined): ZoneRule | null {
  if (!zoneClass) return null;
  const rows = SIDNEY_SETBACKS.zones[zoneClass.toUpperCase()] || SIDNEY_SETBACKS.zones[zoneClass];
  if (!rows) return null;
  const area = Number.isFinite(lotAreaSqm) ? Number(lotAreaSqm) : 0;
  return rows.find((row) => area <= row.maxLotAreaSqm) || rows[rows.length - 1];
}
