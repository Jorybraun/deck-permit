import { describe, expect, it } from 'vitest';
import type { VerificationEvidence } from '../types';
import { buildSubmissionManifest } from './submissionManifest';

describe('submission manifest evidence assessment', () => {
  it('discloses stale evidence as rejected for the current revision', () => {
    const evidence: VerificationEvidence = {
      id: 'sealed-1', gateId: 'structural-review', kind: 'sealed-structural-review', fileName: 'sealed.pdf', mimeType: 'application/pdf', byteSize: 100,
      sha256: 'a'.repeat(64), issuerName: 'Engineer', issuerRole: 'engineer', licenseNumber: '123', decision: 'accepted', designFingerprint: 'DP-OLD00000',
      professionalRegistry: 'egbc', registryUrl: 'https://www.egbc.ca/registrant-directory', registryCheckedAt: new Date().toISOString(), registryStatus: 'directory-confirmed-by-user',
      recordedAt: new Date().toISOString(), status: 'recorded-unverified',
    };
    const result = JSON.parse(buildSubmissionManifest({
      manifest: { issueId: 'ISSUE-01-DP-ABCDEF12', revision: 1, designFingerprint: 'DP-ABCDEF12', generatedAt: '', issuePurpose: 'professional-review', address: '', pid: '', sheetIds: [], status: 'professional-review' },
      readiness: { status: 'review-package', confirmedCount: 0, requiredCount: 1, summary: '', gates: [{ id: 'structural-review', label: 'Review', status: 'required', responsibleParty: 'engineer', detail: '' }] },
      report: { generatedAt: '', codeEdition: '', designBasis: { deadLoadKpa: 0, liveOrSnowLoadKpa: 0, totalAreaLoadKpa: 0, assumedSoilBearingKpa: 0 }, quantities: { deckAreaSqm: 0, joistSpanM: 0, joistCount: 0, beamSpanM: 0, postCount: 0, beamCount: 0, postsPerBeam: 0, actualPostSpacingM: 0, totalDesignLoadKn: 0, joistLineLoadKnM: 0, joistMomentDemandKnM: 0, joistShearDemandKn: 0, joistSpanUtilization: null, beamLineLoadKnM: 0, exteriorBeamReactionKn: 0, ledgerReactionKn: 0, governingPostReactionKn: 0, tributaryAreaPerPostSqm: 0, estimatedPostReactionKn: 0, requiredFootingAreaSqm: 0, providedFootingAreaSqm: 0 }, loadPath: [], checks: [], calculations: [], connectionSchedule: [], professionalChecklist: [], gates: [{ id: 'structural-review', label: 'Review', status: 'required', responsibleParty: 'engineer', detail: '' }], limitations: [] },
      evidence: [evidence], sources: [],
      professionalReviewCycles: [{
        id: 'rvw-1', exchangeProjectId: 'rvw-1', sourceDesignFingerprint: 'DP-OLD00000', decision: 'changes-requested', issuerName: 'Engineer', issuerRole: 'engineer', licenseNumber: '123',
        importedAt: new Date().toISOString(), evidenceId: 'sealed-1', redlines: [{ id: 'redline_12345678', designFingerprint: 'DP-OLD00000', sheetId: 'framing', category: 'structure', severity: 'required', title: 'Ledger detail', comment: 'Clarify the ledger connection.', anchor: { xPercent: 50, yPercent: 50 }, createdAt: new Date().toISOString() }], resolutions: [],
      }],
    }));
    expect(result.evidenceLedger[0].currentStateAssessment).toEqual({ acceptedForCurrentState: false, reason: 'The sealed review applies to a different design revision.' });
    expect(result.professionalReviewCycles[0].redlines[0]).toMatchObject({ sheetId: 'framing', severity: 'required' });
  });
});
