import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewExchangeStore } from './reviewExchangeStore.mjs';

let testDirectory = null;

afterEach(async () => {
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
  testDirectory = null;
});

describe('private review exchange server', () => {
  it('keeps the full sealed decision owner-only and returns bounded metadata to the reviewer', async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'permitly-review-'));
    const store = new ReviewExchangeStore(testDirectory);
    const reviewPackage = {
      manifest: { designFingerprint: 'DP-ABCDEF12', revision: 3 },
      property: { address: '12 Test Street' },
      deck: { area: 18.4 },
      planset: [{ id: 'cover', svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Review issue</text></svg>' }],
      report: { checks: [{ id: 'geometry', title: 'Geometry', status: 'pass', result: 'Closed boundary', basis: 'Canonical model' }] },
      priorReviewCycles: [],
    };
    const created = await store.create(reviewPackage);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const review = {
      id: 'evidence_accepted_01', gateId: 'structural-review', kind: 'sealed-structural-review', fileName: 'sealed-review.pdf', mimeType: 'application/pdf', byteSize: pdf.length,
      pdfBase64: pdf.toString('base64'), sha256: createHash('sha256').update(pdf).digest('hex'), issuerName: 'Test Professional', issuerRole: 'engineer', licenseNumber: 'TEST-001',
      decision: 'accepted', designFingerprint: 'DP-ABCDEF12', professionalRegistry: 'egbc', registryUrl: 'https://www.egbc.ca/registrant-directory', registryCheckedAt: new Date().toISOString(),
      registryStatus: 'directory-confirmed-by-user', recordedAt: new Date().toISOString(), status: 'recorded-unverified', redlines: [],
    };

    const submitted = await store.submitReview(created.id, created.reviewerToken, review);
    const reviewerView = await store.getForReviewer(created.id, created.reviewerToken);
    const ownerView = await store.getForOwner(created.id, created.ownerToken);

    expect(submitted).not.toHaveProperty('pdfBase64');
    expect(reviewerView.review).toMatchObject({ decision: 'accepted', designFingerprint: 'DP-ABCDEF12' });
    expect(reviewerView.review).not.toHaveProperty('pdfBase64');
    expect(ownerView.review).toMatchObject({ pdfBase64: pdf.toString('base64'), sha256: review.sha256 });
    expect(ownerView.review.redlines).toEqual([]);
  });
});
