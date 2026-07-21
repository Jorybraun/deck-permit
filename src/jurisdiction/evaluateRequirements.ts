import type { Property } from '../types';
import type { SiteComplianceAssessment } from '../domain/siteModel';
import type { ChecklistTrigger } from './rulePack';
import { SIDNEY_RULE_PACK, setbacksForZone } from './sidney';

export type RequirementStatus = 'required' | 'conditional' | 'confirm';

export interface RequiredDrawing { id: string; label: string; minScale: string | null; status: RequirementStatus; note: string | null }
export interface SupportingDoc { id: string; label: string; category: string; status: RequirementStatus; when: string; note: string | null }
export interface SetbackRow { yard: string; requiredMm: number; proposedMm: number | null; variance: boolean }
export interface SubmissionRequirements {
  municipality: string;
  drawings: RequiredDrawing[];
  supportingDocs: SupportingDoc[];
  projectData: {
    zone: string | null;
    lotAreaSqm: number | null;
    setbacks: SetbackRow[];
    coverage: { proposedPct: number | null; maxPct: number | null; exceeds: boolean };
  };
  summary: { requiredDrawings: number; conditionalDocs: number; variances: number };
}

/** Turn a checklist trigger into a plain-language status + condition. */
function classify(trigger: ChecklistTrigger): { status: RequirementStatus; when: string } {
  switch (trigger.kind) {
    case 'always': return { status: 'required', when: '' };
    case 'userConfirmed': return { status: 'confirm', when: trigger.question };
    case 'requiredByInspector': return { status: 'conditional', when: 'if the inspector or engineer requires it' };
    case 'gisElevationBelowGeodetic': return { status: 'conditional', when: `if the lot sits below ${trigger.metres} m geodetic (flood level)` };
    case 'nearProtectedTree': return { status: 'conditional', when: 'if footings fall within a protected tree’s root zone' };
    case 'removesOrPrunesProtectedTree': return { status: 'conditional', when: 'if a protected tree is removed or pruned' };
    case 'esaOverlay': return { status: 'conditional', when: 'if the lot is in an Environmentally Sensitive Area, or work changes servicing/access' };
    case 'occupiesRightOfWay': return { status: 'conditional', when: 'if the deck occupies a sidewalk, lane, boulevard, or on-street parking' };
    case 'increasesImpermeableArea': return { status: 'conditional', when: 'if the deck increases impermeable area' };
    case 'applicantNotOwner': return { status: 'conditional', when: 'if the applicant is not the owner' };
    case 'ownerIsCompany': return { status: 'conditional', when: 'if the owner is a company' };
    case 'newConstruction': return { status: 'conditional', when: 'new construction only' };
    case 'buildingBuiltBeforeYear': return { status: 'conditional', when: `if the building predates ${trigger.year}` };
    case 'contaminatedSiteHistory': return { status: 'conditional', when: 'if the site has a contamination history' };
    case 'archaeologicalSite': return { status: 'conditional', when: 'if the lot is a recorded archaeological site' };
    case 'temporaryConstructionWater': return { status: 'conditional', when: 'if temporary construction water is used' };
    default: return { status: 'conditional', when: '' };
  }
}

/**
 * Evaluate the Town of Sidney submission requirements for the current deck project:
 * the required drawings, the required-vs-proposed setbacks (with variance flags), lot
 * coverage, and the full supporting-document checklist with what triggers each. Fully
 * deterministic from the rule pack + zoning + the reference siting checks.
 */
export function evaluateSidneyRequirements(property: Property, compliance: SiteComplianceAssessment): SubmissionRequirements {
  const pack = SIDNEY_RULE_PACK;
  const drawings: RequiredDrawing[] = pack.drawings
    .filter((drawing) => drawing.appliesToDeck)
    .map((drawing) => ({ id: drawing.id, label: drawing.label, minScale: drawing.minScale ?? null, status: classify(drawing.trigger).status, note: drawing.note ?? null }));

  const supportingDocs: SupportingDoc[] = pack.checklist
    .filter((item) => item.appliesToDeck)
    .map((item) => { const c = classify(item.trigger); return { id: item.id, label: item.label, category: item.category, status: c.status, when: c.when, note: item.note ?? null }; });

  const zone = property.zoning?.zone ?? property.parcel?.zoningCode ?? null;
  const lotAreaSqm = property.parcel?.areaSqm ?? null;
  const rule = setbacksForZone(zone, lotAreaSqm);
  const required: Record<string, number> = rule ? { front: rule.frontM * 1000, rear: rule.rearM * 1000, 'interior-side': rule.interiorSideM * 1000, 'exterior-side': rule.exteriorSideM * 1000 } : {};
  // Proposed = the closest modeled component distance to each yard (from the reference siting screen).
  const proposedByYard: Record<string, number> = {};
  for (const check of compliance.setbackChecks) {
    const key = check.yard;
    if (proposedByYard[key] === undefined || check.referenceDistanceMm < proposedByYard[key]) proposedByYard[key] = check.referenceDistanceMm;
  }
  const setbacks: SetbackRow[] = Object.entries(required).map(([yard, requiredMm]) => {
    const proposedMm = proposedByYard[yard] ?? null;
    return { yard, requiredMm, proposedMm, variance: proposedMm !== null && proposedMm < requiredMm };
  });

  const coverage = {
    proposedPct: compliance.coverage.referenceCoveragePercent ?? null,
    maxPct: compliance.coverage.maximumCoveragePercent ?? (property.zoning?.maxLotCoverage ?? null),
    exceeds: compliance.coverage.status === 'reference-exceeds-limit',
  };

  return {
    municipality: pack.municipality,
    drawings,
    supportingDocs,
    projectData: { zone, lotAreaSqm, setbacks, coverage },
    summary: {
      requiredDrawings: drawings.filter((drawing) => drawing.status === 'required').length,
      conditionalDocs: supportingDocs.filter((doc) => doc.status !== 'required').length,
      variances: setbacks.filter((row) => row.variance).length,
    },
  };
}
