import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bug, MessageSquare, Send, Sparkles, X } from 'lucide-react';
import {
  assistFeedback,
  draftFeedback,
  fetchFeedbackCapabilities,
  submitFeedback,
  type FeedbackChatMessage,
  type FeedbackContext,
  type FeedbackKind,
  type FeedbackSeverity,
} from '../../services/feedback';

interface FeedbackWidgetProps {
  context: FeedbackContext;
}

type Tab = 'guided' | 'ai';

const EMPTY_FORM = {
  name: '',
  role: '',
  kind: 'bug' as FeedbackKind,
  severity: 'medium' as FeedbackSeverity,
  whatHappened: '',
  expected: '',
  stepsToReproduce: '',
  aiClassification: '',
};

const KINDS: Array<{ value: FeedbackKind; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'critique', label: 'Design critique' },
  { value: 'idea', label: 'Idea' },
];

const SEVERITIES: Array<{ value: FeedbackSeverity; label: string }> = [
  { value: 'low', label: 'Low — cosmetic' },
  { value: 'medium', label: 'Medium — annoying' },
  { value: 'high', label: 'High — blocks a task' },
  { value: 'critical', label: 'Critical — wrong/unsafe output' },
];

/** Floating expert-feedback capture: a guided bug-report form plus an app-aware AI intake chat. */
export function FeedbackWidget({ context }: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('guided');
  const [form, setForm] = useState(EMPTY_FORM);
  const [assistantConfigured, setAssistantConfigured] = useState(false);
  const [messages, setMessages] = useState<FeedbackChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchFeedbackCapabilities().then((caps) => setAssistantConfigured(caps.assistantConfigured));
  }, []);

  useEffect(() => {
    if (open && tab === 'ai') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, tab]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const resetAndClose = () => {
    setOpen(false);
    setSubmittedId(null);
    setError(null);
  };

  const fullContext = (): FeedbackContext => ({
    ...context,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    url: typeof window === 'undefined' ? '' : window.location.href,
  });

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setChatInput('');
    setChatBusy(true);
    setError(null);
    try {
      const { reply } = await assistFeedback(next, fullContext());
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The AI helper could not respond.');
    } finally {
      setChatBusy(false);
    }
  };

  const draftFromChat = async () => {
    if (!messages.length || drafting) return;
    setDrafting(true);
    setError(null);
    try {
      const draft = await draftFeedback(messages, fullContext());
      setForm((current) => ({
        ...current,
        kind: draft.kind,
        severity: draft.severity,
        whatHappened: draft.whatHappened,
        expected: draft.expected,
        stepsToReproduce: draft.stepsToReproduce,
        aiClassification: draft.aiClassification || '',
      }));
      setTab('guided');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not draft the report. Fill the form manually.');
    } finally {
      setDrafting(false);
    }
  };

  const submit = async () => {
    if (submitting) return;
    if (!form.whatHappened.trim()) {
      setError('Add a short description of what happened before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitFeedback({
        title: form.whatHappened.trim().slice(0, 80),
        kind: form.kind,
        severity: form.severity,
        whatHappened: form.whatHappened,
        expected: form.expected,
        stepsToReproduce: form.stepsToReproduce,
        aiClassification: form.aiClassification,
        reporter: { name: form.name, role: form.role },
        context: fullContext(),
        conversation: messages,
      });
      setSubmittedId(result.id);
      setForm(EMPTY_FORM);
      setMessages([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a bug or give feedback"
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
        style={{ background: 'var(--forest)', boxShadow: '0 8px 24px rgba(23,79,58,.28)' }}
      >
        <Bug size={16} /> Report a bug
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-end p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Feedback">
      <button type="button" aria-label="Close feedback" className="absolute inset-0 bg-black/30" onClick={resetAndClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: 'var(--forest)' }}><Bug size={16} /></span>
            <div>
              <div className="text-sm font-semibold text-ink">Report a bug / give feedback</div>
              <div className="text-xs text-muted">Goes straight to the build team</div>
            </div>
          </div>
          <button type="button" onClick={resetAndClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-line"><X size={18} /></button>
        </div>

        {submittedId ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full text-white" style={{ background: 'var(--forest)' }}><Sparkles size={22} /></span>
            <div className="text-lg font-semibold text-ink">Thank you — report filed</div>
            <p className="text-sm text-muted">Reference <span className="font-mono">{submittedId}</span>. The team will investigate and follow up. The screen and design context were attached automatically.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setSubmittedId(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold text-ink" style={{ borderColor: 'var(--line)' }}>File another</button>
              <button type="button" onClick={resetAndClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--forest)' }}>Done</button>
            </div>
          </div>
        ) : (
          <>
            {/* context banner */}
            <div className="flex flex-wrap gap-1.5 px-5 py-2.5 text-[11px]" style={{ background: 'var(--mint)' }}>
              <ContextChip label="Screen" value={context.stage || 'app'} />
              {context.address ? <ContextChip label="Address" value={context.address} /> : null}
              {typeof context.platformCount === 'number' ? <ContextChip label="Platforms" value={String(context.platformCount)} /> : null}
              {context.designFingerprint ? <ContextChip label="Fingerprint" value={context.designFingerprint} /> : null}
            </div>

            {/* tabs */}
            <div className="flex gap-1 border-b px-3 pt-2" style={{ borderColor: 'var(--line)' }}>
              <TabButton active={tab === 'guided'} onClick={() => setTab('guided')} icon={<Bug size={14} />} label="Guided form" />
              <TabButton active={tab === 'ai'} onClick={() => setTab('ai')} icon={<MessageSquare size={14} />} label="Talk it through with AI" disabled={!assistantConfigured} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {error ? <div className="mb-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--orange)', color: 'var(--orange)', background: '#fdf1ea' }}>{error}</div> : null}

              {tab === 'guided' ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Your name">
                      <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Dana Wright" className="fb-input" />
                    </Field>
                    <Field label="Your role">
                      <input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="e.g. Structural engineer" className="fb-input" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type">
                      <select value={form.kind} onChange={(e) => set('kind', e.target.value as FeedbackKind)} className="fb-input">
                        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Severity">
                      <select value={form.severity} onChange={(e) => set('severity', e.target.value as FeedbackSeverity)} className="fb-input">
                        {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="What happened?" hint="Be specific — include exact numbers or the address you used.">
                    <textarea value={form.whatHappened} onChange={(e) => set('whatHappened', e.target.value)} rows={3} placeholder="e.g. On the Permit screen, the installed cost showed $40,300 for a small 20 m² pressure-treated deck — that's about 3× too high." className="fb-input" />
                  </Field>
                  <Field label="What did you expect?">
                    <textarea value={form.expected} onChange={(e) => set('expected', e.target.value)} rows={2} placeholder="e.g. A basic PT deck that size should land around $6,000–11,000 installed." className="fb-input" />
                  </Field>
                  <Field label="Steps to reproduce" hint="How would someone see this again?">
                    <textarea value={form.stepsToReproduce} onChange={(e) => set('stepsToReproduce', e.target.value)} rows={3} placeholder={'e.g.\n1. Enter 9512 Lochside Dr, Sidney\n2. Draw one 4×5 m platform\n3. Go to Permit → read the installed cost'} className="fb-input" />
                  </Field>
                  {form.aiClassification ? (
                    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--mint)', color: 'var(--forest)' }}>
                      <strong>AI pre-classification:</strong> {form.aiClassification}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.length === 0 ? (
                    <div className="rounded-xl px-4 py-4 text-sm text-muted" style={{ background: 'var(--canvas)' }}>
                      <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink"><Sparkles size={14} style={{ color: 'var(--forest)' }} /> Just describe what you saw</div>
                      I know how the app works and what you're looking at. Tell me in plain words — I'll ask a couple of questions and turn it into a clean bug report.
                    </div>
                  ) : null}
                  {messages.map((m, i) => (
                    <div key={i} className={m.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[90%]'}>
                      <div className={`rounded-2xl px-3.5 py-2 text-sm ${m.role === 'user' ? 'text-white' : 'text-ink'}`} style={m.role === 'user' ? { background: 'var(--forest)' } : { background: 'var(--canvas)' }}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatBusy ? <div className="self-start text-xs text-muted">thinking…</div> : null}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* footer actions */}
            <div className="border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
              {tab === 'ai' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
                      placeholder="Describe what happened…"
                      className="fb-input flex-1"
                    />
                    <button type="button" onClick={() => void sendChat()} disabled={chatBusy || !chatInput.trim()} aria-label="Send" className="grid h-10 w-10 place-items-center rounded-lg text-white disabled:opacity-40" style={{ background: 'var(--forest)' }}><Send size={16} /></button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{messages.length ? 'Ready when you are.' : 'Powered by your Cerebras key.'}</span>
                    <button type="button" onClick={() => void draftFromChat()} disabled={!messages.length || drafting} className="rounded-lg border px-3 py-2 text-sm font-semibold text-ink disabled:opacity-40" style={{ borderColor: 'var(--line)' }}>{drafting ? 'Drafting…' : 'Draft the report →'}</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">Context is attached automatically.</span>
                  <button type="button" onClick={() => void submit()} disabled={submitting} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--forest)' }}>{submitting ? 'Submitting…' : 'Submit report'}</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, disabled }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Add a Cerebras key on the server to enable the AI helper' : undefined}
      className="flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
      style={active ? { color: 'var(--forest)', borderBottom: '2px solid var(--forest)' } : { color: 'var(--muted)' }}
    >
      {icon} {label}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink">{label}{hint ? <span className="ml-1.5 font-normal text-muted">— {hint}</span> : null}</span>
      {children}
    </label>
  );
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full bg-white/70 px-2 py-0.5" style={{ color: 'var(--forest)' }}>
      <span className="font-semibold">{label}:</span> {value}
    </span>
  );
}
