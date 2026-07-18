import { beforeEach, describe, expect, it } from 'vitest';
import { rectangularBoundary } from '../domain/deckDesign';
import type { PermitSubmissionRecord, ReviewExchangePublication } from '../types';
import { useHomeownerProject } from './homeownerProjectStore';

function publication(revision: number): ReviewExchangePublication {
  return { projectId: `rvw_${revision}`, ownerToken: 'owner-token', reviewerUrl: `https://example.test/review/${revision}`, designFingerprint: `DP-ABCDEF0${revision}`, revision, issueIssuedAt: `2026-07-18T12:0${revision}:00.000Z`, publishedAt: `2026-07-18T12:0${revision}:01.000Z`, expiresAt: '2026-08-17T12:00:00.000Z' };
}

const receipt: PermitSubmissionRecord = {
  id: 'submission-1', provider: 'resend', providerMessageId: 'provider-1', recipient: 'developmentservices@sidney.ca',
  submittedAt: '2026-07-18T15:00:00.000Z', designFingerprint: 'DP-ABCDEF12', revision: 2,
  packageFileName: 'permit.zip', packageByteSize: 1234, packageSha256: 'a'.repeat(64),
  status: 'delivered-to-email-provider', deliveryMeaning: 'Provider accepted the message.',
};

describe('homeowner project submission history', () => {
  beforeEach(() => useHomeownerProject.getState().resetProject());

  it('records a receipt durably in canonical state and replaces an idempotent retry', () => {
    useHomeownerProject.getState().recordPermitSubmission(receipt);
    useHomeownerProject.getState().recordPermitSubmission({ ...receipt, duplicatePrevented: true });
    expect(useHomeownerProject.getState().permitSubmissionHistory).toEqual([{ ...receipt, duplicatePrevented: true }]);
  });
});

describe('homeowner professional review revision state', () => {
  beforeEach(() => useHomeownerProject.getState().resetProject());

  it('keeps the review issue sequence after the current link is invalidated', () => {
    useHomeownerProject.getState().setReviewPublication(publication(1));
    expect(useHomeownerProject.getState()).toMatchObject({ reviewIssueRevision: 1, reviewPublication: { revision: 1 } });
    useHomeownerProject.getState().setReviewPublication(null);
    expect(useHomeownerProject.getState()).toMatchObject({ reviewIssueRevision: 1, reviewPublication: null });
    useHomeownerProject.getState().setReviewPublication(publication(2));
    expect(useHomeownerProject.getState().reviewIssueRevision).toBe(2);
  });

  it('invalidates a published revision when an undo changes canonical geometry', () => {
    const project = useHomeownerProject.getState();
    project.addPlatform({ boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    useHomeownerProject.getState().setReviewPublication(publication(1));
    useHomeownerProject.getState().undoDesign();
    expect(useHomeownerProject.getState().reviewPublication).toBeNull();
  });
});
