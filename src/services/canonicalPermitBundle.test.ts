import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { addPlatform, createEmptyDesign, rectangularBoundary, setPlatformFramingIntent } from '../domain/deckDesign';
import { generateFramingDesign } from '../domain/framingDesign';
import { createSiteModel, updateSiteModel } from '../domain/siteModel';
import type { Property, SidneyApplicationData, SubmissionReadiness, VerificationEvidence } from '../types';
import { buildCanonicalReviewIssue } from './canonicalReviewIssue';
import { buildCanonicalPermitBundle, collectCaptureEntries, collectProfessionalEntries } from './canonicalPermitBundle';
import { sha256Blob } from './fileDigest';

const property: Property = {
  address: { fullAddress: '2423 Lovell Ave, Sidney, BC', civicNumber: '2423', streetName: 'Lovell', streetType: 'Ave', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: 'V8L 2P3', coordinates: [-123.4, 48.6], score: 99 },
  parcel: { pid: '000-111-222', pidRaw: '000111222', parcelName: 'Lot 1', planNumber: 'VIP1', municipality: 'Town of Sidney', ownerType: '', parcelClass: '', areaSqm: 500, polygon: [], center: [-123.4, 48.6] },
  zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [],
};
const application: SidneyApplicationData = { civicAddress: property.address!.fullAddress, ownerName: 'Owner', ownerCompany: '', ownerAddress: '2423 Lovell Ave', ownerCityProvince: 'Sidney, BC', ownerPostalCode: 'V8L 2P3', ownerPhone: '250-555-0100', ownerEmail: 'owner@example.com', applicantName: '', applicantCompany: '', applicantBusinessLicence: '', applicantAddress: '', applicantCityProvince: '', applicantPostalCode: '', applicantPhone: '', applicantEmail: '', projectDescription: 'Construct a new residential deck and stairs.', constructionValue: '25000', existingFloorAreaSqm: '', deckAreaSqm: '12' };
const readiness: SubmissionReadiness = { status: 'review-package', confirmedCount: 2, requiredCount: 6, summary: 'Review package only.', gates: [{ id: 'professional-review', label: 'Professional review', status: 'required', responsibleParty: 'engineer', detail: 'Required.' }] };

function fixture() {
  let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
  design = setPlatformFramingIntent(design, 'P1', { supportStrategy: 'ledger' });
  const site = updateSiteModel(createSiteModel(property), { status: 'field-input-unverified', measuredBy: 'Owner' }, { selectionStatus: 'field-measured', lengthMm: 4000 });
  const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T12:00:00.000Z');
  return buildCanonicalReviewIssue({ property, site, design, framing, revision: 2, issuedAt: '2026-07-18T12:05:00.000Z' });
}

describe('canonical permit bundle', () => {
  it('creates an exact, indexed archive from one canonical issue', async () => {
    const issue = fixture();
    const artifact = await buildCanonicalPermitBundle({ issue, property, application, readiness, evidence: [], reviewCycles: [] }, {
      buildDrawingPdf: async (actualProperty) => { expect(actualProperty).toBe(property); return new Blob(['drawing-pdf'], { type: 'application/pdf' }); },
      buildCalculationPdf: async () => new Blob(['calculation-pdf'], { type: 'application/pdf' }),
      buildApplicationPdf: async () => new TextEncoder().encode('application-pdf'),
      loadCapture: async () => null,
      loadEvidence: async () => null,
    });
    const archive = unzipSync(new Uint8Array(await artifact.blob.arrayBuffer()));
    expect(artifact.kind).toBe('professional-review');
    expect(artifact.designFingerprint).toBe(issue.manifest.designFingerprint);
    expect(artifact.fileNames).toHaveLength(9);
    expect(artifact.fileNames).toContain(`02-drawings/layered-cad-${issue.manifest.designFingerprint}.dxf`);
    const indexName = artifact.fileNames.find((name) => name.includes('package-index'))!;
    const index = JSON.parse(strFromU8(archive[indexName]));
    expect(index).toMatchObject({ schema: 'permitly-canonical-package-index/v1', designFingerprint: issue.manifest.designFingerprint, packageKind: 'review-package' });
    expect(index.files).toHaveLength(8);
  });

  it('rejects missing or tampered local evidence and separates stale revision evidence', async () => {
    const blob = new Blob(['sealed'], { type: 'application/pdf' });
    const sha256 = await sha256Blob(blob);
    const evidence: VerificationEvidence = { id: 'e1', gateId: 'structural-review', kind: 'sealed-structural-review', fileName: 'sealed review.pdf', mimeType: blob.type, byteSize: blob.size, sha256, issuerName: 'Engineer', issuerRole: 'engineer', designFingerprint: 'DP-OLD0000', recordedAt: '2026-07-18T12:00:00.000Z', status: 'recorded-unverified' };
    await expect(collectProfessionalEntries([evidence], 'DP-NEW0000', async () => null)).rejects.toThrow('missing');
    await expect(collectProfessionalEntries([evidence], 'DP-NEW0000', async () => ({ id: evidence.id, blob: new Blob(['changed'], { type: 'application/pdf' }), fileName: evidence.fileName, mimeType: evidence.mimeType, byteSize: evidence.byteSize }))).rejects.toThrow('integrity');
    const entries = await collectProfessionalEntries([evidence], 'DP-NEW0000', async () => ({ id: evidence.id, blob, fileName: evidence.fileName, mimeType: evidence.mimeType, byteSize: evidence.byteSize }));
    expect(Object.keys(entries)[0]).toMatch(/^05-stale-evidence\//);
  });

  it('requires the exact stored capture bytes', async () => {
    const blob = new Blob(['photo'], { type: 'image/jpeg' });
    const sha256 = await sha256Blob(blob);
    const record = { id: 'c1', category: 'house-overview' as const, fileName: 'house.jpg', mimeType: blob.type, byteSize: blob.size, sha256, capturedAt: '2026-07-18T12:00:00.000Z', recordedAt: '2026-07-18T12:00:00.000Z', label: 'House', notes: '', status: 'homeowner-confirmed' as const };
    const entries = await collectCaptureEntries([record], async () => ({ id: record.id, blob, fileName: record.fileName, mimeType: record.mimeType, byteSize: record.byteSize }));
    expect(Object.keys(entries)[0]).toContain('site-capture-house-overview');
  });
});
