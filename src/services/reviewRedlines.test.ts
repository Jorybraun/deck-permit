import { describe, expect, it } from 'vitest';
import type { ProfessionalReviewCycle, ReviewRedline } from '../types';
import { buildReviewResponseLog, recordRedlineResolution, unansweredRequiredRedlines, validateReviewRedlines } from './reviewRedlines';

const fingerprint = 'DP-ABCDEF12';
const requiredRedline: ReviewRedline = {
  id: 'redline_12345678', designFingerprint: fingerprint, sheetId: 'framing', category: 'structure', severity: 'required',
  title: 'Clarify ledger fasteners', comment: 'Provide the fastener diameter, spacing, edge distance, and verified substrate.',
  anchor: { xPercent: 52.4, yPercent: 38.1 }, createdAt: new Date().toISOString(),
};
const cycle: ProfessionalReviewCycle = {
  id: 'cycle-1', exchangeProjectId: 'rvw_123', sourceDesignFingerprint: fingerprint, decision: 'changes-requested', issuerName: 'A. Engineer',
  issuerRole: 'engineer', licenseNumber: '12345', importedAt: '2026-07-18T13:00:00.000Z', evidenceId: 'evidence-1', redlines: [requiredRedline], resolutions: [], structuralResolutions: [],
};

describe('professional redline workflow', () => {
  it('requires a bounded, revision-matched redline for a change request', () => {
    expect(() => validateReviewRedlines([requiredRedline], fingerprint, ['framing'], 'changes-requested')).not.toThrow();
    expect(() => validateReviewRedlines([], fingerprint, ['framing'], 'changes-requested')).toThrow('at least one required');
    expect(() => validateReviewRedlines([requiredRedline], fingerprint, ['framing'], 'accepted')).toThrow('advisory redlines only');
    expect(() => validateReviewRedlines([{ ...requiredRedline, designFingerprint: 'DP-00000000' }], fingerprint, ['framing'], 'changes-requested')).toThrow('published design revision');
  });

  it('keeps required redlines unanswered until an owner/designer response is recorded', () => {
    expect(unansweredRequiredRedlines([cycle])).toHaveLength(1);
    const responded = recordRedlineResolution([cycle], { cycleId: cycle.id, redlineId: requiredRedline.id, targetDesignFingerprint: fingerprint, disposition: 'response-only', response: 'Fastener callout requires field verification before selection.' });
    expect(unansweredRequiredRedlines(responded)).toHaveLength(0);
    expect(responded[0].resolutions[0]).toMatchObject({ targetDesignFingerprint: fingerprint, disposition: 'response-only' });
    expect(JSON.parse(buildReviewResponseLog(responded, fingerprint)).cycles[0].redlines[0].sheetId).toBe('framing');
  });

  it('does not allow a same-fingerprint response to claim a design change', () => {
    expect(() => recordRedlineResolution([cycle], { cycleId: cycle.id, redlineId: requiredRedline.id, targetDesignFingerprint: fingerprint, disposition: 'addressed-in-revision', response: 'Ledger detail changed.' })).toThrow('Regenerate a changed design revision');
    expect(() => recordRedlineResolution([cycle], { cycleId: 'missing', redlineId: requiredRedline.id, targetDesignFingerprint: fingerprint, disposition: 'response-only', response: 'Needs coordination.' })).toThrow('no longer exists');
  });
});
