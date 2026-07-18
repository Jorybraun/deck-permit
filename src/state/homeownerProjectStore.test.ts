import { beforeEach, describe, expect, it } from 'vitest';
import { rectangularBoundary } from '../domain/deckDesign';
import type { ReviewExchangePublication } from '../types';
import { useHomeownerProject } from './homeownerProjectStore';

function publication(revision: number): ReviewExchangePublication {
  return { projectId: `rvw_${revision}`, ownerToken: 'owner-token', reviewerUrl: `https://example.test/review/${revision}`, designFingerprint: `DP-ABCDEF0${revision}`, revision, issueIssuedAt: `2026-07-18T12:0${revision}:00.000Z`, publishedAt: `2026-07-18T12:0${revision}:01.000Z`, expiresAt: '2026-08-17T12:00:00.000Z' };
}

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
