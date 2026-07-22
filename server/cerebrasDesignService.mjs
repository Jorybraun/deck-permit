const CEREBRAS_CHAT_COMPLETIONS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const DEFAULT_DESIGN_MODEL = 'gemma-4-31b';
const DEFAULT_REVIEW_MODEL = 'gpt-oss-120b';
const DEFAULT_PHOTO_MODEL = 'gemma-4-31b';

export class AiDesignError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AiDesignError';
    this.status = status;
    this.code = code;
  }
}

/** Server-only Cerebras adapter. The browser never receives the API key. */
export class CerebrasDesignService {
  constructor({ apiKey, designModel = DEFAULT_DESIGN_MODEL, reviewModel = DEFAULT_REVIEW_MODEL, photoModel = DEFAULT_PHOTO_MODEL, fetchImpl = fetch } = {}) {
    this.apiKey = apiKey;
    this.designModel = designModel;
    this.reviewModel = reviewModel;
    this.photoModel = photoModel;
    this.fetchImpl = fetchImpl;
  }

  capabilities() {
    return {
      schema: 'ai-design-capabilities/v1',
      provider: 'cerebras',
      configured: Boolean(this.apiKey),
      designModel: this.designModel,
      reviewModel: this.reviewModel,
      photoModel: this.photoModel,
      photoBatchSize: 2,
      photoSelectionLimit: 5,
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
      repairFeedback: input.repairFeedback || null,
      instructions: [
        'Return one genuinely useful alternate deck concept, not commentary about how to design one.',
        'Use bounded floor platforms at explicit elevations. Use a separate landing platform when a stair changes direction or needs an intermediate level.',
        'Connect levels with explicit straight stair flights. Keep stair endpoints on the named platform edges when a platform endpoint is used.',
        'For a platform-to-platform stair, choose source and destination edges so the destination edge intersects the ray leaving the source edge at exactly 90 degrees. Otherwise add a landing platform or connect the flight to terrain.',
        'Treat photo-observed openings and municipal geometry as reference evidence; do not upgrade them to measurements.',
        'Prefer simple buildable load paths and regular framing directions, but do not claim structural adequacy.',
        'Do not claim code compliance. A separate deterministic and AI review follows this proposal.',
        'Hard output limits: return 1-4 platforms, 3-10 vertices per platform, 0-6 stair flights, and no more than 5 rationale, assumption, or unresolved strings. Keep every prose string concise.',
        'When repairFeedback is present, correct the rejected geometry instead of repeating it. The deterministic admission error is controlling.',
      ],
    };
    return this.#structuredResponse({
      model: this.designModel,
      schemaName: 'deck_design_proposal',
      schema: DESIGN_PROPOSAL_SCHEMA,
      maxCompletionTokens: 8_000,
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
        'Hard output limits: return no more than 12 findings, 5 strengths, and 8 unresolved professional checks. Keep every prose string concise.',
      ],
      proposal: input.proposal,
      canonicalDesign: input.canonicalDesign,
      deterministicReview: input.deterministicReview,
    };
    return this.#structuredResponse({
      model: this.reviewModel,
      schemaName: 'deck_design_independent_review',
      schema: DESIGN_REVIEW_SCHEMA,
      maxCompletionTokens: 10_000,
      system: 'You are the independent review member of a residential deck design team. You audit a proposed revision against supplied deterministic checks and rule provenance. You cannot approve, seal, or certify a design.',
      user: JSON.stringify(prompt),
    });
  }

  async analyzePhotos(input) {
    requireConfigured(this.apiKey);
    if (!input || !Array.isArray(input.photos) || !input.photos.length || input.photos.length > 2) throw new AiDesignError(400, 'invalid-photo-input', 'Provide one or two source photos per Cerebras vision request.');
    const content = [{
      type: 'text',
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
          'For each source photo, classify which single existing-condition view it best represents using the category enum; use "unsorted" when you cannot tell confidently.',
          'Return no more than 20 distinct observations for this one- or two-image batch and keep descriptions concise.',
        ],
      }),
    }];
    let combinedPhotoBytes = 0;
    for (const photo of input.photos) {
      if (!photo.evidenceId || !photo.sha256 || !/^data:image\/(jpeg|png);base64,/i.test(photo.dataUrl || '')) throw new AiDesignError(400, 'invalid-photo-input', 'Each photo requires an evidence ID, SHA-256, and JPEG/PNG data URL.');
      combinedPhotoBytes += decodedDataUrlBytes(photo.dataUrl);
      content.push({ type: 'image_url', image_url: { url: photo.dataUrl } });
    }
    if (combinedPhotoBytes > 10 * 1024 * 1024) throw new AiDesignError(413, 'photo-input-too-large', 'Cerebras accepts at most 10 MB of combined image data per analysis. Remove photos or upload smaller JPEG/PNG files.');
    return this.#structuredResponse({
      model: this.photoModel,
      schemaName: 'existing_condition_photo_analysis',
      schema: PHOTO_ANALYSIS_SCHEMA,
      maxCompletionTokens: 6_000,
      system: 'You are an architectural existing-conditions observer. Your output is a reviewable visual observation draft, not a survey, measurement, diagnosis, structural assessment, or code decision.',
      content,
    });
  }

  // Free-text conversational review of the homeowner's OWN plan, grounded in the deterministic
  // facts the client passes (live checks, zoning, bylaw notes). Not structured output — a chat.
  async discussDesign({ grounding, messages }) {
    requireConfigured(this.apiKey);
    const convo = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map((m) => ({ role: m.role, content: cleanText(m.content, 4000) }));
    if (!convo.length) throw new AiDesignError(400, 'invalid-chat-input', 'At least one message is required.');
    const system = [
      'You are a friendly, expert building-permit advisor helping a homeowner in the Town of Sidney, BC with THEIR deck plan.',
      'You are reviewing and discussing a plan they drew — you did not design it. Be encouraging but honest.',
      'Ground every statement in the PROJECT FACTS below (live geometry checks, zoning setbacks, lot coverage, door/window and stair checks, bylaw notes). Never invent rules or numbers; if a fact is not given, say you are not sure and suggest how to confirm.',
      'When something fails or is missing, say so plainly and give the single most useful next change. Plain English over jargon; explain any code term in one clause.',
      'You are a helper, not the authority — never claim the plan is permit-approved; the Town has final say. Keep replies short (2–6 sentences) unless asked for more.',
      'Write in plain sentences only — no markdown, asterisks, bold, headers, or bullet symbols.',
      '',
      'PROJECT FACTS:',
      cleanText(grounding, 12000),
    ].join('\n');
    const response = await this.fetchImpl(CEREBRAS_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.reviewModel, messages: [{ role: 'system', content: system }, ...convo], max_completion_tokens: 700 }),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 429) { const retryAfter = response.headers.get('retry-after'); throw new AiDesignError(429, 'cerebras-rate-limited', `Cerebras hit its rate limit. Wait${retryAfter ? ` ${retryAfter} seconds` : ' a moment'} and try again.`); }
    if (!response.ok) throw new AiDesignError(response.status >= 500 ? 502 : response.status, 'cerebras-request-failed', body?.error?.message || body?.message || 'The Cerebras request could not be completed.');
    const reply = cleanText(body?.choices?.[0]?.message?.content, 4000);
    if (!reply) throw new AiDesignError(502, 'cerebras-empty-output', 'The advisor returned no reply — try again.');
    return { reply, generation: { provider: 'cerebras', model: this.reviewModel, responseId: body.id || '', generatedAt: new Date().toISOString() } };
  }

  async #structuredResponse({ model, schemaName, schema, system, user, content, maxCompletionTokens }) {
    if (Buffer.byteLength(JSON.stringify(schema)) > 5_000) throw new AiDesignError(500, 'ai-schema-too-large', 'The structured-output schema exceeds the Cerebras 5,000-byte limit.');
    const response = await this.fetchImpl(CEREBRAS_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: content || user },
        ],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
        max_completion_tokens: maxCompletionTokens,
      }),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new AiDesignError(429, 'cerebras-rate-limited', `Cerebras reached its token-per-minute limit. Wait${retryAfter ? ` ${retryAfter} seconds` : ' briefly'} and run the design team again.`);
    }
    if (!response.ok) throw new AiDesignError(response.status >= 500 ? 502 : response.status, 'cerebras-request-failed', body?.error?.message || body?.message || (typeof body === 'string' ? body : '') || 'The Cerebras request could not be completed.');
    const outputText = extractOutputText(body);
    if (!outputText) {
      const finishReason = cleanText(body?.choices?.[0]?.finish_reason, 80);
      const refusal = cleanText(body?.choices?.[0]?.message?.refusal, 300);
      throw new AiDesignError(502, 'cerebras-empty-output', `Cerebras returned no structured result${finishReason ? ` (finish reason: ${finishReason})` : ''}${refusal ? `: ${refusal}` : '.'}`);
    }
    try {
      return { ...JSON.parse(outputText), generation: { provider: 'cerebras', model, responseId: body.id || '', generatedAt: new Date().toISOString() } };
    } catch {
      throw new AiDesignError(502, 'cerebras-invalid-output', 'The Cerebras response could not be read as structured output.');
    }
  }
}

function requireConfigured(apiKey) {
  if (!apiKey) throw new AiDesignError(503, 'ai-not-configured', 'The server does not have a CEREBRAS_API_KEY. Add it to .env.local and restart the API server.');
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
  return typeof body?.choices?.[0]?.message?.content === 'string' ? body.choices[0].message.content : '';
}

function decodedDataUrlBytes(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex < 0 ? 0 : Buffer.from(dataUrl.slice(commaIndex + 1), 'base64').byteLength;
}

const nullableInteger = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const pointSchema = { type: 'object', additionalProperties: false, required: ['xMm', 'yMm'], properties: { xMm: { type: 'integer' }, yMm: { type: 'integer' } } };

const DESIGN_PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schema', 'title', 'homeownerSummary', 'rationale', 'platforms', 'stairs', 'assumptions', 'unresolved'],
  properties: {
    schema: { type: 'string', enum: ['ai-deck-concept/v1'] },
    title: { type: 'string' }, homeownerSummary: { type: 'string' }, rationale: { type: 'array', items: { type: 'string' } },
    platforms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'purpose', 'elevationMm', 'vertices', 'supportStrategy', 'joistSpacingMm', 'decking', 'guardEdgeIndexes'], properties: {
      name: { type: 'string' }, purpose: { type: 'string', enum: ['deck', 'landing'] }, elevationMm: { type: 'integer', minimum: -1000, maximum: 10000 },
      vertices: { type: 'array', items: pointSchema },
      supportStrategy: { type: 'string', enum: ['auto', 'ledger', 'freestanding'] }, joistSpacingMm: { type: 'integer', enum: [300, 400, 600] },
      decking: { type: 'string' }, guardEdgeIndexes: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 15 } },
    } } },
    stairs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'fromPlatformIndex', 'toKind', 'toPlatformIndex', 'toTerrainElevationMm', 'fromEdgeIndex', 'toEdgeIndex', 'startMm', 'endMm', 'widthMm', 'handrailSides'], properties: {
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
  required: ['schema', 'summary', 'observations', 'classifications', 'unknowns'],
  properties: {
    schema: { type: 'string', enum: ['ai-photo-observation-draft/v1'] }, summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sourceEvidenceId', 'kind', 'confidence', 'description', 'measurementStatus', 'boundingBox', 'uncertainties'], properties: {
      sourceEvidenceId: { type: 'string' }, kind: { type: 'string', enum: ['house-wall', 'door', 'window', 'landing', 'stair', 'grade', 'vent-service', 'drainage', 'obstruction', 'other'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 }, description: { type: 'string' }, measurementStatus: { type: 'string', enum: ['not-measured'] },
      boundingBox: { anyOf: [{ type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 }, width: { type: 'number', minimum: 0, maximum: 1 }, height: { type: 'number', minimum: 0, maximum: 1 } } }, { type: 'null' }] },
      uncertainties: { type: 'array', items: { type: 'string' } },
    } } },
    classifications: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sourceEvidenceId', 'category', 'confidence'], properties: {
      sourceEvidenceId: { type: 'string' }, category: { type: 'string', enum: ['house-overview', 'design-wall', 'door-threshold', 'grade-context', 'wall-assembly', 'obstruction', 'survey-or-sketch', 'unsorted'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    } } },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
};
