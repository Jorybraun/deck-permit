import type { SidneyApplicationData, VerificationEvidence } from '../types';

export const SIDNEY_INTAKE_EDITION = 'April 2026';
export const SIDNEY_INTAKE_SOURCE_URL = 'https://www.sidney.ca/wp-content/uploads/Building-Permit-Application-SF-2F-Demo-Accessory.pdf';
export const SIDNEY_BUILDING_PERMIT_PAGE_URL = 'https://www.sidney.ca/planning-building/building-renovations-and-development/building-permits-and-inspections/';

export interface SidneyIntakeItem {
  id: string;
  label: string;
  status: 'included' | 'attached' | 'town-search-authorized' | 'not-applicable' | 'outstanding' | 'town-confirmation-required';
  requiredForEmail: boolean;
  detail: string;
}

export interface SidneyIntakeAssessment {
  schema: 'permitly-sidney-intake-assessment/v1';
  edition: typeof SIDNEY_INTAKE_EDITION;
  sourceUrl: typeof SIDNEY_INTAKE_SOURCE_URL;
  buildingPermitPageUrl: typeof SIDNEY_BUILDING_PERMIT_PAGE_URL;
  items: SidneyIntakeItem[];
  unresolvedConditionalItems: string[];
}

export function assessSidneyMunicipalIntake(input: {
  application: SidneyApplicationData;
  evidence: VerificationEvidence[];
  designFingerprint: string;
  drawingSheetCount: number;
  professionalReviewAccepted: boolean;
  lotCoverageIncluded: boolean;
}): SidneyIntakeAssessment {
  const currentEvidence = input.evidence.filter((item) => item.designFingerprint === input.designFingerprint);
  const has = (gateId: string, kinds: VerificationEvidence['kind'][]) => currentEvidence.some((item) => item.gateId === gateId && kinds.includes(item.kind));
  const applicantName = input.application.applicantName.trim();
  const applicantIsOwner = !applicantName || normalize(applicantName) === normalize(input.application.ownerName);
  const signed = has('signed-application', ['application-checklist']);
  const ownerAuthorization = has('owner-authorization', ['owner-authorization']);
  const landTitle = has('land-title-search', ['land-title-search']);
  const firePlan = has('construction-fire-safety-plan', ['construction-fire-safety-plan'])
    || has('construction-fire-safety-plan', ['municipal-confirmation']);

  const items: SidneyIntakeItem[] = [
    item('signed-application', 'Completed application form and checklist', signed ? 'attached' : 'outstanding', true, signed ? 'The owner-signed official form is attached to this exact drawing fingerprint.' : 'Attach the signed April 2026 Town application and checklist.'),
    item('owner-authorization', 'Owner authorization / appointment of agent', applicantIsOwner ? 'not-applicable' : ownerAuthorization ? 'attached' : 'outstanding', !applicantIsOwner, applicantIsOwner ? 'The owner is the applicant.' : ownerAuthorization ? 'Owner authorization is attached for the named applicant.' : 'The applicant differs from the owner; attach the Town owner-authorization form.'),
    item('land-title-search', 'Land title search and registered charges', landTitle ? 'attached' : input.application.authorizeTownTitleSearch ? 'town-search-authorized' : 'outstanding', true, landTitle ? 'A title-search record is attached to this fingerprint.' : input.application.authorizeTownTitleSearch ? 'The official form authorizes the Town to obtain the title search and registered charges for the stated municipal fees.' : 'Attach a title search completed within 30 days, or authorize the Town search on the official form.'),
    item('digital-drawings', 'Digital permit drawings', input.drawingSheetCount > 0 ? 'included' : 'outstanding', true, input.drawingSheetCount > 0 ? `${input.drawingSheetCount} coordinated drawing sheets are included.` : 'Include site plan, floor/deck plan, elevations, and building section.'),
    item('professional-engineering', 'Professional engineering', input.professionalReviewAccepted ? 'attached' : 'outstanding', true, input.professionalReviewAccepted ? 'The exact-fingerprint structural review and work-package resolutions are attached.' : 'Attach the accepted professional structural review and resolved design controls.'),
    item('construction-fire-safety-plan', 'Construction fire safety plan', firePlan ? 'attached' : 'outstanding', true, firePlan ? 'A fire safety plan or Town confirmation that it is not required is attached.' : 'The Town says most permit applications now require this plan. Attach the plan or written Town confirmation that it is not required.'),
    item('lot-coverage', 'Lot and parking-area coverage', input.lotCoverageIncluded ? 'included' : 'outstanding', true, input.lotCoverageIncluded ? 'The controlled site plan includes modeled lot-coverage calculations.' : 'Add lot-coverage calculations to the site plan; parking-area requirements remain subject to Town review.'),
  ];

  return {
    schema: 'permitly-sidney-intake-assessment/v1',
    edition: SIDNEY_INTAKE_EDITION,
    sourceUrl: SIDNEY_INTAKE_SOURCE_URL,
    buildingPermitPageUrl: SIDNEY_BUILDING_PERMIT_PAGE_URL,
    items,
    unresolvedConditionalItems: [
      'Development Permit / Development Variance Permit conditions',
      'Site servicing plan or Environmentally Sensitive Area requirements',
      'Flood construction level report below 5.0 m geodetic elevation',
      'Protected trees, archaeology, contaminated-sites, right-of-way, and hazardous-material requirements',
      'Storm-water management plan and covenant if impermeable area increases',
    ],
  };
}

function item(id: string, label: string, status: SidneyIntakeItem['status'], requiredForEmail: boolean, detail: string): SidneyIntakeItem {
  return { id, label, status, requiredForEmail, detail };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}
