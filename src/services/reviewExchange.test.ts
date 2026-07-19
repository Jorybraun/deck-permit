import { describe, expect, it, vi } from 'vitest';
import { architecturalReviewScope, getReviewerExchange, reviewPackageForDiscipline, structuralReviewScope, type ReviewPackagePayload } from './reviewExchange';

describe('review exchange client', () => {
  it('sends the reviewer capability only in the authorization header', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'rvw_abc', reviewPackage: {}, review: null }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await getReviewerExchange('rvw_abc', 'private-review-token');
    expect(fetcher).toHaveBeenCalledWith('/api/review-exchange/rvw_abc/reviewer', { headers: { authorization: 'Bearer private-review-token' } });
    expect(fetcher.mock.calls[0][0]).not.toContain('private-review-token');
    fetcher.mockRestore();
  });

  it('keeps architectural coordination separate from structural acceptance', () => {
    const reviewPackage = { reviewScope: structuralReviewScope(), manifest: { designFingerprint: 'DP-ABCDEF12' } } as ReviewPackagePayload;
    const architectural = reviewPackageForDiscipline(reviewPackage, 'architectural');
    expect(architectural.reviewScope).toEqual(architecturalReviewScope());
    expect(architectural.manifest.designFingerprint).toBe('DP-ABCDEF12');
    expect(architectural.reviewScope.acceptanceRequires).not.toContain('complete-work-package-resolutions');
    expect(reviewPackage.reviewScope).toEqual(structuralReviewScope());
  });
});
