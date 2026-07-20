import { Bot, Loader2, SendHorizontal, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { discussDesignPlan, type DesignChatMessage } from '../../services/aiDesignStudio';

const REVIEW_PROMPT = 'Review my deck plan: what is missing, what might fail permit, and the single most useful change to make. Then invite me to ask a follow-up.';
const QUICK_PROMPTS = ['Will it pass permit?', 'Can I make it bigger?', 'What is missing?', 'Cheapest fix?'];

/**
 * Conversational review of the homeowner's OWN plan. It opens with a grounded critique and
 * takes follow-up questions — the AI reviews what you drew rather than designing it for you.
 */
export function DesignReviewChat({ grounding, hasDesign }: { grounding: string; hasDesign: boolean }) {
  const [messages, setMessages] = useState<DesignChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const groundingRef = useRef(grounding);
  groundingRef.current = grounding;

  const send = async (text: string) => {
    const next: DesignChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const { reply } = await discussDesignPlan({ grounding: groundingRef.current, messages: next });
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  // Open with a grounded review once there is a plan to talk about.
  useEffect(() => {
    if (hasDesign && !started.current) { started.current = true; void send(REVIEW_PROMPT); }
  }, [hasDesign]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, busy]);

  return <section className="border-b border-slate-200 p-4" aria-label="Discuss your plan">
    <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-100 text-violet-800"><Sparkles size={15} /></span><div><h3 className="text-sm font-bold text-slate-900">Discuss your plan</h3><p className="text-[10px] leading-3 text-slate-500">An advisor reviews what you drew — grounded in your live checks + Sidney code.</p></div></div>

    {!hasDesign ? <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs leading-5 text-slate-500">Draw a deck platform and I'll review it — what's missing, what might fail permit, and what I'd change.</p> : <>
      <div ref={scrollRef} className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
        {messages.filter((message) => message.content !== REVIEW_PROMPT).map((message, index) => <div key={index} className={`rounded-xl px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'self-end bg-violet-600 text-white' : 'self-start border border-slate-200 bg-slate-50 text-slate-800'}`} style={{ maxWidth: '90%' }}>{message.content}</div>)}
        {busy && <div className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> {messages.length <= 1 ? 'Reviewing your plan…' : 'Thinking…'}</div>}
      </div>
      {error && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-900">{error}</p>}

      {messages.some((message) => message.role === 'assistant') && !busy && <div className="mt-2 flex flex-wrap gap-1.5">{QUICK_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => void send(prompt)} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-800">{prompt}</button>)}</div>}

      <form className="mt-2 flex items-end gap-1.5" onSubmit={(event) => { event.preventDefault(); const text = input.trim(); if (text && !busy) void send(text); }}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); const text = input.trim(); if (text && !busy) void send(text); } }} rows={1} placeholder="Ask about your plan…" className="min-h-10 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-violet-400" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-700 text-white disabled:opacity-40"><SendHorizontal size={15} /></button>
      </form>
      <p className="mt-1.5 flex items-center gap-1 text-[9px] leading-3 text-slate-400"><Bot size={10} /> A helper, not a permit approval — the Town has final say.</p>
    </>}
  </section>;
}
