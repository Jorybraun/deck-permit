export interface FeedbackContext {
  stage?: string;
  address?: string;
  designFingerprint?: string;
  platformCount?: number | null;
  stairCount?: number | null;
  totalAreaSqM?: number | null;
  onScreenErrors?: string[];
  userAgent?: string;
  url?: string;
}

export interface FeedbackChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type FeedbackKind = 'bug' | 'critique' | 'idea';
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface FeedbackDraft {
  title: string;
  kind: FeedbackKind;
  severity: FeedbackSeverity;
  whatHappened: string;
  expected: string;
  stepsToReproduce: string;
  aiClassification?: string;
}

export interface FeedbackSubmission extends FeedbackDraft {
  reporter: { name: string; role: string };
  context: FeedbackContext;
  conversation?: FeedbackChatMessage[];
}

export class FeedbackApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, init); }
  catch { throw new FeedbackApiError('The local API server is unavailable. Start it and try again.', 'api-unavailable'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new FeedbackApiError((body && body.message) || 'The request could not be completed.', (body && body.error) || 'request-failed');
  return body as T;
}

export async function fetchFeedbackCapabilities(): Promise<{ assistantConfigured: boolean }> {
  try { return await requestJson('/api/feedback/capabilities'); }
  catch { return { assistantConfigured: false }; }
}

export function assistFeedback(messages: FeedbackChatMessage[], context: FeedbackContext): Promise<{ reply: string }> {
  return requestJson('/api/feedback/assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  });
}

export function draftFeedback(messages: FeedbackChatMessage[], context: FeedbackContext): Promise<FeedbackDraft> {
  return requestJson('/api/feedback/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  });
}

export function submitFeedback(submission: FeedbackSubmission): Promise<{ id: string; createdAt: string }> {
  return requestJson('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
}
