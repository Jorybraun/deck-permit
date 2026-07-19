import { assessExistingConditionCapture, assessExistingConditionFieldSurvey, assessTerrainFieldRecord } from '../domain/siteModel';
import type { SubmissionReadiness, SidneyApplicationData, VerificationEvidence, ProfessionalReviewCycle, Property } from '../types';
import type { CanonicalReviewIssue } from './canonicalReviewIssue';
import { buildProfessionalWorkPackages, validateProfessionalWorkResolutions } from './professionalWorkResolution';
import { validateSidneyApplication } from './sidneyApplication';
import { assessSidneyMunicipalIntake } from './sidneyMunicipalIntake';

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
  const existingField = site ? assessExistingConditionFieldSurvey(site) : null;
  const gradeField = site?.terrain ? assessTerrainFieldRecord(site.terrain) : null;
  const acceptedCycle = input.reviewCycles.find((cycle) => cycle.sourceDesignFingerprint === fingerprint && cycle.decision === 'accepted' && cycle.issuerRole === 'engineer' && cycle.professionalDiscipline === 'structural' && Boolean(cycle.firmName?.trim()) && Boolean(cycle.permitToPracticeNumber?.trim()));
  const expectedWorkPackages = issue.reviewPackage.calculationReport ? buildProfessionalWorkPackages(issue.reviewPackage.calculationReport).length : 0;
  const structuredResolutionCount = acceptedCycle?.structuralResolutions?.length || 0;
  let structuredResolutionsValid = false;
  if (acceptedCycle && issue.reviewPackage.calculationReport) {
    try {
      validateProfessionalWorkResolutions(acceptedCycle.structuralResolutions || [], issue.reviewPackage.calculationReport, acceptedCycle.decision);
      structuredResolutionsValid = true;
    } catch { /* Persisted or manually edited records fail closed. */ }
  }
  const acceptedEvidence = input.evidence.some((item) => item.kind === 'sealed-structural-review' && item.decision === 'accepted' && item.designFingerprint === fingerprint && item.issuerRole === 'engineer' && item.professionalDiscipline === 'structural' && item.professionalRegistry === 'egbc' && item.registryStatus === 'directory-confirmed-by-user' && Boolean(item.firmName?.trim()) && Boolean(item.permitToPracticeNumber?.trim()));
  const signedApplication = input.evidence.some((item) => item.kind === 'application-checklist' && item.gateId === 'signed-application' && item.designFingerprint === fingerprint);
  const propertyOffsets = input.evidence.some((item) => item.gateId === 'property-offsets' && (item.kind === 'field-report' || item.kind === 'legal-survey') && item.designFingerprint === fingerprint);
  const municipalZoningConfirmation = input.evidence.some((item) => item.gateId === 'zoning-compliance' && item.kind === 'municipal-confirmation' && item.designFingerprint === fingerprint);
  const siteCompliance = issue.reviewPackage.calculationReport?.siteCompliance;
  const currentModeledExtentScreen = siteCompliance?.schema === 'site-compliance/v2' && siteCompliance.scope === 'modeled-platform-stair-landing-and-footing-extents';
  const zoningScreenReady = currentModeledExtentScreen && siteCompliance.setbackStatus === 'reference-pass' && siteCompliance.coverage.status !== 'reference-exceeds-limit' && siteCompliance.coverage.status !== 'unavailable';
  const missingApplicationFields = validateSidneyApplication(input.application);
  const professionalReviewAccepted = Boolean(acceptedEvidence && acceptedCycle && structuredResolutionsValid && structuredResolutionCount === expectedWorkPackages && expectedWorkPackages > 0);
  const intake = assessSidneyMunicipalIntake({
    application: input.application,
    evidence: input.evidence,
    designFingerprint: fingerprint,
    drawingSheetCount: issue.reviewPackage.planset?.length || 0,
    professionalReviewAccepted,
    lotCoverageIncluded: Boolean(currentModeledExtentScreen && siteCompliance?.coverage.status !== 'unavailable'),
  });
  const intakeItem = (id: string) => intake.items.find((item) => item.id === id)!;
  const gates: SubmissionReadiness['gates'] = [
    gate('parcel', 'Legal parcel and PID', Boolean(property.parcel?.pid), 'owner', property.parcel?.pid ? `PID ${property.parcel.pid}` : 'Research and confirm the legal parcel before submission.'),
    gate('zoning', 'Zoning, yards, setbacks, and coverage screen', Boolean(property.zoning?.zone && (zoningScreenReady || municipalZoningConfirmation)), 'municipality', !property.zoning?.zone ? 'Obtain the current municipal zone and applicable siting rules.' : municipalZoningConfirmation ? `A municipal siting confirmation is attached to ${fingerprint}.` : zoningScreenReady ? `Zone ${property.zoning.zone}; modeled platforms, stairs, landings, and footing extents pass the named-yard reference screen, and reference lot coverage is within the recorded limit.` : !currentModeledExtentScreen ? 'Regenerate the current permit package so stairs, landings, and generated footing extents are included in the zoning screen.' : siteCompliance?.setbackStatus === 'orientation-required' ? 'Select both the front street line and rear parcel line before relying on named-yard setback checks.' : 'The reference siting screen fails or is unavailable. Revise the design or attach a municipal confirmation resolving the exact fingerprint.'),
    gate('property-offsets', 'Verified deck-to-property offsets', propertyOffsets, 'owner', propertyOffsets ? `A dimensioned survey or field-measurement record is attached to ${fingerprint}.` : 'Attach a dimensioned survey or field-measurement record confirming the written deck and footing offsets; municipal GIS remains reference-only.'),
    gate('existing-conditions', 'Field-confirmed existing conditions', Boolean(existingField?.current && gradeField?.current && capture?.readyForProfessionalReview), 'owner', existingField?.current && gradeField?.current && capture?.readyForProfessionalReview ? 'Wall geometry, local grade, and required capture views match their controlled field records.' : 'Complete current controlled wall and grade worksheets and confirm every required house/grade capture view.'),
    gate('professional-review', 'Accepted professional structural review', professionalReviewAccepted, 'engineer', acceptedEvidence && acceptedCycle && structuredResolutionsValid ? `${acceptedCycle.firmName} · Permit to Practice ${acceptedCycle.permitToPracticeNumber}; ${structuredResolutionCount} of ${expectedWorkPackages} structural work packages resolved for ${fingerprint}.` : 'Import an EGBC engineer’s accepted sealed structural review for this exact fingerprint, including engineering firm, Permit to Practice number, and every structural work-package resolution.'),
    gate('application-data', 'Complete municipal application data', missingApplicationFields.length === 0, 'owner', missingApplicationFields.length ? `Complete: ${missingApplicationFields.join(', ')}.` : 'Required Town of Sidney application fields are complete.'),
    gate('signed-application', 'Signed Town application and checklist', signedApplication, 'owner', signedApplication ? 'A signed application PDF is attached to this exact issue.' : 'Upload the owner-signed application/checklist PDF for this fingerprint.'),
    intakeGate(intakeItem('owner-authorization'), 'owner'),
    intakeGate(intakeItem('land-title-search'), 'owner'),
    intakeGate(intakeItem('construction-fire-safety-plan'), 'owner'),
  ];
  const confirmedCount = gates.filter((item) => item.status === 'confirmed').length;
  const requiredCount = gates.filter((item) => item.status !== 'not-applicable').length;
  const ready = confirmedCount === requiredCount;
  return { status: ready ? 'ready-to-submit' : 'review-package', confirmedCount, requiredCount, gates, summary: ready ? `All ${requiredCount} canonical submission gates are recorded for ${fingerprint}. Municipal completeness review is still required.` : `${confirmedCount} of ${requiredCount} canonical submission gates are recorded. The package remains a professional-review package.` };
}

function gate(id: string, label: string, confirmed: boolean, responsibleParty: SubmissionReadiness['gates'][number]['responsibleParty'], detail: string): SubmissionReadiness['gates'][number] {
  return { id, label, status: confirmed ? 'confirmed' : 'required', responsibleParty, detail };
}

function intakeGate(item: ReturnType<typeof assessSidneyMunicipalIntake>['items'][number], responsibleParty: SubmissionReadiness['gates'][number]['responsibleParty']): SubmissionReadiness['gates'][number] {
  return { id: item.id, label: item.label, status: item.status === 'not-applicable' ? 'not-applicable' : item.status === 'outstanding' ? 'required' : 'confirmed', responsibleParty, detail: item.detail };
}
