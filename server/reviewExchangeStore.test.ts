import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReviewExchangeError, ReviewExchangeStore } from './reviewExchangeStore.mjs';

const fingerprint = 'DP-ABCDEF12';
const reviewScope = { discipline: 'structural', responsibleProfessional: 'engineer', acceptanceRequires: ['sealed-pdf', 'egbc-directory-confirmation', 'permit-to-practice', 'complete-work-package-resolutions'] };
const architecturalReviewScope = { discipline: 'architectural', responsibleProfessional: 'architect', acceptanceRequires: ['sealed-pdf', 'aibc-directory-confirmation', 'certificate-of-practice-firm'], permitRequirement: 'optional-coordination-unless-required-by-authority' };
const reviewPackage = {
  reviewScope,
  manifest: { designFingerprint: fingerprint }, property: { address: '2423 Lovell Ave' }, deck: { area: 12 },
  planset: [{ id: 'cover', title: 'Cover', scale: 'NTS', svg: '<svg><text>Review package</text></svg>' }], report: { checks: [] },
};
const pdf = Buffer.from('%PDF-1.4\nreview\n%%EOF');
const review = {
  id: 'evidence-1', gateId: 'structural-review', kind: 'sealed-structural-review', fileName: 'sealed.pdf', mimeType: 'application/pdf', byteSize: pdf.length,
  pdfBase64: pdf.toString('base64'), sha256: createHash('sha256').update(pdf).digest('hex'), issuerName: 'Test Engineer', issuerRole: 'engineer', professionalDiscipline: 'structural', licenseNumber: '12345', firmName: 'Test Engineering Ltd.', permitToPracticeNumber: '1000123',
  decision: 'accepted', designFingerprint: fingerprint, professionalRegistry: 'egbc', registryUrl: 'https://www.egbc.ca/registrant-directory', registryCheckedAt: new Date().toISOString(), registryStatus: 'directory-confirmed-by-user', recordedAt: new Date().toISOString(), status: 'recorded-unverified', structuralResolutions: [],
};
const architecturalReview = {
  ...review,
  id: 'architectural-evidence-1', gateId: 'architectural-review', kind: 'sealed-architectural-review', issuerName: 'Test Architect', issuerRole: 'architect', professionalDiscipline: 'architectural', licenseNumber: 'AIBC-12345', firmName: 'Test Architecture Inc.', permitToPracticeNumber: undefined,
  practiceAuthorization: 'aibc-certificate-of-practice-confirmed-by-user', professionalRegistry: 'aibc', registryUrl: 'https://aibc.ca/resources/online-directory-test/', structuralResolutions: [],
};

describe('ReviewExchangeStore', () => {
  it('enforces separate capabilities and survives a new repository instance', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deck-review-'));
    const store = new ReviewExchangeStore(directory);
    const created = await store.create(reviewPackage);
    expect(created.ownerToken).not.toBe(created.reviewerToken);
    await expect(store.getForReviewer(created.id, created.ownerToken)).rejects.toMatchObject({ status: 401 });
    expect((await store.getForReviewer(created.id, created.reviewerToken)).reviewPackage.manifest.designFingerprint).toBe(fingerprint);
    await store.submitReview(created.id, created.reviewerToken, review);
    const restarted = new ReviewExchangeStore(directory);
    const result = await restarted.getForOwner(created.id, created.ownerToken);
    expect(result.review.decision).toBe('accepted');
    expect(result.review.pdfBase64).toBe(review.pdfBase64);
    const storedText = await readFile(join(directory, `${created.id}.json`), 'utf8');
    expect(storedText).not.toContain(created.ownerToken);
    expect(storedText).not.toContain(created.reviewerToken);
  });

  it('rejects a review for a different design revision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deck-review-'));
    const store = new ReviewExchangeStore(directory);
    const created = await store.create(reviewPackage);
    await expect(store.submitReview(created.id, created.reviewerToken, { ...review, designFingerprint: 'DP-00000000' }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 409, code: 'revision-mismatch' }));
  });

  it('rejects architectural or unaffiliated acceptance at the structural engineer gate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deck-review-'));
    const store = new ReviewExchangeStore(directory);
    const created = await store.create(reviewPackage);
    await expect(store.submitReview(created.id, created.reviewerToken, { ...review, issuerRole: 'architect', professionalDiscipline: 'architectural', professionalRegistry: 'aibc', registryUrl: 'https://aibc.ca/resources/online-directory-test/' }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-professional-scope' }));
    await expect(store.submitReview(created.id, created.reviewerToken, { ...review, permitToPracticeNumber: '' }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-permit-to-practice' }));
  });

  it('records an independent Architect AIBC sealed coordination review without granting structural authority', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deck-review-'));
    const store = new ReviewExchangeStore(directory);
    const created = await store.create({ ...reviewPackage, reviewScope: architecturalReviewScope });
    const result = await store.submitReview(created.id, created.reviewerToken, architecturalReview);
    expect(result).toMatchObject({ issuerRole: 'architect', professionalDiscipline: 'architectural', kind: 'sealed-architectural-review', firmName: 'Test Architecture Inc.' });
    await expect(store.submitReview(created.id, created.reviewerToken, { ...architecturalReview, issuerRole: 'engineer', professionalDiscipline: 'structural', professionalRegistry: 'egbc', registryUrl: 'https://www.egbc.ca/registrant-directory' }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-professional-scope' }));
    await expect(store.submitReview(created.id, created.reviewerToken, { ...architecturalReview, practiceAuthorization: undefined }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-certificate-of-practice' }));
    await expect(store.submitReview(created.id, created.reviewerToken, { ...architecturalReview, structuralResolutions: [{ id: 'not-allowed' }] }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'unexpected-structural-resolutions' }));
  });

  it('accepts only a bounded CAD exchange tied to the published fingerprint', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deck-review-'));
    const store = new ReviewExchangeStore(directory);
    const cadExchange = {
      schema: 'permitly-project-cad-exchange/v1', units: 'mm', coordinateSystem: 'local-house-wall', designFingerprint: fingerprint,
      generatedAt: new Date().toISOString(), notForConstruction: true, layers: [{ id: 'A-DECK-EDGE', entityCount: 4 }], entityCounts: {}, warnings: [],
      dxf: `0\r\nSECTION\r\n2\r\nHEADER\r\n${'9\r\n$INSUNITS\r\n70\r\n4\r\n'.repeat(4)}0\r\nENDSEC\r\n0\r\nEOF\r\n`,
    };
    const created = await store.create({ ...reviewPackage, cadExchange });
    expect((await store.getForReviewer(created.id, created.reviewerToken)).reviewPackage.cadExchange.designFingerprint).toBe(fingerprint);
    await expect(store.create({ ...reviewPackage, cadExchange: { ...cadExchange, designFingerprint: 'DP-00000000' } }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 409, code: 'cad-revision-mismatch' }));
    await expect(store.create({ ...reviewPackage, cadExchange: { ...cadExchange, dxf: 'not dxf' } }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-cad-payload' }));
  });

  it('accepts only a bounded calculation report tied to the published fingerprint', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deck-review-'));
    const store = new ReviewExchangeStore(directory);
    const calculationReport = {
      schema: 'permitly-canonical-calculation-report/v2', designFingerprint: fingerprint, generatedAt: new Date().toISOString(), revision: 2,
      issuePurpose: 'professional-review', status: 'engineering-required', notForConstruction: true,
      project: { address: '2423 Lovell Ave', pid: 'PID', municipality: 'Sidney', codeProfile: 'BCBC 2024' },
      designBasis: { deadLoadKpa: 0.5, liveLoadKpa: 1.9, snowLoadKpa: 1, governingAreaLoadKpa: 1.9, assumedSoilBearingKpa: 75, lumber: 'SPF No. 2', treatment: 'exterior' },
      platformSystems: [{ platformId: 'P1' }],
      joistGroups: [{ spacingMm: 400, governingSpanMm: 3000, lineLoadKnM: 0.76, momentDemandKnM: 0.855, shearDemandKn: 1.14 }],
      beams: [{ lengthMm: 4000, tributaryWidthMm: 1500, lineLoadKnM: 2.85, governingBayMm: 1800, momentDemandKnM: 1.154, shearDemandKn: 2.565, governingPostReactionKn: 5.13 }], postFootingChecks: [{ platformId: 'P1', reactionKn: 4, requiredBearingAreaSqM: 0.053, providedBearingAreaSqM: 0.16, bearingPressureKpa: 25, footingDepth: 'unresolved', status: 'review-required' }],
      stairs: [], connections: [{ id: 'C-P1-B1', status: 'design-required' }], checks: [{}], reviewGates: [], sources: [{}], limitations: ['Not for construction.'],
    };
    const created = await store.create({ ...reviewPackage, calculationReport });
    expect((await store.getForReviewer(created.id, created.reviewerToken)).reviewPackage.calculationReport.designFingerprint).toBe(fingerprint);
    await expect(store.submitReview(created.id, created.reviewerToken, review))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'unresolved-structural-work-packages' }));
    const structuredResolution = (id: string, workPackageId: string, kind: string) => ({ schema: 'permitly-professional-work-resolution/v1', id, designFingerprint: fingerprint, workPackageId, kind, disposition: 'specified', specification: 'Professionally selected assembly', capacityBasis: 'Sealed calculation section 4', documentReference: 'SK-01 / Calc 4', notes: '', recordedAt: new Date().toISOString() });
    const structuralResolutions = [structuredResolution('resolution_sys_p1', 'SYS:P1', 'platform-system'), structuredResolution('resolution_fnd_p1', 'FND:P1', 'foundation-system'), structuredResolution('resolution_conn_p1', 'C-P1-B1', 'connection')];
    expect((await store.submitReview(created.id, created.reviewerToken, { ...review, structuralResolutions })).structuralResolutions).toHaveLength(3);
    await expect(store.create({ ...reviewPackage, calculationReport: { ...calculationReport, schema: 'permitly-canonical-calculation-report/v1' } }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-calculation-report' }));
    await expect(store.create({ ...reviewPackage, calculationReport: { ...calculationReport, designFingerprint: 'DP-00000000' } }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 409, code: 'calculation-revision-mismatch' }));
    await expect(store.create({ ...reviewPackage, calculationReport: { ...calculationReport, joistGroups: [{ spacingMm: -1 }] } }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-calculation-demand' }));
    await expect(store.create({ ...reviewPackage, calculationReport: { ...calculationReport, beams: [{ lengthMm: -1 }] } }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-calculation-beam-demand' }));
  });

  it('requires sheet-specific redlines for a change request and validates their revision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deck-review-'));
    const store = new ReviewExchangeStore(directory);
    const created = await store.create(reviewPackage);
    await expect(store.submitReview(created.id, created.reviewerToken, { ...review, decision: 'changes-requested', redlines: [] }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'missing-required-redline' }));
    const redline = { id: 'redline_12345678', designFingerprint: fingerprint, sheetId: 'cover', category: 'structure', severity: 'required', title: 'Ledger connection', comment: 'Specify fastener spacing and verified rim substrate.', anchor: { xPercent: 50, yPercent: 40 }, createdAt: new Date().toISOString() };
    expect((await store.submitReview(created.id, created.reviewerToken, { ...review, decision: 'changes-requested', redlines: [redline] })).redlines).toEqual([redline]);
    await expect(store.submitReview(created.id, created.reviewerToken, { ...review, decision: 'changes-requested', redlines: [{ ...redline, designFingerprint: 'DP-00000000' }] }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 409, code: 'redline-revision-mismatch' }));
  });
});
