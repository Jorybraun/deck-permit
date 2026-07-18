import { assessExistingConditionCapture } from '../domain/siteModel';
import type { SubmissionReadiness, SidneyApplicationData, VerificationEvidence, ProfessionalReviewCycle, Property } from '../types';
import type { CanonicalReviewIssue } from './canonicalReviewIssue';
import { buildProfessionalWorkPackages, validateProfessionalWorkResolutions } from './professionalWorkResolution';
import { validateSidneyApplication } from './sidneyApplication';

export function evaluateCanonicalPermitReadiness(input: {
  issue: CanonicalReviewIssue;
  property: Property;
  application: SidneyApplicationData;
  evidence: VerificationEvidence[];
  reviewCycles: ProfessionalReviewCycle[];
}): SubmissionReadiness {
  const { issue, property } = input;
  const fingerprint = issue.manifest.designFingerprint;
  const site = (issue.reviewPackage.deck.canonical as { site?: import('../domain/siteModel').SiteModel } | undefined)?.site;
  const capture = site ? assessExistingConditionCapture(site.capture, { hasDoor: site.designWall.openings.some((opening) => opening.kind === 'door') }) : null;
  const acceptedCycle = input.reviewCycles.find((cycle) => cycle.sourceDesignFingerprint === fingerprint && cycle.decision === 'accepted');
  const expectedWorkPackages = issue.reviewPackage.calculationReport ? buildProfessionalWorkPackages(issue.reviewPackage.calculationReport).length : 0;
  const structuredResolutionCount = acceptedCycle?.structuralResolutions?.length || 0;
  let structuredResolutionsValid = false;
  if (acceptedCycle && issue.reviewPackage.calculationReport) {
    try {
      validateProfessionalWorkResolutions(acceptedCycle.structuralResolutions || [], issue.reviewPackage.calculationReport, acceptedCycle.decision);
      structuredResolutionsValid = true;
    } catch { /* Persisted or manually edited records fail closed. */ }
  }
  const acceptedEvidence = input.evidence.some((item) => item.kind === 'sealed-structural-review' && item.decision === 'accepted' && item.designFingerprint === fingerprint);
  const signedApplication = input.evidence.some((item) => item.kind === 'application-checklist' && item.gateId === 'signed-application' && item.designFingerprint === fingerprint);
  const propertyOffsets = input.evidence.some((item) => item.gateId === 'property-offsets' && (item.kind === 'field-report' || item.kind === 'legal-survey') && item.designFingerprint === fingerprint);
  const municipalZoningConfirmation = input.evidence.some((item) => item.gateId === 'zoning-compliance' && item.kind === 'municipal-confirmation' && item.designFingerprint === fingerprint);
  const siteCompliance = issue.reviewPackage.calculationReport?.siteCompliance;
  const zoningScreenReady = siteCompliance?.setbackStatus === 'reference-pass' && siteCompliance.coverage.status !== 'reference-exceeds-limit' && siteCompliance.coverage.status !== 'unavailable';
  const missingApplicationFields = validateSidneyApplication(input.application);
  const gates: SubmissionReadiness['gates'] = [
    gate('parcel', 'Legal parcel and PID', Boolean(property.parcel?.pid), 'owner', property.parcel?.pid ? `PID ${property.parcel.pid}` : 'Research and confirm the legal parcel before submission.'),
    gate('zoning', 'Zoning, yards, setbacks, and coverage screen', Boolean(property.zoning?.zone && (zoningScreenReady || municipalZoningConfirmation)), 'municipality', !property.zoning?.zone ? 'Obtain the current municipal zone and applicable siting rules.' : municipalZoningConfirmation ? `A municipal siting confirmation is attached to ${fingerprint}.` : zoningScreenReady ? `Zone ${property.zoning.zone}; named-yard reference setbacks and lot coverage screen within recorded limits.` : siteCompliance?.setbackStatus === 'orientation-required' ? 'Select both the front street line and rear parcel line before relying on named-yard setback checks.' : 'The reference siting screen fails or is unavailable. Revise the design or attach a municipal confirmation resolving the exact fingerprint.'),
    gate('property-offsets', 'Verified deck-to-property offsets', propertyOffsets, 'owner', propertyOffsets ? `A dimensioned survey or field-measurement record is attached to ${fingerprint}.` : 'Attach a dimensioned survey or field-measurement record confirming the written deck and footing offsets; municipal GIS remains reference-only.'),
    gate('existing-conditions', 'Field-confirmed existing conditions', Boolean(site?.designWall.selectionStatus === 'field-measured' && capture?.readyForProfessionalReview), 'owner', site?.designWall.selectionStatus === 'field-measured' && capture?.readyForProfessionalReview ? 'Wall geometry and required capture views are field-confirmed.' : 'Field-measure the selected wall and confirm every required house/grade capture view.'),
    gate('professional-review', 'Accepted professional structural review', Boolean(acceptedEvidence && acceptedCycle && structuredResolutionsValid && structuredResolutionCount === expectedWorkPackages && expectedWorkPackages > 0), 'engineer', acceptedEvidence && acceptedCycle && structuredResolutionsValid ? `${structuredResolutionCount} of ${expectedWorkPackages} structural work packages resolved for ${fingerprint}.` : 'Import a valid accepted sealed review for this exact fingerprint with every structural work package resolved.'),
    gate('application-data', 'Complete municipal application data', missingApplicationFields.length === 0, 'owner', missingApplicationFields.length ? `Complete: ${missingApplicationFields.join(', ')}.` : 'Required Town of Sidney application fields are complete.'),
    gate('signed-application', 'Signed application and owner authorization', signedApplication, 'owner', signedApplication ? 'A signed application PDF is attached to this exact issue.' : 'Upload the owner-signed application/checklist PDF for this fingerprint.'),
  ];
  const confirmedCount = gates.filter((item) => item.status === 'confirmed').length;
  const requiredCount = gates.length;
  const ready = confirmedCount === requiredCount;
  return { status: ready ? 'ready-to-submit' : 'review-package', confirmedCount, requiredCount, gates, summary: ready ? `All ${requiredCount} canonical submission gates are recorded for ${fingerprint}. Municipal completeness review is still required.` : `${confirmedCount} of ${requiredCount} canonical submission gates are recorded. The package remains a professional-review package.` };
}

function gate(id: string, label: string, confirmed: boolean, responsibleParty: SubmissionReadiness['gates'][number]['responsibleParty'], detail: string): SubmissionReadiness['gates'][number] {
  return { id, label, status: confirmed ? 'confirmed' : 'required', responsibleParty, detail };
}
