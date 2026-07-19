import { describe, expect, it } from 'vitest';
import type { SidneyApplicationData, VerificationEvidence } from '../types';
import { assessSidneyMunicipalIntake } from './sidneyMunicipalIntake';

const application = { civicAddress: '12 Test St', ownerName: 'Owner', ownerCompany: '', ownerAddress: '12 Test St', ownerCityProvince: 'Sidney, BC', ownerPostalCode: 'V8L 1A1', ownerPhone: '250-555-0100', ownerEmail: 'owner@example.com', applicantName: '', applicantCompany: '', applicantBusinessLicence: '', applicantAddress: '', applicantCityProvince: '', applicantPostalCode: '', applicantPhone: '', applicantEmail: '', projectDescription: 'New deck', constructionValue: '25000', existingFloorAreaSqm: '', deckAreaSqm: '20', authorizeTownTitleSearch: false } satisfies SidneyApplicationData;
const fingerprint = 'DP-ABCDEF12';
const record = (gateId: string, kind: VerificationEvidence['kind']): VerificationEvidence => ({ id: `${gateId}-1`, gateId, kind, fileName: `${gateId}.pdf`, mimeType: 'application/pdf', byteSize: 100, sha256: 'a'.repeat(64), issuerName: 'Owner', issuerRole: 'owner', designFingerprint: fingerprint, recordedAt: '2026-07-18T12:00:00.000Z', status: 'recorded-unverified' });

describe('Town of Sidney municipal intake assessment', () => {
  it('fails closed on title, fire plan, signature, and professional review', () => {
    const assessment = assessSidneyMunicipalIntake({ application, evidence: [], designFingerprint: fingerprint, drawingSheetCount: 20, professionalReviewAccepted: false, lotCoverageIncluded: true });
    expect(assessment.items.filter((item) => item.status === 'outstanding').map((item) => item.id)).toEqual(['signed-application', 'land-title-search', 'professional-engineering', 'construction-fire-safety-plan']);
    expect(assessment.unresolvedConditionalItems).toContain('Storm-water management plan and covenant if impermeable area increases');
  });

  it('accepts the Town title-search election and requires separate authorization for a different applicant', () => {
    const assessment = assessSidneyMunicipalIntake({ application: { ...application, applicantName: 'Deck Builder', authorizeTownTitleSearch: true }, evidence: [record('signed-application', 'application-checklist'), record('construction-fire-safety-plan', 'construction-fire-safety-plan')], designFingerprint: fingerprint, drawingSheetCount: 20, professionalReviewAccepted: true, lotCoverageIncluded: true });
    expect(assessment.items.find((item) => item.id === 'land-title-search')?.status).toBe('town-search-authorized');
    expect(assessment.items.find((item) => item.id === 'owner-authorization')?.status).toBe('outstanding');
  });
});
