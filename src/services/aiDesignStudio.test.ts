import { describe, expect, it } from 'vitest';
import { createSiteModel } from '../domain/siteModel';
import type { Property } from '../types';
import { buildDeterministicDesignReview, materializeAiDesignProposal, type AiDesignProposal } from './aiDesignStudio';

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
});

function proposal(): AiDesignProposal {
  return { schema: 'ai-deck-concept/v1', title: 'Simple deck', homeownerSummary: 'Simple layout', rationale: ['Regular framing'], platforms: [{ name: 'Main deck', purpose: 'deck', elevationMm: 600, vertices: [{ xMm: 0, yMm: 0 }, { xMm: 4000, yMm: 0 }, { xMm: 4000, yMm: 3000 }, { xMm: 0, yMm: 3000 }], supportStrategy: 'freestanding', joistSpacingMm: 400, decking: 'Pressure-treated wood decking', guardEdgeIndexes: [1, 2, 3] }], stairs: [], assumptions: [], unresolved: ['Professional review'], generation: { model: 'test', responseId: 'response', generatedAt: '2026-07-18T00:00:00.000Z' } };
}
