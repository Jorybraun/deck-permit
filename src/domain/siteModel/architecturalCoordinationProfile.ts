export type ArchitecturalRuleClassification =
  | 'authority-requirement'
  | 'adopted-code-context'
  | 'model-integrity'
  | 'project-review-assumption';

export interface ArchitecturalRuleSource {
  id: string;
  title: string;
  edition: string;
  url: string;
  locator: string;
  scope: string;
  exclusions: string[];
}

export interface ArchitecturalRuleParameter {
  id: string;
  label: string;
  value: number;
  unit: 'mm';
  editableAtProfessionalReview: boolean;
}

export interface ArchitecturalCoordinationRule {
  id: string;
  title: string;
  classification: ArchitecturalRuleClassification;
  statement: string;
  parameters: ArchitecturalRuleParameter[];
  sourceIds: string[];
  requiredResolution: string;
}

export interface ArchitecturalCoordinationProfile {
  schema: 'architectural-coordination-profile/v1';
  id: string;
  label: string;
  jurisdiction: string;
  adoptedCode: string;
  version: 1;
  sources: ArchitecturalRuleSource[];
  rules: ArchitecturalCoordinationRule[];
}

const BCBC_2024: ArchitecturalRuleSource = {
  id: 'bcbc-2024-revision-2',
  title: 'British Columbia Building Code 2024',
  edition: 'Revision 2 · December 2025 consolidation',
  url: 'https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/construction-industry/building-codes-and-standards/revisions-and-mo/bcbc_2024_web_version_revision2.pdf',
  locator: 'Division B, Sections 9.7, 9.8, 9.9 and 9.27; project-applicable sentences must be confirmed at issue',
  scope: 'Code context for residential windows, doors, stairs, landings, guards, egress and exterior-envelope construction.',
  exclusions: ['Project classification', 'Authority interpretation', 'Alternative solutions', 'Professional design and field verification'],
};

const VBBL_2025: ArchitecturalRuleSource = {
  id: 'vbbl-2025',
  title: 'Vancouver Building By-law 2025 · By-law 14343',
  edition: 'Effective September 15, 2025',
  url: 'https://vancouver.ca/your-government/vancouver-building-bylaw.aspx',
  locator: 'Book I, Division B, applicable Part 9 provisions; confirm current amendments at issue',
  scope: 'Adopted-code context for projects within the City of Vancouver.',
  exclusions: ['Project classification', 'Authority interpretation', 'Alternative solutions', 'Professional design and field verification'],
};

const BC_WINDOW_DOOR_BULLETIN: ArchitecturalRuleSource = {
  id: 'bc-b24-04-windows-doors-skylights',
  title: 'BC Building and Safety Standards Branch Bulletin B24-04 · Windows, Doors, and Skylights',
  edition: 'March 8, 2024',
  url: 'https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/construction-industry/building-codes-and-standards/bulletins/2024-code/b24-04_windows_doors_and_skylights.pdf',
  locator: 'BCBC 2024 Sections 9.6, 9.7 and 9.8 context',
  scope: 'Official change bulletin for fenestration standards and Building Code 2024 window and door requirements.',
  exclusions: ['Legal advice', 'Project-specific window use, egress or safety-glazing determination'],
};

const BCAB_1990: ArchitecturalRuleSource = {
  id: 'bcab-1990-door-landing',
  title: 'BC Building Code Appeal Board Decision 1990 · Clear height over landing, step from landing to floor',
  edition: 'Decision dated December 18, 2025',
  url: 'https://www2.gov.bc.ca/gov/content/industry/construction-industry/building-codes-standards/building-code-appeal-board/building-code-appeal-board-decisions/bcab-1990',
  locator: 'BCBC 2024 Sentences 9.8.4.1.(1), 9.8.6.2.(1)–(2), and 9.8.6.4.(2)',
  scope: 'Official interpretation context showing that door/landing transitions, risers, swing and headroom must be assessed together.',
  exclusions: ['A universal exterior-door threshold tolerance', 'Approval of this project configuration'],
};

const BCAB_1940: ArchitecturalRuleSource = {
  id: 'bcab-1940-window-egress-fall-protection',
  title: 'BC Building Code Appeal Board Decision 1940 · Window openings and egress windows',
  edition: 'Decision published November 29, 2024',
  url: 'https://www2.gov.bc.ca/gov/content/industry/construction-industry/building-codes-standards/building-code-appeal-board/building-code-appeal-board-decisions/bcab-1940',
  locator: 'BCBC window fall-protection and bedroom-egress provisions; confirm the adopted edition for the project',
  scope: 'Official interpretation context demonstrating that operability, fall protection and required egress can create distinct requirements.',
  exclusions: ['Inference that a photographed window is openable or required for bedroom egress', 'A universal sill-height clearance from a deck'],
};

const CWC_DECK_GUIDE: ArchitecturalRuleSource = {
  id: 'cwc-deck-span-guide-2025-download',
  title: 'Canadian Wood Council Residential Prescriptive Exterior Wood Deck Span Guide',
  edition: 'Revision 1 © 2016; publication page dated June 6, 2025',
  url: 'https://cwc.ca/publication/residential-prescriptive-exterior-wood-deck-span-guide/',
  locator: 'Guide scope and exclusions',
  scope: 'Preliminary gravity-member span screening under the guide assumptions.',
  exclusions: ['Footings', 'Railings and guards', 'House attachment', 'Lateral bracing', 'Building-envelope integration'],
};

const SIDNEY_DECK_GUIDE: ArchitecturalRuleSource = {
  id: 'sidney-residential-deck-guide',
  title: 'Town of Sidney Guide to Residential Deck Construction',
  edition: 'Current municipal download; confirm submission requirements at issue',
  url: 'https://www.sidney.ca/wp-content/uploads/Residential-Deck-Construction.pdf',
  locator: 'Plan Details and What Do I Need to Apply for a Permit?',
  scope: 'Municipal submission requirements: dimensions, footings, posts, structural sizing and spans, house-connection flashing, decking, guards, stairs, handrails, site plan, cross-section and floor plan.',
  exclusions: ['Project approval', 'Current zoning interpretation', 'Substitution for the BC Building Code'],
};

/**
 * Versioned architectural coordination basis. Numeric proximity values are
 * intentionally classified as review assumptions, not adopted-code limits.
 */
export function architecturalCoordinationProfileForMunicipality(municipality: string): ArchitecturalCoordinationProfile {
  const normalized = municipality.toLowerCase();
  const isVancouver = normalized.includes('vancouver');
  const isSidney = normalized.includes('sidney');
  const codeSource = isVancouver ? VBBL_2025 : BCBC_2024;
  const sources = [codeSource, BC_WINDOW_DOOR_BULLETIN, ...(isVancouver ? [] : [BCAB_1990, BCAB_1940]), CWC_DECK_GUIDE, ...(isSidney ? [SIDNEY_DECK_GUIDE] : [])];
  const authoritySourceIds = isSidney ? [SIDNEY_DECK_GUIDE.id] : [];
  return {
    schema: 'architectural-coordination-profile/v1',
    id: `${isVancouver ? 'vbbl-2025' : 'bcbc-2024'}-${isSidney ? 'sidney-' : ''}deck-openings-v1`,
    label: `${isVancouver ? 'Vancouver' : 'British Columbia'} residential deck opening coordination · v1`,
    jurisdiction: municipality || (isVancouver ? 'City of Vancouver' : 'British Columbia'),
    adoptedCode: codeSource.title,
    version: 1,
    sources,
    rules: [
      {
        id: 'AC-01-opening-evidence', title: 'Opening dimensions and evidence', classification: authoritySourceIds.length ? 'authority-requirement' : 'model-integrity',
        statement: 'Every wall opening that can interact with the deck must have width, wall offset, sill/threshold elevation, height and evidence status recorded.',
        parameters: [], sourceIds: authoritySourceIds,
        requiredResolution: 'Field-measure every door and window on the design wall and have the responsible reviewer accept the record.',
      },
      {
        id: 'AC-02-house-edge-datum', title: 'House-edge attachment to wall datum', classification: 'model-integrity',
        statement: 'An edge classified as house-connected must coincide with the selected wall datum within the model snap tolerance.',
        parameters: [{ id: 'wallAlignmentToleranceMm', label: 'Model snap tolerance', value: 100, unit: 'mm', editableAtProfessionalReview: true }], sourceIds: [],
        requiredResolution: 'Reattach or reclassify detached geometry; replace the tolerance with accepted survey/field geometry before issue.',
      },
      {
        id: 'AC-03-door-landing-transition', title: 'Door threshold and landing transition', classification: 'project-review-assumption',
        statement: 'The software screens for a deck surface above the recorded threshold and flags larger vertical transitions for door swing, landing, riser, drainage and accessibility review.',
        parameters: [
          { id: 'doorObstructionToleranceMm', label: 'Above-threshold obstruction tolerance', value: 25, unit: 'mm', editableAtProfessionalReview: true },
          { id: 'doorTransitionReviewMm', label: 'Below-threshold transition review trigger', value: 200, unit: 'mm', editableAtProfessionalReview: true },
        ], sourceIds: isVancouver ? [codeSource.id] : [codeSource.id, BCAB_1990.id],
        requiredResolution: 'Confirm threshold, swing, landing level/size, allowable riser geometry, headroom, drainage and accessible path under the adopted code.',
      },
      {
        id: 'AC-04-window-deck-interaction', title: 'Window and raised-surface interaction', classification: 'project-review-assumption',
        statement: 'The software blocks a surface that reaches the modeled sill zone and flags nearby sills for opening-use, operability, fall-protection, safety-glazing, egress and guard review.',
        parameters: [
          { id: 'windowSillZoneBufferMm', label: 'Sill-zone geometric buffer', value: 50, unit: 'mm', editableAtProfessionalReview: true },
          { id: 'windowProximityReviewMm', label: 'Window proximity review trigger', value: 900, unit: 'mm', editableAtProfessionalReview: true },
        ], sourceIds: [codeSource.id, BC_WINDOW_DOOR_BULLETIN.id, ...(isVancouver ? [] : [BCAB_1940.id])],
        requiredResolution: 'Classify each window and resolve operability, fall protection, safety glazing, bedroom egress and guard interaction under the adopted code.',
      },
      {
        id: 'AC-05-ledger-opening-zone', title: 'Ledger and opening intersection', classification: 'model-integrity',
        statement: 'A preliminary ledger zone must not cross a recorded door or window opening; the actual member, header, fasteners, substrate, flashing and lateral load path govern.',
        parameters: [{ id: 'defaultLedgerDepthMm', label: 'Fallback ledger-zone depth when rim depth is unrecorded', value: 235, unit: 'mm', editableAtProfessionalReview: true }],
        sourceIds: [CWC_DECK_GUIDE.id, ...authoritySourceIds],
        requiredResolution: 'Record the actual rim/member depth and provide reviewed attachment, opening-header, flashing and envelope details.',
      },
      {
        id: 'AC-06-provisional-opening-heights', title: 'Legacy provisional opening heights', classification: 'project-review-assumption',
        statement: 'Legacy opening records without a measured height use explicit diagram-only defaults so intersections can be visualized without implying a field dimension.',
        parameters: [
          { id: 'provisionalDoorHeightMm', label: 'Legacy provisional door height', value: 2100, unit: 'mm', editableAtProfessionalReview: true },
          { id: 'provisionalWindowHeightMm', label: 'Legacy provisional window height', value: 1200, unit: 'mm', editableAtProfessionalReview: true },
        ],
        sourceIds: [],
        requiredResolution: 'Replace every provisional height with a field measurement before professional issue.',
      },
    ],
  };
}

export function architecturalRule(profile: ArchitecturalCoordinationProfile, id: string): ArchitecturalCoordinationRule {
  const rule = profile.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`Architectural coordination rule ${id} is missing from ${profile.id}.`);
  return rule;
}

export function architecturalRuleParameter(profile: ArchitecturalCoordinationProfile, ruleId: string, parameterId: string): number {
  const parameter = architecturalRule(profile, ruleId).parameters.find((candidate) => candidate.id === parameterId);
  if (!parameter) throw new Error(`Architectural coordination parameter ${ruleId}.${parameterId} is missing from ${profile.id}.`);
  return parameter.value;
}
