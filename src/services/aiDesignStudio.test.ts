import { describe, expect, it, vi } from 'vitest';
import { createEmptyDesign } from '../domain/deckDesign';
import { createSiteModel } from '../domain/siteModel';
import type { Property } from '../types';
import { buildDeterministicDesignReview, materializeAiDesignProposal, runAiDesignTeam, type AiDesignProposal } from './aiDesignStudio';

const property: Property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] };

describe('AI design studio boundary', () => {
  it('materializes a proposal through canonical domain constructors', () => {
    const design = materializeAiDesignProposal(proposal(), '2026-07-18T00:00:00.000Z');
    expect(design.platforms).toHaveLength(1);
    expect(design.platforms[0]).toMatchObject({ id: 'P1', name: 'Main deck', elevationMm: 600, framingIntent: { supportStrategy: 'freestanding', joistSpacingMm: 400 } });
    expect(design.platforms[0].edges.map((edge) => edge.role)).toEqual(['open', 'guard', 'guard', 'guard']);
    expect(design.selectedObjectId).toBeNull();
  });

  it('runs deterministic checks before an AI review can interpret the revision', () => {
    const design = materializeAiDesignProposal(proposal());
    const review = buildDeterministicDesignReview(design, createSiteModel(property), property);
    expect(review.schema).toBe('deterministic-ai-design-review/v1');
    expect(review.professionalReviewRequired).toBe(true);
    expect(review.controllingPrinciple).toContain('cannot override');
    expect(review.geometry.errors).toHaveLength(0);
  });

  it('rejects out-of-range geometry instead of admitting it to the editor', () => {
    const invalid = proposal();
    invalid.platforms[0].vertices[0].xMm = 900_000;
    expect(() => materializeAiDesignProposal(invalid)).toThrow('out-of-range coordinate');
  });

  it('repairs once, then excludes still-invalid AI stairs before independent review', async () => {
    const invalid = proposal();
    invalid.stairs = [{ name: 'Bad stair', fromPlatformIndex: 7, toKind: 'terrain', toPlatformIndex: null, toTerrainElevationMm: 0, fromEdgeIndex: 0, toEdgeIndex: null, startMm: { xMm: 0, yMm: 0 }, endMm: { xMm: 900, yMm: 0 }, widthMm: 900, handrailSides: 'both' }];
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('design-proposal') ? invalid : independentReview()), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await runAiDesignTeam({ goal: 'Improve access', intent: {} as Parameters<typeof runAiDesignTeam>[0]['intent'], property, site: createSiteModel(property), design: createEmptyDesign() });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.proposal.stairs).toEqual([]);
      expect(result.proposal.unresolved[result.proposal.unresolved.length - 1]).toContain('Deterministic stair admission failed');
      expect(result.canonicalDesign.platforms).toHaveLength(1);
      expect(result.independentReview.verdict).toBe('conditional');
    } finally { vi.unstubAllGlobals(); }
  });
});

function proposal(): AiDesignProposal {
  return { schema: 'ai-deck-concept/v1', title: 'Simple deck', homeownerSummary: 'Simple layout', rationale: ['Regular framing'], platforms: [{ name: 'Main deck', purpose: 'deck', elevationMm: 600, vertices: [{ xMm: 0, yMm: 0 }, { xMm: 4000, yMm: 0 }, { xMm: 4000, yMm: 3000 }, { xMm: 0, yMm: 3000 }], supportStrategy: 'freestanding', joistSpacingMm: 400, decking: 'Pressure-treated wood decking', guardEdgeIndexes: [1, 2, 3] }], stairs: [], assumptions: [], unresolved: ['Professional review'], generation: { provider: 'cerebras', model: 'test', responseId: 'response', generatedAt: '2026-07-18T00:00:00.000Z' } };
}

function independentReview() {
  return { schema: 'ai-deck-review/v1', verdict: 'conditional', summary: 'Resolve access.', deterministicAlignment: 'No overrides.', findings: [], strengths: ['Admitted platform geometry'], unresolvedProfessionalChecks: ['Stair access'], generation: { provider: 'cerebras', model: 'reviewer', responseId: 'review-response', generatedAt: '2026-07-18T00:00:00.000Z' } };
}
