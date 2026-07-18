import { useState } from 'react';
import { CheckCircle2, Clipboard, ExternalLink, FileCheck2, RefreshCw, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { CanonicalReviewIssue } from '../../services/canonicalReviewIssue';
import { getOwnerExchange, publishReviewExchange, reviewPdfFile } from '../../services/reviewExchange';
import { saveReviewEvidenceFile } from '../../services/reviewEvidenceStorage';
import { createProfessionalReviewCycle, currentResolution, unansweredRequiredRedlines } from '../../services/reviewRedlines';
import type { ProfessionalReviewCycle, ReviewExchangePublication, ReviewRedlineResolution, VerificationEvidence } from '../../types';

interface CanonicalReviewPanelProps {
  issue: CanonicalReviewIssue;
  publication: ReviewExchangePublication | null;
  reviewCycles: ProfessionalReviewCycle[];
  verificationEvidence: VerificationEvidence[];
  onPublish: (publication: ReviewExchangePublication) => void;
  onImportReview: (evidence: VerificationEvidence, cycle: ProfessionalReviewCycle) => void;
  onResolveRedline: (input: { cycleId: string; redlineId: string; targetDesignFingerprint: string; disposition: ReviewRedlineResolution['disposition']; response: string }) => void;
}

/** Owner-facing bridge from one immutable canonical issue to a private professional decision. */
export function CanonicalReviewPanel({ issue, publication, reviewCycles, verificationEvidence, onPublish, onImportReview, onResolveRedline }: CanonicalReviewPanelProps) {
  const [busy, setBusy] = useState<'publish' | 'check' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fingerprint = issue.manifest.designFingerprint;
  const currentPublication = publication?.designFingerprint === fingerprint ? publication : null;
  const acceptedReview = verificationEvidence.find((item) => item.kind === 'sealed-structural-review' && item.decision === 'accepted' && item.designFingerprint === fingerprint);
  const currentChangeRequest = reviewCycles.find((cycle) => cycle.sourceDesignFingerprint === fingerprint && cycle.decision === 'changes-requested');
  const unanswered = unansweredRequiredRedlines(reviewCycles);

  const publish = async () => {
    if (unanswered.length) return setError(`Respond to ${unanswered.length} required professional redline${unanswered.length === 1 ? '' : 's'} before issuing another review revision.`);
    setBusy('publish'); setError(''); setMessage('');
    try {
      const next = await publishReviewExchange(issue.reviewPackage);
      onPublish(next);
      setMessage(`Revision ${issue.manifest.revision} published. The private reviewer link is ready to share.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The professional review package could not be published.'); }
    finally { setBusy(null); }
  };

  const check = async () => {
    if (!currentPublication) return;
    setBusy('check'); setError(''); setMessage('');
    try {
      const result = await getOwnerExchange(currentPublication);
      if (!result.review) setMessage('No professional decision has been submitted for this revision yet.');
      else {
        const { pdfBase64: _pdfBase64, redlines: _redlines, ...evidence } = result.review;
        await saveReviewEvidenceFile(evidence.id, reviewPdfFile(result.review));
        onImportReview(evidence, createProfessionalReviewCycle({ exchangeProjectId: currentPublication.projectId, review: result.review }));
        setMessage(evidence.decision === 'accepted'
          ? `Accepted professional review imported for ${evidence.designFingerprint}.`
          : `Change request imported with ${result.review.redlines.length} sheet redline${result.review.redlines.length === 1 ? '' : 's'}.`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The professional review status could not be checked.'); }
    finally { setBusy(null); }
  };

  const copy = async () => {
    if (!currentPublication) return;
    try { await navigator.clipboard.writeText(currentPublication.reviewerUrl); setMessage('Private reviewer link copied.'); setError(''); }
    catch { setError('Copy was blocked. Select the reviewer link below and copy it manually.'); }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="professional-review-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><span className="text-[10px] font-bold uppercase tracking-[.13em] text-emerald-700">Revision-bound handoff</span><h3 id="professional-review-heading" className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-950"><ShieldCheck size={19} className="text-emerald-700" /> Professional review</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Publish the exact model, drawings, checks, assumptions, and open work packages to a private architect or engineer portal. Their sealed decision remains bound to this fingerprint and cannot silently follow later edits.</p></div>
      <span className="rounded-full bg-slate-100 px-3 py-1.5 font-mono text-[10px] font-bold text-slate-700">REV {issue.manifest.revision} · {fingerprint}</span>
    </div>

    <ol className="mt-5 grid gap-2 sm:grid-cols-3">
      <ReviewStep number="1" label="Publish immutable issue" complete={Boolean(currentPublication)} />
      <ReviewStep number="2" label="Professional reviews and redlines" complete={Boolean(acceptedReview || currentChangeRequest)} />
      <ReviewStep number="3" label="Import sealed decision" complete={Boolean(acceptedReview)} />
    </ol>

    {acceptedReview ? <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 size={20} className="mt-0.5 shrink-0" /><div><strong className="text-sm">Accepted review recorded for this exact revision</strong><p className="mt-1 text-xs leading-5">{acceptedReview.issuerName} · {acceptedReview.issuerRole} {acceptedReview.licenseNumber || ''} · recorded {new Date(acceptedReview.recordedAt).toLocaleDateString()}. This records professional evidence; municipal acceptance and required field reviews remain separate.</p></div></div>
      : currentChangeRequest ? <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><TriangleAlert size={20} className="mt-0.5 shrink-0" /><div><strong className="text-sm">Changes requested for this revision</strong><p className="mt-1 text-xs leading-5">Respond to every required sheet redline below, update the model where necessary, regenerate framing, and publish a new fingerprint for review.</p></div></div>
        : null}

    {!currentPublication ? <button type="button" onClick={() => void publish()} disabled={busy !== null || Boolean(acceptedReview)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-40"><Send size={16} /> {busy === 'publish' ? 'Publishing review issue…' : acceptedReview ? 'Current revision accepted' : `Create private reviewer link · Rev ${issue.manifest.revision}`}</button> : <div className="mt-4 grid gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm text-blue-950">Private reviewer portal is active</strong><p className="mt-0.5 text-[10px] text-blue-800">Expires {new Date(currentPublication.expiresAt).toLocaleString()} · anyone holding this capability link can submit the professional decision.</p></div><a href={currentPublication.reviewerUrl} target="_blank" rel="noreferrer" className="flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 text-xs font-bold text-blue-900">Open portal <ExternalLink size={13} /></a></div>
      <input aria-label="Private professional reviewer link" readOnly value={currentPublication.reviewerUrl} className="min-h-10 w-full rounded-lg border border-blue-200 bg-white px-3 font-mono text-[10px] text-slate-700" />
      <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void copy()} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white text-xs font-bold text-blue-900"><Clipboard size={14} /> Copy reviewer link</button><button type="button" onClick={() => void check()} disabled={busy !== null} className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-900 text-xs font-bold text-white disabled:opacity-50"><RefreshCw size={14} className={busy === 'check' ? 'animate-spin' : ''} /> {busy === 'check' ? 'Checking…' : 'Check and import decision'}</button></div>
    </div>}

    {unanswered.length > 0 && <div className="mt-5 border-t border-slate-200 pt-5"><h4 className="text-sm font-bold text-slate-950">Required professional redline responses</h4><p className="mt-1 text-xs leading-5 text-slate-600">These responses are coordination records, not professional acceptance. A changed design must receive a new accepted decision.</p><div className="mt-3 grid gap-3">{unanswered.map(({ cycle, redline }) => <RedlineResponse key={`${cycle.id}:${redline.id}`} cycle={cycle} redline={redline} targetFingerprint={fingerprint} onResolve={onResolveRedline} onError={setError} />)}</div></div>}

    {message && <div role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900"><FileCheck2 size={15} className="mt-0.5 shrink-0" />{message}</div>}
    {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{error}</div>}
  </section>;
}

function ReviewStep({ number, label, complete }: { number: string; label: string; complete: boolean }) {
  return <li className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 ${complete ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${complete ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'}`}>{complete ? <CheckCircle2 size={15} /> : number}</span><span className="text-xs font-bold text-slate-800">{label}</span></li>;
}

function RedlineResponse({ cycle, redline, targetFingerprint, onResolve, onError }: {
  cycle: ProfessionalReviewCycle;
  redline: ProfessionalReviewCycle['redlines'][number];
  targetFingerprint: string;
  onResolve: CanonicalReviewPanelProps['onResolveRedline'];
  onError: (message: string) => void;
}) {
  const canClaimRevisionChange = targetFingerprint !== cycle.sourceDesignFingerprint;
  const [disposition, setDisposition] = useState<ReviewRedlineResolution['disposition']>(canClaimRevisionChange ? 'addressed-in-revision' : 'response-only');
  const [response, setResponse] = useState('');
  const existing = currentResolution(cycle, redline.id, targetFingerprint);
  if (existing) return <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950"><strong>{redline.sheetId} · {redline.title}</strong><p className="mt-1">{existing.disposition.replace(/-/g, ' ')} — {existing.response}</p></div>;
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-[9px] font-bold uppercase tracking-[.1em] text-amber-700">{redline.sheetId} · {redline.category}</span><strong className="mt-1 block text-xs text-amber-950">{redline.title}</strong></div><span className="rounded-full bg-amber-200 px-2 py-1 text-[8px] font-bold uppercase text-amber-950">required</span></div><p className="mt-2 text-xs leading-5 text-amber-900">{redline.comment}</p><div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]"><select aria-label={`Disposition for ${redline.title}`} value={disposition} onChange={(event) => setDisposition(event.target.value as ReviewRedlineResolution['disposition'])} className="min-h-10 rounded-lg border border-amber-300 bg-white px-2 text-xs"><option value="response-only">Response only</option>{canClaimRevisionChange && <option value="addressed-in-revision">Addressed in new revision</option>}</select><input aria-label={`Response to ${redline.title}`} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Describe exactly what changed or why…" className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 text-xs" /><button type="button" onClick={() => { try { onResolve({ cycleId: cycle.id, redlineId: redline.id, targetDesignFingerprint: targetFingerprint, disposition, response }); onError(''); } catch (reason) { onError(reason instanceof Error ? reason.message : 'The redline response could not be recorded.'); } }} className="min-h-10 rounded-lg bg-amber-900 px-4 text-xs font-bold text-white">Record response</button></div></div>;
}
