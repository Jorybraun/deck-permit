import { describe, expect, it } from 'vitest';
import type { VerificationEvidence } from '../types';
import { buildBundleReadme, buildPackageIndex, collectEvidenceEntries, safeFileName, validateBundleArchive, validateBundleInput, type PermitBundleInput } from './permitBundle';
import { sha256Blob } from './fileDigest';

const evidence: VerificationEvidence = {
  id: 'e1', gateId: 'structural-review', kind: 'sealed-structural-review', fileName: '../sealed review.pdf', mimeType: 'application/pdf', byteSize: 6,
  sha256: 'a'.repeat(64), issuerName: 'Engineer', issuerRole: 'engineer', licenseNumber: '1', decision: 'accepted', designFingerprint: 'DP-ABCDEF12', recordedAt: new Date().toISOString(), status: 'recorded-unverified',
};

describe('permit bundle boundary', () => {
  it('fails closed when ledger evidence bytes are missing', async () => {
    await expect(collectEvidenceEntries([evidence], async () => null)).rejects.toThrow('missing from this browser');
  });

  it('uses safe deterministic evidence paths', async () => {
    const blob = new Blob(['sealed'], { type: 'application/pdf' });
    const sha256 = await sha256Blob(blob);
    const current = { ...evidence, sha256 };
    const entries = await collectEvidenceEntries([current], async () => ({ id: 'e1', fileName: current.fileName, mimeType: 'application/pdf', byteSize: 6, blob }));
    expect(Object.keys(entries)[0]).toBe(`03-professional-and-site-evidence/structural-review-${sha256.slice(0, 10)}-e1-sealed-review.pdf`);
    expect(safeFileName('../../a b.pdf')).toBe('a-b.pdf');
    expect(safeFileName('..')).toBe('document');
  });

  it('fails closed when stored evidence bytes do not match the recorded digest', async () => {
    const blob = new Blob(['sealed'], { type: 'application/pdf' });
    await expect(collectEvidenceEntries([evidence], async () => ({ id: 'e1', fileName: evidence.fileName, mimeType: 'application/pdf', byteSize: 6, blob }))).rejects.toThrow('SHA-256 integrity check');
  });

  it('separates rejected evidence from current professional evidence', async () => {
    const blob = new Blob(['sealed'], { type: 'application/pdf' });
    const current = { ...evidence, sha256: await sha256Blob(blob) };
    const entries = await collectEvidenceEntries([current], async () => ({ id: 'e1', fileName: current.fileName, mimeType: 'application/pdf', byteSize: 6, blob }), new Set(['e1']));
    expect(Object.keys(entries)[0]).toMatch(/^05-rejected-or-stale-evidence\//);
  });

  it('verifies exact, non-empty, path-safe ZIP contents', () => {
    expect(() => validateBundleArchive({ 'README-FIRST.txt': new Uint8Array([1]) }, ['README-FIRST.txt'])).not.toThrow();
    expect(() => validateBundleArchive({ 'README-FIRST.txt': new Uint8Array() }, ['README-FIRST.txt'])).toThrow('empty file');
    expect(() => validateBundleArchive({ '../escape.txt': new Uint8Array([1]) }, ['../escape.txt'])).toThrow('unsafe path');
    expect(() => validateBundleArchive({ 'extra.txt': new Uint8Array([1]) }, ['README-FIRST.txt'])).toThrow('did not match');
    expect(() => validateBundleArchive({ 'README-FIRST.txt': new Uint8Array([2]) }, ['README-FIRST.txt'], { 'README-FIRST.txt': new Uint8Array([1]) })).toThrow('changed the bytes');
  });

  it('creates a machine-verifiable index for every non-index package file', async () => {
    const index = JSON.parse(await buildPackageIndex({ 'README-FIRST.txt': new TextEncoder().encode('read me') }, {
      manifest: { designFingerprint: 'DP-ABCDEF12' }, readiness: { status: 'review-package' },
    } as PermitBundleInput));
    expect(index).toMatchObject({ schema: 'deck-permit-package-index/v1', designFingerprint: 'DP-ABCDEF12', packageKind: 'professional-review' });
    expect(index.files).toEqual([{ path: 'README-FIRST.txt', byteSize: 7, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
  });

  it('labels incomplete packages and lists outstanding gates', () => {
    const input = { property: { address: { fullAddress: '12 Test St' }, parcel: { pid: '001' } }, manifest: { designFingerprint: 'DP-ABCDEF12' }, readiness: { status: 'review-package', gates: [{ status: 'required', label: 'Survey', detail: 'Attach survey.' }] } } as unknown as PermitBundleInput;
    const readme = buildBundleReadme(input);
    expect(readme).toContain('not ready to submit');
    expect(readme).toContain('Survey: Attach survey.');
    expect(readme).toContain('deliberately unsigned');
    expect(readme).toContain('professional redline response log');
  });

  it('rejects stale or incomplete drawing manifests before ZIP assembly', () => {
    const input = {
      property: { address: { fullAddress: '12 Test St' }, parcel: { pid: '001' } },
      manifest: { designFingerprint: 'DP-ABCDEF12', address: '12 Test St', pid: '001', sheetIds: ['cover'] },
      planset: [{ id: 'cover' }],
      application: { civicAddress: '12 Test St', ownerName: 'Owner', ownerAddress: '12 Test St', ownerCityProvince: 'Sidney, BC', ownerPostalCode: 'V8L 1A1', ownerPhone: '250', ownerEmail: 'owner@example.com', projectDescription: 'Deck', constructionValue: '1' },
    } as unknown as PermitBundleInput;
    expect(() => validateBundleInput(input)).toThrow('Regenerate all seven sheets');
    input.manifest.designFingerprint = 'bad';
    expect(() => validateBundleInput(input)).toThrow('fingerprint is invalid');
  });

  it('accepts a complete controlled seven-sheet issue boundary', () => {
    const sheetIds = ['cover', 'site', 'framing', 'elevations', 'sections', 'details', 'calculations'] as const;
    const generatedAt = '2026-07-18T12:00:00.000Z';
    const manifest = { issueId: 'ISSUE-01-DP-ABCDEF12', revision: 1, designFingerprint: 'DP-ABCDEF12', generatedAt, issuePurpose: 'professional-review', address: '12 Test St', pid: '001', sheetIds: [...sheetIds], status: 'professional-review' } as const;
    const input = {
      property: { address: { fullAddress: '12 Test St' }, parcel: { pid: '001' } }, manifest,
      planset: sheetIds.map((id) => ({ id, revision: 1, designFingerprint: manifest.designFingerprint, issuedAt: generatedAt })),
      drawingIssueHistory: [{ id: manifest.issueId, revision: 1, designFingerprint: manifest.designFingerprint, issuedAt: generatedAt, purpose: 'professional-review', description: 'Initial issue', sheetIds: [...sheetIds] }],
      application: { civicAddress: '12 Test St', ownerName: 'Owner', ownerAddress: '12 Test St', ownerCityProvince: 'Sidney, BC', ownerPostalCode: 'V8L 1A1', ownerPhone: '250-555-0100', ownerEmail: 'owner@example.com', projectDescription: 'Deck', constructionValue: '10000' },
    } as unknown as PermitBundleInput;
    expect(() => validateBundleInput(input)).not.toThrow();
  });
});
