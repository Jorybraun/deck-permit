import { describe, expect, it, vi } from 'vitest';
import { AiDesignError, OpenAiDesignService } from './openaiDesignService.mjs';

describe('OpenAiDesignService', () => {
  it('reports truthful server-only capability state', () => {
    expect(new OpenAiDesignService().capabilities()).toMatchObject({ configured: false, workflow: 'independent-proposal-and-review/v1' });
    expect(new OpenAiDesignService({ apiKey: 'test-key', designModel: 'designer', reviewModel: 'reviewer' }).capabilities()).toMatchObject({ configured: true, designModel: 'designer', reviewModel: 'reviewer' });
  });

  it('uses separate proposal and review invocations with strict structured output', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      calls.push(request);
      const name = request.text.format.name;
      const payload = name === 'deck_design_proposal' ? proposal() : review();
      return new Response(JSON.stringify({ id: `resp-${calls.length}`, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const service = new OpenAiDesignService({ apiKey: 'test-key', designModel: 'designer', reviewModel: 'reviewer', fetchImpl });
    const design = await service.proposeDesign({ goal: 'Better stairs', intent: {}, property: {}, site: {}, design: {} });
    const audited = await service.reviewDesign({ proposal: design, canonicalDesign: {}, deterministicReview: { errors: [] } });
    expect(design.generation).toMatchObject({ model: 'designer', responseId: 'resp-1' });
    expect(audited.generation).toMatchObject({ model: 'reviewer', responseId: 'resp-2' });
    expect(calls).toHaveLength(2);
    expect(calls[0].text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'deck_design_proposal' });
    expect(calls[1].input[0].content).toContain('independent review member');
    expect(calls.every((call) => call.store === false)).toBe(true);
  });

  it('fails closed when no API key is configured', async () => {
    await expect(new OpenAiDesignService().proposeDesign({ intent: {}, property: {}, site: {}, design: {} })).rejects.toMatchObject({ status: 503, code: 'ai-not-configured' });
  });

  it('binds photo inputs to evidence IDs and leaves dimensions unmeasured', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      expect(request.input[1].content[1]).toMatchObject({ type: 'input_image', detail: 'high' });
      return new Response(JSON.stringify({ id: 'photo-response', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ schema: 'ai-photo-observation-draft/v1', summary: 'Rear wall', observations: [{ sourceEvidenceId: 'photo-1', kind: 'window', confidence: .9, description: 'Window visible', measurementStatus: 'not-measured', boundingBox: null, uncertainties: [] }], unknowns: [] }) }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const service = new OpenAiDesignService({ apiKey: 'test-key', fetchImpl });
    const result = await service.analyzePhotos({ photos: [{ evidenceId: 'photo-1', sha256: 'a'.repeat(64), label: 'Rear wall', dataUrl: 'data:image/jpeg;base64,eA==' }] });
    expect(result.observations[0]).toMatchObject({ sourceEvidenceId: 'photo-1', measurementStatus: 'not-measured' });
  });
});

function proposal() {
  return { schema: 'ai-deck-concept/v1', title: 'Simple deck', homeownerSummary: 'A simple deck.', rationale: ['Clear circulation'], platforms: [{ name: 'Main deck', purpose: 'deck', elevationMm: 600, vertices: [{ xMm: 0, yMm: 0 }, { xMm: 4000, yMm: 0 }, { xMm: 4000, yMm: 3000 }, { xMm: 0, yMm: 3000 }], supportStrategy: 'freestanding', joistSpacingMm: 400, decking: 'Pressure-treated wood decking', guardEdgeIndexes: [1, 2, 3] }], stairs: [], assumptions: [], unresolved: ['Professional review'] };
}

function review() {
  return { schema: 'ai-deck-review/v1', verdict: 'conditional', summary: 'Review required.', deterministicAlignment: 'No overrides.', findings: [], strengths: ['Simple geometry'], unresolvedProfessionalChecks: ['Connections'] };
}
