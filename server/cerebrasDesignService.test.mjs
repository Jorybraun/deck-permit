import { describe, expect, it, vi } from 'vitest';
import { AiDesignError, CerebrasDesignService } from './cerebrasDesignService.mjs';

describe('CerebrasDesignService', () => {
  it('reports truthful server-only capability state', () => {
    expect(new CerebrasDesignService().capabilities()).toMatchObject({ provider: 'cerebras', configured: false, workflow: 'independent-proposal-and-review/v1' });
    expect(new CerebrasDesignService({ apiKey: 'test-key', designModel: 'designer', reviewModel: 'reviewer', photoModel: 'vision' }).capabilities()).toMatchObject({ provider: 'cerebras', configured: true, designModel: 'designer', reviewModel: 'reviewer', photoModel: 'vision', photoBatchSize: 2, photoSelectionLimit: 5 });
  });

  it('uses separate proposal and review invocations with strict structured output', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      calls.push(request);
      const name = request.response_format.json_schema.name;
      const payload = name === 'deck_design_proposal' ? proposal() : review();
      return new Response(JSON.stringify({ id: `resp-${calls.length}`, choices: [{ message: { role: 'assistant', content: JSON.stringify(payload) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const service = new CerebrasDesignService({ apiKey: 'test-key', designModel: 'designer', reviewModel: 'reviewer', fetchImpl });
    const design = await service.proposeDesign({ goal: 'Better stairs', intent: {}, property: {}, site: {}, design: {} });
    const audited = await service.reviewDesign({ proposal: design, canonicalDesign: {}, deterministicReview: { errors: [] } });
    expect(design.generation).toMatchObject({ model: 'designer', responseId: 'resp-1' });
    expect(audited.generation).toMatchObject({ model: 'reviewer', responseId: 'resp-2' });
    expect(calls).toHaveLength(2);
    expect(calls[0].response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true, name: 'deck_design_proposal' } });
    expect(Buffer.byteLength(JSON.stringify(calls[0].response_format.json_schema.schema))).toBeLessThanOrEqual(5_000);
    expect(Buffer.byteLength(JSON.stringify(calls[1].response_format.json_schema.schema))).toBeLessThanOrEqual(5_000);
    expect(calls[1].messages[0].content).toContain('independent review member');
    expect(calls.every((call) => call.messages.length === 2)).toBe(true);
  });

  it('fails closed when no API key is configured', async () => {
    await expect(new CerebrasDesignService().proposeDesign({ intent: {}, property: {}, site: {}, design: {} })).rejects.toMatchObject({ status: 503, code: 'ai-not-configured' });
  });

  it('binds photo inputs to evidence IDs, requests a per-photo scene classification, and leaves dimensions unmeasured', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      expect(request.model).toBe('gemma-4-31b');
      expect(request.messages[1].content[1]).toMatchObject({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,eA==' } });
      // The structured schema requires a classifications array with a constrained category enum.
      const schema = request.response_format.json_schema.schema;
      expect(schema.required).toContain('classifications');
      expect(schema.properties.classifications.items.properties.category.enum).toContain('unsorted');
      expect(schema.properties.classifications.items.properties.category.enum).toContain('design-wall');
      expect(Buffer.byteLength(JSON.stringify(schema))).toBeLessThanOrEqual(5_000);
      // The prompt instructs the model to classify each photo's best-matching view.
      expect(request.messages[1].content[0].text).toContain('classify which single existing-condition view');
      return new Response(JSON.stringify({ id: 'photo-response', choices: [{ message: { role: 'assistant', content: JSON.stringify({ schema: 'ai-photo-observation-draft/v1', summary: 'Rear wall', observations: [{ sourceEvidenceId: 'photo-1', kind: 'window', confidence: .9, description: 'Window visible', measurementStatus: 'not-measured', boundingBox: null, uncertainties: [] }], classifications: [{ sourceEvidenceId: 'photo-1', category: 'design-wall', confidence: .88 }], unknowns: [] }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const service = new CerebrasDesignService({ apiKey: 'test-key', fetchImpl });
    const result = await service.analyzePhotos({ photos: [{ evidenceId: 'photo-1', sha256: 'a'.repeat(64), label: 'Rear wall', dataUrl: 'data:image/jpeg;base64,eA==' }] });
    expect(result.observations[0]).toMatchObject({ sourceEvidenceId: 'photo-1', measurementStatus: 'not-measured' });
    expect(result.classifications[0]).toMatchObject({ sourceEvidenceId: 'photo-1', category: 'design-wall', confidence: .88 });
  });

  it('rejects unsupported or oversized photo batches before sending them', async () => {
    const fetchImpl = vi.fn();
    const service = new CerebrasDesignService({ apiKey: 'test-key', fetchImpl });
    const identity = { evidenceId: 'photo-1', sha256: 'a'.repeat(64) };
    await expect(service.analyzePhotos({ photos: [{ ...identity, dataUrl: 'data:image/webp;base64,eA==' }] })).rejects.toMatchObject({ status: 400, code: 'invalid-photo-input' });
    await expect(service.analyzePhotos({ photos: [1, 2, 3].map((index) => ({ evidenceId: `photo-${index}`, sha256: 'a'.repeat(64), dataUrl: 'data:image/jpeg;base64,eA==' })) })).rejects.toMatchObject({ status: 400, code: 'invalid-photo-input' });
    const oversizedJpeg = `data:image/jpeg;base64,${Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')}`;
    await expect(service.analyzePhotos({ photos: [{ ...identity, dataUrl: oversizedJpeg }] })).rejects.toMatchObject({ status: 413, code: 'photo-input-too-large' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function proposal() {
  return { schema: 'ai-deck-concept/v1', title: 'Simple deck', homeownerSummary: 'A simple deck.', rationale: ['Clear circulation'], platforms: [{ name: 'Main deck', purpose: 'deck', elevationMm: 600, vertices: [{ xMm: 0, yMm: 0 }, { xMm: 4000, yMm: 0 }, { xMm: 4000, yMm: 3000 }, { xMm: 0, yMm: 3000 }], supportStrategy: 'freestanding', joistSpacingMm: 400, decking: 'Pressure-treated wood decking', guardEdgeIndexes: [1, 2, 3] }], stairs: [], assumptions: [], unresolved: ['Professional review'] };
}

function review() {
  return { schema: 'ai-deck-review/v1', verdict: 'conditional', summary: 'Review required.', deterministicAlignment: 'No overrides.', findings: [], strengths: ['Simple geometry'], unresolvedProfessionalChecks: ['Connections'] };
}
