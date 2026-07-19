import { describe, expect, it } from 'vitest';
import type { CanonicalReviewIssue } from './canonicalReviewIssue';
import type { SidneyApplicationData } from '../types';
import { evaluateCanonicalPermitReadiness } from './canonicalPermitReadiness';

const application = { civicAddress: '12 Test St', ownerName: 'Owner', ownerCompany: '', ownerAddress: '12 Test St', ownerCityProvince: 'Sidney, BC', ownerPostalCode: 'V8L 1A1', ownerPhone: '250-555-0100', ownerEmail: 'owner@example.com', applicantName: '', applicantCompany: '', applicantBusinessLicence: '', applicantAddress: '', applicantCityProvince: '', applicantPostalCode: '', applicantPhone: '', applicantEmail: '', projectDescription: 'New residential deck', constructionValue: '25000', existingFloorAreaSqm: '', deckAreaSqm: '12' } satisfies SidneyApplicationData;
const fingerprint = 'DP-ABCDEF12';
const issue = { manifest: { designFingerprint: fingerprint }, reviewPackage: { deck: { canonical: { site: { designWall: { selectionStatus: 'field-measured', openings: [] }, capture: { schema: 'existing-condition-capture/v1', evidence: [{ id: 'a', category: 'house-overview', status: 'homeowner-confirmed' }, { id: 'b', category: 'design-wall', status: 'homeowner-confirmed' }, { id: 'c', category: 'grade-context', status: 'homeowner-confirmed' }] } } } }, calculationReport: { designFingerprint: fingerprint, siteCompliance: { schema: 'site-compliance/v2', scope: 'modeled-platform-stair-landing-and-footing-extents', setbackStatus: 'reference-pass', coverage: { status: 'reference-within-limit' } }, platformSystems: [{ platformId: 'P1', name: 'Deck', joistDesignSpanMm: 3000 }], joistGroups: [], beams: [], postFootingChecks: [], stairs: [], connections: [] } } } as unknown as CanonicalReviewIssue;

describe('canonical permit readiness', () => {
  it('fails closed until property, professional, application, and signed-document gates all match the revision', () => {
    const incomplete = evaluateCanonicalPermitReadiness({ issue, property: { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] }, application, evidence: [], reviewCycles: [] });
    expect(incomplete.status).toBe('review-package');
    expect(incomplete.gates.filter((gate) => gate.status === 'required').map((gate) => gate.id)).toEqual(['parcel', 'zoning', 'property-offsets', 'professional-review', 'signed-application']);
  });

  it('reports ready only when the accepted review resolves the exact work-package set and the signed application matches', () => {
    const property = { address: null, parcel: { pid: '001' }, zoning: { zone: 'R2' }, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] } as never;
    const structuralResolutions = [{ schema: 'permitly-professional-work-resolution/v1', id: 'resolution-001', designFingerprint: fingerprint, workPackageId: 'SYS:P1', kind: 'platform-system', disposition: 'specified', specification: '2x10 No.2 S-P-F joists and engineered beam schedule', capacityBasis: 'Sealed calculation SC-1 and referenced CWC tables', documentReference: 'SC-1 / S2.0', notes: '', recordedAt: '2026-07-18T12:00:00.000Z' }];
    const reviewCycles = [{ sourceDesignFingerprint: fingerprint, decision: 'accepted', issuerRole: 'engineer', professionalDiscipline: 'structural', firmName: 'Test Engineering Ltd.', permitToPracticeNumber: '1000123', structuralResolutions }];
    const evidence = [{ kind: 'sealed-structural-review', decision: 'accepted', designFingerprint: fingerprint, issuerRole: 'engineer', professionalDiscipline: 'structural', professionalRegistry: 'egbc', registryStatus: 'directory-confirmed-by-user', firmName: 'Test Engineering Ltd.', permitToPracticeNumber: '1000123' }, { kind: 'field-report', gateId: 'property-offsets', designFingerprint: fingerprint }, { kind: 'application-checklist', gateId: 'signed-application', designFingerprint: fingerprint }];
    const ready = evaluateCanonicalPermitReadiness({ issue, property, application, evidence: evidence as never, reviewCycles: reviewCycles as never });
    expect(ready).toMatchObject({ status: 'ready-to-submit', confirmedCount: 7, requiredCount: 7 });
  });

  it('does not let an architectural acceptance satisfy the structural engineering gate', () => {
    const property = { address: null, parcel: { pid: '001' }, zoning: { zone: 'R2' }, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] } as never;
    const structuralResolutions = [{ schema: 'permitly-professional-work-resolution/v1', id: 'resolution-001', designFingerprint: fingerprint, workPackageId: 'SYS:P1', kind: 'platform-system', disposition: 'specified', specification: 'Architect-selected member note', capacityBasis: 'Architectural drawing note', documentReference: 'A2.0', notes: '', recordedAt: '2026-07-18T12:00:00.000Z' }];
    const reviewCycles = [{ sourceDesignFingerprint: fingerprint, decision: 'accepted', issuerRole: 'architect', professionalDiscipline: 'architectural', firmName: 'Test Architecture Inc.', permitToPracticeNumber: 'N/A', structuralResolutions }];
    const evidence = [{ kind: 'sealed-structural-review', decision: 'accepted', designFingerprint: fingerprint, issuerRole: 'architect', professionalDiscipline: 'architectural', professionalRegistry: 'aibc', registryStatus: 'directory-confirmed-by-user', firmName: 'Test Architecture Inc.', permitToPracticeNumber: 'N/A' }];
    const readiness = evaluateCanonicalPermitReadiness({ issue, property, application, evidence: evidence as never, reviewCycles: reviewCycles as never });
    expect(readiness.gates.find((gate) => gate.id === 'professional-review')).toMatchObject({ status: 'required', responsibleParty: 'engineer' });
  });
});
