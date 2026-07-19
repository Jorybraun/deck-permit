const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6-sol';

export class AiDesignError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AiDesignError';
    this.status = status;
    this.code = code;
  }
}

/** Server-only OpenAI adapter. The browser never receives the API key. */
export class OpenAiDesignService {
  constructor({ apiKey, designModel = DEFAULT_MODEL, reviewModel = DEFAULT_MODEL, fetchImpl = fetch } = {}) {
    this.apiKey = apiKey;
    this.designModel = designModel;
    this.reviewModel = reviewModel;
    this.fetchImpl = fetchImpl;
  }

  capabilities() {
    return {
      schema: 'ai-design-capabilities/v1',
      configured: Boolean(this.apiKey),
      designModel: this.designModel,
      reviewModel: this.reviewModel,
      workflow: 'independent-proposal-and-review/v1',
      limitations: [
        'AI output is a proposed revision, not a measured fact or permit approval.',
        'Deterministic geometry, zoning, life-safety, framing, and opening checks remain authoritative inside the application.',
        'A qualified professional and the authority having jurisdiction retain final review authority.',
      ],
    };
  }

  async proposeDesign(input) {
    requireConfigured(this.apiKey);
    validateProjectInput(input);
    const prompt = {
      goal: cleanText(input.goal, 2_000) || 'Improve the deck layout for circulation, appearance, constructability, and the homeowner brief.',
      coordinateSystem: 'Millimetres. X follows the selected house wall from its recorded start toward its end. Positive Y extends outward into the yard.',
      homeownerIntent: input.intent,
      property: input.property,
      site: input.site,
      currentDesign: input.design,
      instructions: [
        'Return one genuinely useful alternate deck concept, not commentary about how to design one.',
        'Use bounded floor platforms at explicit elevations. Use a separate landing platform when a stair changes direction or needs an intermediate level.',
        'Connect levels with explicit straight stair flights. Keep stair endpoints on the named platform edges when a platform endpoint is used.',
        'Treat photo-observed openings and municipal geometry as reference evidence; do not upgrade them to measurements.',
        'Prefer simple buildable load paths and regular framing directions, but do not claim structural adequacy.',
        'Do not claim code compliance. A separate deterministic and AI review follows this proposal.',
      ],
    };
    return this.#structuredResponse({
      model: this.designModel,
      schemaName: 'deck_design_proposal',
      schema: DESIGN_PROPOSAL_SCHEMA,
      system: 'You are the concept-design member of a residential deck design team. You generate editable architectural geometry for homeowner review. You never certify code compliance, measurements, structure, or permits.',
      user: JSON.stringify(prompt),
    });
  }

  async reviewDesign(input) {
    requireConfigured(this.apiKey);
    if (!input || typeof input !== 'object' || !input.proposal || !input.deterministicReview) throw new AiDesignError(400, 'invalid-review-input', 'A proposal and its deterministic review are required.');
    const prompt = {
      reviewContract: [
        'You are independent from the design-proposal invocation.',
        'The deterministic results are the controlling machine checks. Never turn a deterministic failure into a pass.',
        'Every finding must cite a supplied checkId or ruleId. Use UNRESOLVED-PROFESSIONAL when no machine rule resolves the issue.',
        'Candidate-ready-for-professional-review does not mean code compliant, permit ready, engineered, or approved.',
        'Check circulation, platform/stair relationships, openings, guard intent, constructability, and unresolved structural scope.',
      ],
      proposal: input.proposal,
      canonicalDesign: input.canonicalDesign,
      deterministicReview: input.deterministicReview,
    };
    return this.#structuredResponse({
      model: this.reviewModel,
      schemaName: 'deck_design_independent_review',
      schema: DESIGN_REVIEW_SCHEMA,
      system: 'You are the independent review member of a residential deck design team. You audit a proposed revision against supplied deterministic checks and rule provenance. You cannot approve, seal, or certify a design.',
      user: JSON.stringify(prompt),
    });
  }

  async analyzePhotos(input) {
    requireConfigured(this.apiKey);
    if (!input || !Array.isArray(input.photos) || !input.photos.length || input.photos.length > 8) throw new AiDesignError(400, 'invalid-photo-input', 'Provide between one and eight source photos.');
    const content = [{
      type: 'input_text',
      text: JSON.stringify({
        task: 'Record visible existing-condition observations for a deck-design site model.',
        projectContext: input.projectContext || null,
        sources: input.photos.map(({ evidenceId, sha256, label }) => ({ evidenceId, sha256, label })),
        rules: [
          'Bind every observation to one sourceEvidenceId from the supplied list.',
          'Record only visible conditions. Do not infer hidden structure.',
          'All dimensions remain not-measured unless a calibrated reference workflow is explicitly supplied.',
          'Use confidence as an observation aid, never as verification.',
          'Call out doors, windows, wall planes, grade, existing decks/landings/stairs, vents/services, drainage, and obstructions when visible.',
        ],
      }),
    }];
    for (const photo of input.photos) {
      if (!photo.evidenceId || !photo.sha256 || !/^data:image\/(jpeg|png|webp);base64,/i.test(photo.dataUrl || '')) throw new AiDesignError(400, 'invalid-photo-input', 'Each photo requires an evidence ID, SHA-256, and JPEG/PNG/WebP data URL.');
      content.push({ type: 'input_image', image_url: photo.dataUrl, detail: 'high' });
    }
    return this.#structuredResponse({
      model: this.designModel,
      schemaName: 'existing_condition_photo_analysis',
      schema: PHOTO_ANALYSIS_SCHEMA,
      system: 'You are an architectural existing-conditions observer. Your output is a reviewable visual observation draft, not a survey, measurement, diagnosis, structural assessment, or code decision.',
      content,
    });
  }

  async #structuredResponse({ model, schemaName, schema, system, user, content }) {
    const response = await this.fetchImpl(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: content || user },
        ],
        text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
        max_output_tokens: 12_000,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new AiDesignError(response.status >= 500 ? 502 : response.status, 'openai-request-failed', body?.error?.message || 'The AI request could not be completed.');
    const outputText = extractOutputText(body);
    if (!outputText) throw new AiDesignError(502, 'openai-empty-output', 'The AI response did not contain a structured result.');
    try {
      return { ...JSON.parse(outputText), generation: { model, responseId: body.id || '', generatedAt: new Date().toISOString() } };
    } catch {
      throw new AiDesignError(502, 'openai-invalid-output', 'The AI response could not be read as structured output.');
    }
  }
}

function requireConfigured(apiKey) {
  if (!apiKey) throw new AiDesignError(503, 'ai-not-configured', 'The server does not have an OPENAI_API_KEY. Add it to .env.local and restart the API server.');
}

function validateProjectInput(input) {
  if (!input || typeof input !== 'object' || !input.site || !input.design || !input.property || !input.intent) throw new AiDesignError(400, 'invalid-design-input', 'Property, site, homeowner intent, and current design are required.');
  const size = Buffer.byteLength(JSON.stringify(input));
  if (size > 2_000_000) throw new AiDesignError(413, 'design-input-too-large', 'The AI design context is too large.');
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function extractOutputText(body) {
  for (const output of body?.output || []) {
    for (const item of output?.content || []) if (item?.type === 'output_text' && typeof item.text === 'string') return item.text;
  }
  return '';
}

const nullableInteger = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const pointSchema = { type: 'object', additionalProperties: false, required: ['xMm', 'yMm'], properties: { xMm: { type: 'integer' }, yMm: { type: 'integer' } } };

const DESIGN_PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schema', 'title', 'homeownerSummary', 'rationale', 'platforms', 'stairs', 'assumptions', 'unresolved'],
  properties: {
    schema: { type: 'string', enum: ['ai-deck-concept/v1'] },
    title: { type: 'string' }, homeownerSummary: { type: 'string' }, rationale: { type: 'array', items: { type: 'string' } },
    platforms: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['name', 'purpose', 'elevationMm', 'vertices', 'supportStrategy', 'joistSpacingMm', 'decking', 'guardEdgeIndexes'], properties: {
      name: { type: 'string' }, purpose: { type: 'string', enum: ['deck', 'landing'] }, elevationMm: { type: 'integer', minimum: -1000, maximum: 10000 },
      vertices: { type: 'array', minItems: 3, maxItems: 16, items: pointSchema },
      supportStrategy: { type: 'string', enum: ['auto', 'ledger', 'freestanding'] }, joistSpacingMm: { type: 'integer', enum: [300, 400, 600] },
      decking: { type: 'string' }, guardEdgeIndexes: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 15 } },
    } } },
    stairs: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['name', 'fromPlatformIndex', 'toKind', 'toPlatformIndex', 'toTerrainElevationMm', 'fromEdgeIndex', 'toEdgeIndex', 'startMm', 'endMm', 'widthMm', 'handrailSides'], properties: {
      name: { type: 'string' }, fromPlatformIndex: { type: 'integer', minimum: 0, maximum: 7 }, toKind: { type: 'string', enum: ['platform', 'terrain'] },
      toPlatformIndex: nullableInteger, toTerrainElevationMm: nullableInteger, fromEdgeIndex: { type: 'integer', minimum: 0, maximum: 15 }, toEdgeIndex: nullableInteger,
      startMm: pointSchema, endMm: pointSchema, widthMm: { type: 'integer', minimum: 860, maximum: 3000 }, handrailSides: { type: 'string', enum: ['none', 'left', 'right', 'both'] },
    } } },
    assumptions: { type: 'array', items: { type: 'string' } }, unresolved: { type: 'array', items: { type: 'string' } },
  },
};

const DESIGN_REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schema', 'verdict', 'summary', 'deterministicAlignment', 'findings', 'strengths', 'unresolvedProfessionalChecks'],
  properties: {
    schema: { type: 'string', enum: ['ai-deck-review/v1'] },
    verdict: { type: 'string', enum: ['revise', 'conditional', 'candidate-ready-for-professional-review'] },
    summary: { type: 'string' }, deterministicAlignment: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'category', 'objectId', 'checkId', 'ruleId', 'message', 'requiredAction'], properties: {
      severity: { type: 'string', enum: ['blocked', 'warning', 'review'] }, category: { type: 'string', enum: ['geometry', 'site', 'opening', 'stair', 'guard', 'framing', 'constructability', 'evidence'] },
      objectId: { type: 'string' }, checkId: { type: 'string' }, ruleId: { type: 'string' }, message: { type: 'string' }, requiredAction: { type: 'string' },
    } } },
    strengths: { type: 'array', items: { type: 'string' } }, unresolvedProfessionalChecks: { type: 'array', items: { type: 'string' } },
  },
};

const PHOTO_ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schema', 'summary', 'observations', 'unknowns'],
  properties: {
    schema: { type: 'string', enum: ['ai-photo-observation-draft/v1'] }, summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sourceEvidenceId', 'kind', 'confidence', 'description', 'measurementStatus', 'boundingBox', 'uncertainties'], properties: {
      sourceEvidenceId: { type: 'string' }, kind: { type: 'string', enum: ['house-wall', 'door', 'window', 'landing', 'stair', 'grade', 'vent-service', 'drainage', 'obstruction', 'other'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 }, description: { type: 'string' }, measurementStatus: { type: 'string', enum: ['not-measured'] },
      boundingBox: { anyOf: [{ type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 }, width: { type: 'number', minimum: 0, maximum: 1 }, height: { type: 'number', minimum: 0, maximum: 1 } } }, { type: 'null' }] },
      uncertainties: { type: 'array', items: { type: 'string' } },
    } } },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
};
