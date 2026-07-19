import { describe, expect, it } from 'vitest';
import { addPlatform, createEmptyDesign, rectangularBoundary } from '../domain/deckDesign';
import { generateFramingDesign } from '../domain/framingDesign';
import { addCaptureEvidence, createSiteModel, updateSiteModel } from '../domain/siteModel';
import { emptyBuilderShareConsent, emptySidneyApplication, type HomeownerIntent } from '../state/homeownerProjectStore';
import type { Property, VerificationEvidence } from '../types';
import { buildCanonicalBuilderBrief, serializeCanonicalBuilderBrief } from './canonicalBuilderBrief';

const property: Property = {
  address: { fullAddress: '2423 Lovell Ave, Sidney, BC', civicNumber: '2423', streetName: 'Lovell', streetType: 'Ave', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: 'V8L 0A1', coordinates: [-123.4, 48.6], score: 99 },
  parcel: { pid: '007-952-449', pidRaw: '007952449', parcelName: 'Lot 1', planNumber: 'VIP1', municipality: 'Town of Sidney', ownerType: '', parcelClass: '', areaSqm: 465, polygon: [], center: [-123.4, 48.6], legalDescription: 'LOT 1 PLAN VIP1' },
  zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [{ id: 'municipal-parcel', label: 'Town parcel layer', url: 'https://example.test/parcel', authority: 'municipal', retrievedAt: '2026-07-18T00:00:00.000Z', status: 'authoritative' }],
};
const intent: HomeownerIntent = { uses: ['Dining'], materialPreference: 'composite', desiredFeatures: ['Stairs'], budgetRange: '30k-60k', inspirationNotes: 'Room for six.' };
const evidence: VerificationEvidence = { id: 'review-1', gateId: 'professional-review', kind: 'sealed-structural-review', fileName: 'sealed.pdf', mimeType: 'application/pdf', byteSize: 4000, sha256: 'a'.repeat(64), issuerName: 'A. Engineer', issuerRole: 'engineer', licenseNumber: '12345', decision: 'accepted', designFingerprint: undefined, recordedAt: '2026-07-18T12:00:00.000Z', status: 'recorded-unverified' };

function fixture() {
  const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
  let site = updateSiteModel(createSiteModel(property), { status: 'field-input-unverified', measuredBy: 'Owner' }, { selectionStatus: 'field-measured', lengthMm: 4000 });
  site = { ...site, capture: addCaptureEvidence(site.capture, { id: 'photo-1', category: 'house-overview', label: 'private-house-photo', fileName: 'private-house-photo.jpg', mimeType: 'image/jpeg', byteSize: 1234, sha256: 'b'.repeat(64), recordedAt: '2026-07-18T10:00:00.000Z', status: 'homeowner-confirmed', notes: 'Rear wall visible.', viewpoint: 'Rear yard to house', observationTags: ['house-context'] }) };
  const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T11:00:00.000Z');
  const application = { ...emptySidneyApplication, ownerName: 'Home Owner', ownerEmail: 'owner@example.test', ownerPhone: '250-555-0100' };
  return { design, site, framing, application };
}

describe('canonical builder brief', () => {
  it('fails closed while privacy scopes are selected but consent is not recorded', () => {
    const { design, site, framing, application } = fixture();
    const consent = { ...emptyBuilderShareConsent, shareExactAddress: true, shareContactDetails: true, sharePhotoEvidence: true, confirmed: false, recordedAt: null };
    const brief = buildCanonicalBuilderBrief({ property, site, design, framing, intent, consent, application, reviewPublication: null, reviewIssueRevision: 2, reviewCycles: [], verificationEvidence: [evidence], permitSubmissionHistory: [], generatedAt: '2026-07-18T13:00:00.000Z' });
    const json = serializeCanonicalBuilderBrief(brief);
    expect(brief.status).toBe('draft-private-preview');
    expect(brief.project).not.toHaveProperty('exactProperty');
    expect(brief.project).not.toHaveProperty('homeownerContact');
    expect(brief).not.toHaveProperty('drawings');
    expect(brief.site).not.toHaveProperty('photoEvidence');
    expect(brief.permit).not.toHaveProperty('professionalRecords');
    expect(json).not.toContain('2423 Lovell');
    expect(json).not.toContain('owner@example.test');
    expect(json).not.toContain('private-house-photo');
  });

  it('creates a revision-bound, consented handoff with transparent estimate and scoped evidence', () => {
    const { design, site, framing, application } = fixture();
    const draft = buildCanonicalBuilderBrief({ property, site, design, framing, intent, consent: emptyBuilderShareConsent, application, reviewPublication: null, reviewIssueRevision: 2, reviewCycles: [], verificationEvidence: [evidence], permitSubmissionHistory: [], generatedAt: '2026-07-18T13:00:00.000Z' });
    const consent = { ...emptyBuilderShareConsent, shareExactAddress: true, shareContactDetails: true, sharePhotoEvidence: true, confirmed: true, recordedAt: '2026-07-18T12:55:00.000Z', designFingerprint: draft.designFingerprint };
    const brief = buildCanonicalBuilderBrief({ property, site, design, framing, intent, consent, application, reviewPublication: null, reviewIssueRevision: 2, reviewCycles: [], verificationEvidence: [evidence], permitSubmissionHistory: [], generatedAt: '2026-07-18T13:00:00.000Z' });
    expect(brief).toMatchObject({ schema: 'permitly-canonical-builder-brief/v1', status: 'homeowner-approved', revision: 2, designFingerprint: expect.stringMatching(/^DP-[A-F0-9]{8}$/), project: { exactProperty: { address: property.address?.fullAddress, pid: property.parcel?.pid }, homeownerContact: { name: 'Home Owner' } }, estimate: { pricingMode: 'regional-allowance-not-live', confidence: 'concept' }, drawings: { units: 'mm', issuePurpose: 'professional-review' } });
    expect(brief.drawings?.sheetCount).toBeGreaterThan(10);
    expect(brief.site.photoEvidence?.[0]).toMatchObject({ label: 'private-house-photo', sha256: 'b'.repeat(64) });
    expect(brief.permit.professionalRecords?.[0]).toMatchObject({ issuerName: 'A. Engineer', licenseNumber: '12345' });
    expect(serializeCanonicalBuilderBrief(brief)).not.toContain('data:image');
    expect(brief.limitations).toContain('Source photo bytes are never embedded in this JSON brief; they require a separate explicitly assembled evidence package.');
  });

  it('rejects consent recorded for another design fingerprint', () => {
    const { design, site, framing, application } = fixture();
    const consent = { ...emptyBuilderShareConsent, shareExactAddress: true, confirmed: true, recordedAt: '2026-07-18T12:55:00.000Z', designFingerprint: 'DP-00000000' };
    const brief = buildCanonicalBuilderBrief({ property, site, design, framing, intent, consent, application, reviewPublication: null, reviewIssueRevision: 2, reviewCycles: [], verificationEvidence: [], permitSubmissionHistory: [], generatedAt: '2026-07-18T13:00:00.000Z' });
    expect(brief.status).toBe('draft-private-preview');
    expect(brief.project).not.toHaveProperty('exactProperty');
  });
});
