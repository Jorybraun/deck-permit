import { Bot, Loader2, SendHorizontal, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { discussDesignPlan, type DesignChatMessage } from '../../services/aiDesignStudio';

const REVIEW_PROMPT = 'Review my deck plan: what is missing, what might fail permit, and the single most useful change to make. Then invite me to ask a follow-up.';
const QUICK_PROMPTS = ['Will it pass permit?', 'Can I make it bigger?', 'What is missing?', 'Cheapest fix?'];

/**
 * Conversational review of the homeowner's OWN plan, shown as a summonable overlay so it
 * stays out of the way. It reviews what you drew rather than designing it for you, and only
 * calls the AI once you actually open it.
 */
export function DesignReviewChat({ grounding, hasDesign, open, onClose }: { grounding: string; hasDesign: boolean; open: boolean; onClose: () => void }) {
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

  // Only reach out to the AI once the homeowner actually opens the advisor on a real plan.
  useEffect(() => {
    if (open && hasDesign && !started.current) { started.current = true; void send(REVIEW_PROMPT); }
  }, [open, hasDesign]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, busy, open]);

  if (!open) return null;
  return <section aria-label="Discuss your plan" className="absolute bottom-20 left-4 z-30 flex w-[min(380px,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" style={{ maxHeight: 'min(70%, 560px)' }}>
    <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-100 text-violet-800"><Sparkles size={15} /></span>
      <div className="flex-1"><h3 className="text-sm font-bold text-slate-900">Discuss your plan</h3><p className="text-[10px] leading-3 text-slate-500">Reviews what you drew — grounded in your live checks + Sidney code.</p></div>
      <button type="button" onClick={onClose} aria-label="Close advisor" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-300 text-slate-500 hover:bg-slate-100"><X size={15} /></button>
    </header>

    {!hasDesign ? <p className="m-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs leading-5 text-slate-500">Draw a deck platform and I'll review it — what's missing, what might fail permit, and what I'd change.</p> : <>
      <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.filter((message) => message.content !== REVIEW_PROMPT).map((message, index) => <div key={index} className={`rounded-xl px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'self-end bg-violet-600 text-white' : 'self-start border border-slate-200 bg-slate-50 text-slate-800'}`} style={{ maxWidth: '90%' }}>{message.content}</div>)}
        {busy && <div className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> {messages.length <= 1 ? 'Reviewing your plan…' : 'Thinking…'}</div>}
      </div>
      <div className="border-t border-slate-200 p-3">
        {error && <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-900">{error}</p>}
        {messages.some((message) => message.role === 'assistant') && !busy && <div className="mb-2 flex flex-wrap gap-1.5">{QUICK_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => void send(prompt)} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-800">{prompt}</button>)}</div>}
        <form className="flex items-end gap-1.5" onSubmit={(event) => { event.preventDefault(); const text = input.trim(); if (text && !busy) void send(text); }}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); const text = input.trim(); if (text && !busy) void send(text); } }} rows={1} placeholder="Ask about your plan…" className="min-h-10 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-violet-400" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-700 text-white disabled:opacity-40"><SendHorizontal size={15} /></button>
        </form>
        <p className="mt-1.5 flex items-center gap-1 text-[9px] leading-3 text-slate-400"><Bot size={10} /> A helper, not a permit approval — the Town has final say.</p>
      </div>
    </>}
  </section>;
}
