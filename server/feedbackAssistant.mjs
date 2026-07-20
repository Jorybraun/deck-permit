const CEREBRAS_CHAT_COMPLETIONS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-oss-120b';

export class FeedbackAssistantError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'FeedbackAssistantError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Knowledge primer so the assistant understands THIS application when helping an
 * expert write a bug report — the stages, the engines, and the honest gating model.
 */
const APP_PRIMER = `You are the bug-report assistant embedded in "Permitly", a web app that helps a homeowner get a Town of Sidney (BC) building permit for a residential deck, and turns the design into a builder-ready package.

How the app works — the homeowner journey has five stages:
1. Idea — pick how the deck will be used (dining, lounging, hot tub), features, material, budget; free-text brief.
2. Property — enter a BC street address; the app pulls the real Town of Sidney parcel + house footprint from municipal ArcGIS GIS. The user confirms the front/rear property lines and the house wall the deck attaches to.
3. Design — a CAD editor: draw deck platforms at set elevations, add stairs, set decking/guard finishes. An optional Cerebras AI "design team" proposes a revised layout and an independent AI reviewer audits it. A live material cost allowance is shown.
4. Permit — a framing plan and member schedule are generated from the geometry; deterministic checks run (framing member sizing, lateral load path, footings, ledger, guards, stairs). It produces a 20-sheet 11x17 drawing set, a calculation booklet, and layered DXF, all bound to an issue fingerprint. It also assembles the Town of Sidney application data and submission gates.
5. Builders — consent-based matching to share the package with a builder.

Design philosophy to keep in mind when triaging: the app deliberately NEVER claims code compliance from automation. Deterministic checks and a qualified professional (EGBC engineer) remain authoritative. Freestanding or long-span platforms correctly route to "engineering required" rather than being auto-sized.

Known rough edges the team is aware of: the material COST estimate is a rough regional allowance (not itemized) and currently reads high; the final permit-PDF generation flow is being hardened.

Your job: help an expert (an engineer, builder, or Sidney permit reviewer) turn a vague observation into a crisp, actionable bug report. Ask at most 1-2 focused clarifying questions at a time — which stage/screen, what they saw versus expected, exact numbers or the address used, and steps to reproduce. Be concise and concrete. Never invent app behavior you are unsure about; ask instead. When you have enough to write a clear report, say so and tell them to hit "Draft the report."`;

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    kind: { type: 'string', enum: ['bug', 'critique', 'idea'] },
    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    whatHappened: { type: 'string' },
    expected: { type: 'string' },
    stepsToReproduce: { type: 'string' },
    aiClassification: { type: 'string' },
  },
  required: ['title', 'kind', 'severity', 'whatHappened', 'expected', 'stepsToReproduce', 'aiClassification'],
};

export class FeedbackAssistant {
  constructor({ apiKey, model = DEFAULT_MODEL, fetchImpl = fetch } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async chat(messages, context) {
    this.#requireConfigured();
    const body = await this.#call({
      max_completion_tokens: 700,
      messages: [
        { role: 'system', content: `${APP_PRIMER}\n\nContext of what the expert is currently looking at:\n${contextBlock(context)}` },
        ...normalizeMessages(messages),
      ],
    });
    const reply = body?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new FeedbackAssistantError(502, 'assistant-empty', 'The assistant returned no reply. Try again.');
    return { reply };
  }

  async draft(messages, context) {
    this.#requireConfigured();
    const conversation = normalizeMessages(messages).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const body = await this.#call({
      max_completion_tokens: 1_200,
      response_format: { type: 'json_schema', json_schema: { name: 'bug_report', strict: true, schema: REPORT_SCHEMA } },
      messages: [
        { role: 'system', content: `${APP_PRIMER}\n\nWrite a single clean bug report from the conversation below. Use only what the expert stated; do not fabricate steps or numbers. If a field is unknown, write "Not specified". Set severity by real user impact. aiClassification is your best guess at the responsible area (e.g. "framing engine", "GIS property lookup", "cost estimate", "UI", "permit PDF export", "AI design team").\n\nContext of what the expert was looking at:\n${contextBlock(context)}` },
        { role: 'user', content: `Conversation:\n${conversation}` },
      ],
    });
    const text = body?.choices?.[0]?.message?.content;
    try { return JSON.parse(text); }
    catch { throw new FeedbackAssistantError(502, 'assistant-invalid-draft', 'The assistant could not draft a structured report. Fill the form manually.'); }
  }

  async #call(payload) {
    const response = await this.fetchImpl(CEREBRAS_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, ...payload }),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 429) throw new FeedbackAssistantError(429, 'assistant-rate-limited', 'The AI helper hit its rate limit. Wait a moment and try again.');
    if (!response.ok) throw new FeedbackAssistantError(response.status >= 500 ? 502 : response.status, 'assistant-request-failed', body?.error?.message || body?.message || 'The AI helper request could not be completed.');
    return body;
  }

  #requireConfigured() {
    if (!this.apiKey) throw new FeedbackAssistantError(503, 'assistant-not-configured', 'The AI helper needs a CEREBRAS_API_KEY on the server. You can still file the report with the guided form.');
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-24)
    .map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: typeof m?.content === 'string' ? m.content.slice(0, 4_000) : '' }))
    .filter((m) => m.content);
}

function contextBlock(context) {
  if (!context || typeof context !== 'object') return '(no context provided)';
  const lines = [];
  if (context.stage) lines.push(`- Current stage/screen: ${context.stage}`);
  if (context.address) lines.push(`- Property address in project: ${context.address}`);
  if (Number.isFinite(context.platformCount)) lines.push(`- Platforms in design: ${context.platformCount}`);
  if (Number.isFinite(context.stairCount)) lines.push(`- Stairs in design: ${context.stairCount}`);
  if (Number.isFinite(context.totalAreaSqM)) lines.push(`- Total deck area: ${context.totalAreaSqM} m²`);
  if (context.designFingerprint) lines.push(`- Design fingerprint: ${context.designFingerprint}`);
  if (Array.isArray(context.onScreenErrors) && context.onScreenErrors.length) lines.push(`- On-screen errors/warnings: ${context.onScreenErrors.join(' | ')}`);
  return lines.length ? lines.join('\n') : '(no context provided)';
}
