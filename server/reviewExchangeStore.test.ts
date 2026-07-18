import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReviewExchangeError, ReviewExchangeStore } from './reviewExchangeStore.mjs';

const fingerprint = 'DP-ABCDEF12';
const reviewPackage = {
  manifest: { designFingerprint: fingerprint }, property: { address: '2423 Lovell Ave' }, deck: { area: 12 },
  planset: [{ id: 'cover', title: 'Cover', scale: 'NTS', svg: '<svg><text>Review package</text></svg>' }], report: { checks: [] },
};
const pdf = Buffer.from('%PDF-1.4\nreview\n%%EOF');
const review = {
  id: 'evidence-1', gateId: 'structural-review', kind: 'sealed-structural-review', fileName: 'sealed.pdf', mimeType: 'application/pdf', byteSize: pdf.length,
  pdfBase64: pdf.toString('base64'), sha256: createHash('sha256').update(pdf).digest('hex'), issuerName: 'Test Engineer', issuerRole: 'engineer', licenseNumber: '12345',
  decision: 'accepted', designFingerprint: fingerprint, professionalRegistry: 'egbc', registryUrl: 'https://www.egbc.ca/registrant-directory', registryCheckedAt: new Date().toISOString(), registryStatus: 'directory-confirmed-by-user', recordedAt: new Date().toISOString(), status: 'recorded-unverified',
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

  it('accepts only a bounded CAD exchange tied to the published fingerprint', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deck-review-'));
    const store = new ReviewExchangeStore(directory);
    const cadExchange = {
      schema: 'permitly-project-cad-exchange/v1', units: 'mm', coordinateSystem: 'local-house-wall', designFingerprint: fingerprint,
      generatedAt: new Date().toISOString(), notForConstruction: true, layers: [{ id: 'A-DECK-EDGE', entityCount: 4 }], entityCounts: {}, warnings: [],
      dxf: `0\nSECTION\n2\nHEADER\n${'9\n$INSUNITS\n70\n4\n'.repeat(4)}0\nENDSEC\n0\nEOF\n`,
    };
    const created = await store.create({ ...reviewPackage, cadExchange });
    expect((await store.getForReviewer(created.id, created.reviewerToken)).reviewPackage.cadExchange.designFingerprint).toBe(fingerprint);
    await expect(store.create({ ...reviewPackage, cadExchange: { ...cadExchange, designFingerprint: 'DP-00000000' } }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 409, code: 'cad-revision-mismatch' }));
    await expect(store.create({ ...reviewPackage, cadExchange: { ...cadExchange, dxf: 'not dxf' } }))
      .rejects.toEqual(expect.objectContaining<Partial<ReviewExchangeError>>({ status: 400, code: 'invalid-cad-payload' }));
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
