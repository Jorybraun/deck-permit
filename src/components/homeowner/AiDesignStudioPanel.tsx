import { AlertTriangle, Bot, Check, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DeckDesign } from '../../domain/deckDesign';
import type { SiteModel } from '../../domain/siteModel';
import { fetchAiDesignCapabilities, platformProposalSummary, runAiDesignTeam, type AiDesignCapabilities, type AiDesignTeamResult } from '../../services/aiDesignStudio';
import type { HomeownerIntent } from '../../state/homeownerProjectStore';
import type { Property } from '../../types';

interface AiDesignStudioPanelProps { intent: HomeownerIntent; property: Property; site: SiteModel; design: DeckDesign; onApply: (design: DeckDesign) => void }

/** Proposal invocation, deterministic checks, and an independent review invocation before owner acceptance. */
export function AiDesignStudioPanel({ intent, property, site, design, onApply }: AiDesignStudioPanelProps) {
  const [capabilities, setCapabilities] = useState<AiDesignCapabilities | null>(null);
  const [goal, setGoal] = useState('Improve this layout for outdoor living, clear circulation, attractive proportions, practical stairs, and straightforward construction.');
  const [status, setStatus] = useState<'idle' | 'designing' | 'checking' | 'reviewing' | 'complete'>('idle');
  const [result, setResult] = useState<AiDesignTeamResult | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  useEffect(() => { let active = true; void fetchAiDesignCapabilities().then((value) => { if (active) setCapabilities(value); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'AI capabilities are unavailable.'); }); return () => { active = false; }; }, []);
  const run = async () => {
    setError(''); setResult(null); setApplied(false); setStatus('designing');
    const checkTimer = window.setTimeout(() => setStatus('checking'), 900);
    const reviewTimer = window.setTimeout(() => setStatus('reviewing'), 1800);
    try { const next = await runAiDesignTeam({ goal, intent, property, site, design }); setResult(next); setStatus('complete'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The AI design team could not finish.'); setStatus('idle'); }
    finally { window.clearTimeout(checkTimer); window.clearTimeout(reviewTimer); }
  };
  const configured = capabilities?.configured === true;
  const busy = status !== 'idle' && status !== 'complete';
  const blockedCount = result?.independentReview.findings.filter((finding) => finding.severity === 'blocked').length || 0;

  return <section className="border-b border-violet-200 bg-violet-50/40 p-5" aria-labelledby="ai-design-studio-title">
    <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-800"><Sparkles size={17} /></span><div><h3 id="ai-design-studio-title" className="text-sm font-bold text-slate-950">AI design team</h3><p className="mt-1 text-[10px] leading-4 text-slate-600">Designer AI proposes a separate editable revision. Deterministic engines check it. An independent reviewer AI critiques it and cites those checks.</p></div></div>
    {capabilities && <div className={`mt-3 rounded-lg border p-3 ${configured ? 'border-violet-200 bg-white' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.08em]"><span className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />{configured ? 'Cerebras design team available' : 'AI server not configured'}</div><p className="mt-1 text-[9px] leading-4 text-slate-600">{configured ? `Designer ${capabilities.designModel} · reviewer ${capabilities.reviewModel} · photos ${capabilities.photoModel} (${capabilities.photoBatchSize}/request; ${capabilities.photoSelectionLimit} selected max)` : 'Add CEREBRAS_API_KEY to .env.local and restart the API server. The key remains server-only.'}</p></div>}
    <label className="mt-3 grid gap-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-slate-500">What should the design team improve?<textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={3} disabled={busy} className="rounded-lg border border-slate-300 bg-white p-3 text-xs font-normal normal-case leading-5 tracking-normal text-slate-800 disabled:opacity-60" /></label>
    <button type="button" onClick={() => void run()} disabled={!configured || busy || !goal.trim()} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-800 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}{statusLabel(status)}</button>
    {busy && <ol className="mt-3 grid grid-cols-3 gap-1 text-center text-[8px] font-bold uppercase tracking-[.06em] text-slate-500"><ProgressStep label="Propose" active={status === 'designing'} done={status !== 'designing'} /><ProgressStep label="Machine checks" active={status === 'checking'} done={status === 'reviewing'} /><ProgressStep label="Independent review" active={status === 'reviewing'} done={false} /></ol>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[10px] leading-4 text-red-900">{error}</p>}
    {result && <div className="mt-4 grid gap-3">
      <article className="rounded-xl border border-violet-200 bg-white p-3"><span className="text-[8px] font-bold uppercase tracking-[.1em] text-violet-700">Proposed revision · not applied</span><h4 className="mt-1 text-sm font-bold text-slate-950">{result.proposal.title}</h4><p className="mt-1 text-[10px] leading-4 text-slate-600">{result.proposal.homeownerSummary}</p><ul className="mt-2 grid gap-1 text-[9px] text-slate-600">{result.proposal.platforms.map((platform, index) => <li key={`${platform.name}-${index}`}>• {platformProposalSummary(platform)}</li>)}{result.proposal.stairs.map((stair, index) => <li key={`${stair.name}-${index}`}>• {stair.name} · {stair.widthMm} mm wide · {stair.handrailSides} handrail</li>)}</ul>{result.proposal.unresolved.length > 0 && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2"><strong className="block text-[8px] uppercase tracking-[.08em] text-amber-900">Unresolved before professional review</strong><ul className="mt-1 grid gap-1 text-[8px] leading-3 text-amber-900">{result.proposal.unresolved.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}</ul></div>}</article>
      <article className={`rounded-xl border p-3 ${blockedCount ? 'border-red-200 bg-red-50' : result.independentReview.verdict === 'candidate-ready-for-professional-review' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0" /><div><span className="text-[8px] font-bold uppercase tracking-[.1em]">Independent AI review · {result.independentReview.verdict.replace(/-/g, ' ')}</span><p className="mt-1 text-[10px] leading-4">{result.independentReview.summary}</p></div></div>{result.independentReview.findings.length > 0 && <ul className="mt-2 grid gap-2">{result.independentReview.findings.slice(0, 6).map((finding, index) => <li key={`${finding.checkId}-${index}`} className="rounded-lg bg-white/80 p-2 text-[9px] leading-4"><strong className="block uppercase">{finding.severity} · {finding.category}</strong>{finding.message}<span className="block font-semibold text-slate-500">{finding.ruleId || finding.checkId} · {finding.requiredAction}</span></li>)}</ul>}<p className="mt-2 border-t border-current/10 pt-2 text-[8px] leading-3 opacity-75">This is an AI critique, not an approval. Deterministic failures remain controlling and professional review is still required.</p></article>
      <button type="button" onClick={() => { onApply(result.canonicalDesign); setApplied(true); }} disabled={applied} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-3 text-xs font-bold text-violet-900 disabled:opacity-60"><Check size={14} />{applied ? 'Applied · use Undo to restore' : 'Apply as editable draft'}</button>
    </div>}
    <div className="mt-3 flex gap-2 text-[8px] leading-3 text-slate-500"><AlertTriangle size={12} className="shrink-0" /><span>No AI can label the project code compliant or permit ready. The professional and municipality gates remain unchanged.</span></div>
  </section>;
}

function ProgressStep({ label, active, done }: { label: string; active: boolean; done: boolean }) { return <li className={`rounded-md border px-1 py-2 ${active ? 'border-violet-400 bg-white text-violet-900' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50'}`}>{done ? '✓ ' : ''}{label}</li>; }
function statusLabel(status: 'idle' | 'designing' | 'checking' | 'reviewing' | 'complete') { return ({ idle: 'Generate and independently review', designing: 'Designer is creating a revision…', checking: 'Running deterministic checks…', reviewing: 'Independent reviewer is auditing…', complete: 'Generate another revision' })[status]; }
