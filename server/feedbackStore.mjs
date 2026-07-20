import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ID_PATTERN = /^fb_[a-f0-9]{24}$/;
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const KINDS = new Set(['bug', 'critique', 'idea']);

export class FeedbackError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'FeedbackError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Durable store for expert bug reports, design critiques, and ideas.
 * Each submission is written atomically to <dataDirectory>/feedback/<id>.json
 * so the agent can triage the collected reports out of band.
 */
export class FeedbackStore {
  constructor(dataDirectory) {
    this.directory = join(dataDirectory, 'feedback');
  }

  async create(submission) {
    const record = normalizeSubmission(submission);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const id = `fb_${randomBytes(12).toString('hex')}`;
    const now = new Date().toISOString();
    const stored = { schema: 'deck-permit-feedback/v1', id, createdAt: now, status: 'new', ...record };
    const path = join(this.directory, `${id}.json`);
    const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temp, JSON.stringify(stored, null, 2), { mode: 0o600 });
    await rename(temp, path);
    return { id, createdAt: now };
  }

  async list() {
    let files;
    try { files = await readdir(this.directory); }
    catch { return []; }
    const records = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try { records.push(JSON.parse(await readFile(join(this.directory, file), 'utf8'))); }
      catch { /* skip unreadable record */ }
    }
    return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}

function normalizeSubmission(submission) {
  if (!submission || typeof submission !== 'object') throw new FeedbackError(400, 'invalid-feedback', 'A feedback submission object is required.');
  const kind = KINDS.has(submission.kind) ? submission.kind : 'bug';
  const severity = SEVERITIES.has(submission.severity) ? submission.severity : 'medium';
  const title = cleanText(submission.title, 160);
  const whatHappened = cleanText(submission.whatHappened, 4_000);
  if (!title && !whatHappened) throw new FeedbackError(400, 'empty-feedback', 'Describe what happened, or give the report a title, before submitting.');
  return {
    kind,
    severity,
    title: title || whatHappened.slice(0, 80),
    whatHappened,
    expected: cleanText(submission.expected, 2_000),
    stepsToReproduce: cleanText(submission.stepsToReproduce, 3_000),
    aiClassification: cleanText(submission.aiClassification, 400),
    reporter: {
      name: cleanText(submission.reporter?.name, 120) || 'Anonymous expert',
      role: cleanText(submission.reporter?.role, 120),
    },
    context: sanitizeContext(submission.context),
    conversation: Array.isArray(submission.conversation)
      ? submission.conversation.slice(0, 40).map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: cleanText(m?.content, 4_000) }))
      : [],
  };
}

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return {};
  return {
    stage: cleanText(context.stage, 40),
    address: cleanText(context.address, 200),
    designFingerprint: cleanText(context.designFingerprint, 40),
    platformCount: Number.isFinite(context.platformCount) ? Math.trunc(context.platformCount) : null,
    stairCount: Number.isFinite(context.stairCount) ? Math.trunc(context.stairCount) : null,
    totalAreaSqM: Number.isFinite(context.totalAreaSqM) ? Math.round(context.totalAreaSqM * 10) / 10 : null,
    onScreenErrors: Array.isArray(context.onScreenErrors) ? context.onScreenErrors.slice(0, 12).map((e) => cleanText(e, 300)).filter(Boolean) : [],
    userAgent: cleanText(context.userAgent, 300),
    url: cleanText(context.url, 400),
  };
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export { ID_PATTERN as FEEDBACK_ID_PATTERN };
