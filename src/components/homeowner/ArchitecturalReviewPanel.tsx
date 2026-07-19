import { useState } from 'react';
import { Building2, CheckCircle2, Clipboard, ExternalLink, FileCheck2, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import type { CanonicalReviewIssue } from '../../services/canonicalReviewIssue';
import { getOwnerExchange, publishReviewExchange, reviewPackageForDiscipline, reviewPdfFile } from '../../services/reviewExchange';
import { saveReviewEvidenceFile } from '../../services/reviewEvidenceStorage';
import { createProfessionalReviewCycle, unansweredRequiredRedlines } from '../../services/reviewRedlines';
import type { ProfessionalReviewCycle, ReviewExchangePublication, ReviewRedlineResolution, VerificationEvidence } from '../../types';
import { RedlineResponse } from './CanonicalReviewPanel';

interface ArchitecturalReviewPanelProps {
  issue: CanonicalReviewIssue;
  publication: ReviewExchangePublication | null;
  reviewCycles: ProfessionalReviewCycle[];
  verificationEvidence: VerificationEvidence[];
  onPublish: (publication: ReviewExchangePublication) => void;
  onImportReview: (evidence: VerificationEvidence, cycle: ProfessionalReviewCycle) => void;
  onResolveRedline: (input: { cycleId: string; redlineId: string; targetDesignFingerprint: string; disposition: ReviewRedlineResolution['disposition']; response: string }) => void;
}

/** Optional Architect AIBC coordination and sealed-issue record; never substitutes for structural engineering. */
export function ArchitecturalReviewPanel({ issue, publication, reviewCycles, verificationEvidence, onPublish, onImportReview, onResolveRedline }: ArchitecturalReviewPanelProps) {
  const [busy, setBusy] = useState<'publish' | 'check' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fingerprint = issue.manifest.designFingerprint;
  const currentPublication = publication?.designFingerprint === fingerprint && publication.discipline === 'architectural' ? publication : null;
  const architecturalCycles = reviewCycles.filter((cycle) => cycle.professionalDiscipline === 'architectural');
  const acceptedReview = verificationEvidence.find((item) => item.kind === 'sealed-architectural-review' && item.decision === 'accepted' && item.designFingerprint === fingerprint && item.issuerRole === 'architect' && item.professionalDiscipline === 'architectural' && item.professionalRegistry === 'aibc' && item.practiceAuthorization === 'aibc-certificate-of-practice-confirmed-by-user' && Boolean(item.firmName));
  const currentChangeRequest = architecturalCycles.find((cycle) => cycle.sourceDesignFingerprint === fingerprint && cycle.decision === 'changes-requested');
  const unanswered = unansweredRequiredRedlines(architecturalCycles);

  const publish = async () => {
    if (unanswered.length) return setError(`Respond to ${unanswered.length} required architectural redline${unanswered.length === 1 ? '' : 's'} before issuing another review revision.`);
    setBusy('publish'); setError(''); setMessage('');
    try {
      const next = await publishReviewExchange(reviewPackageForDiscipline(issue.reviewPackage, 'architectural'));
      onPublish(next);
      setMessage(`Architectural coordination issue ${issue.manifest.revision} published for ${fingerprint}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The architectural review package could not be published.'); }
    finally { setBusy(null); }
  };

  const check = async () => {
    if (!currentPublication) return;
    setBusy('check'); setError(''); setMessage('');
    try {
      const result = await getOwnerExchange(currentPublication);
      if (!result.review) setMessage('No Architect AIBC decision has been submitted for this revision yet.');
      else {
        const { pdfBase64: _pdfBase64, redlines: _redlines, ...evidence } = result.review;
        await saveReviewEvidenceFile(evidence.id, reviewPdfFile(result.review));
        onImportReview(evidence, createProfessionalReviewCycle({ exchangeProjectId: currentPublication.projectId, review: result.review }));
        setMessage(evidence.decision === 'accepted'
          ? `Accepted Architect AIBC coordination review imported for ${evidence.designFingerprint}.`
          : `Architectural change request imported with ${result.review.redlines.length} sheet redline${result.review.redlines.length === 1 ? '' : 's'}.`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The architectural review status could not be checked.'); }
    finally { setBusy(null); }
  };

  const copy = async () => {
    if (!currentPublication) return;
    try { await navigator.clipboard.writeText(currentPublication.reviewerUrl); setMessage('Private Architect AIBC link copied.'); setError(''); }
    catch { setError('Copy was blocked. Select the reviewer link below and copy it manually.'); }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="architectural-review-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><span className="text-[10px] font-bold uppercase tracking-[.13em] text-blue-700">Optional multidisciplinary review</span><h3 id="architectural-review-heading" className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-950"><Building2 size={19} className="text-blue-700" /> Architect AIBC coordination</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Invite an Architect AIBC to review and, if they accept responsibility, return a sealed PDF for this exact drawing issue. The portal verifies the recorded architect and active Certificate-of-Practice firm separately from the structural engineer.</p></div>
      <span className="rounded-full bg-slate-100 px-3 py-1.5 font-mono text-[10px] font-bold text-slate-700">REV {issue.manifest.revision} · {fingerprint}</span>
    </div>
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950"><strong>Scope rule:</strong> an architectural Letter of Assurance is not automatically Code-required for an ordinary Part 9 deck. This lane is available for requested architectural coordination or an authority-specific requirement. It never resolves structural work packages.</div>

    <ol className="mt-5 grid gap-2 sm:grid-cols-3">
      <ReviewStep number="1" label="Publish architectural issue" complete={Boolean(currentPublication)} />
      <ReviewStep number="2" label="Architect reviews and redlines" complete={Boolean(acceptedReview || currentChangeRequest)} />
      <ReviewStep number="3" label="Import sealed decision" complete={Boolean(acceptedReview)} />
    </ol>

    {acceptedReview ? <div className="mt-4 rounded-xl border border-blue-300 bg-blue-50 p-4 text-blue-950"><div className="flex items-start gap-3"><CheckCircle2 size={20} className="mt-0.5 shrink-0" /><div><strong className="text-sm">Accepted Architect AIBC coordination recorded for this exact revision</strong><p className="mt-1 text-xs leading-5">{acceptedReview.issuerName} · Architect AIBC {acceptedReview.licenseNumber || ''} · {acceptedReview.firmName} · recorded {new Date(acceptedReview.recordedAt).toLocaleDateString()}. The separately stored sealed PDF governs the architect’s authorship and scope.</p></div></div></div>
      : currentChangeRequest ? <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><TriangleAlert size={20} className="mt-0.5 shrink-0" /><div><strong className="text-sm">Architectural changes requested</strong><p className="mt-1 text-xs leading-5">Respond to every required drawing redline, revise the canonical model where needed, then publish a new fingerprint.</p></div></div>
        : null}

    {!currentPublication ? <button type="button" onClick={() => void publish()} disabled={busy !== null || Boolean(acceptedReview)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 text-sm font-bold text-white disabled:opacity-40"><Send size={16} /> {busy === 'publish' ? 'Publishing architectural issue…' : acceptedReview ? 'Current revision accepted' : `Create Architect AIBC reviewer link · Rev ${issue.manifest.revision}`}</button> : <div className="mt-4 grid gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm text-blue-950">Private Architect AIBC portal is active</strong><p className="mt-0.5 text-[10px] text-blue-800">Expires {new Date(currentPublication.expiresAt).toLocaleString()} · the capability link can submit only the architectural decision.</p></div><a href={currentPublication.reviewerUrl} target="_blank" rel="noreferrer" className="flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 text-xs font-bold text-blue-900">Open portal <ExternalLink size={13} /></a></div>
      <input aria-label="Private Architect AIBC reviewer link" readOnly value={currentPublication.reviewerUrl} className="min-h-10 w-full rounded-lg border border-blue-200 bg-white px-3 font-mono text-[10px] text-slate-700" />
      <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void copy()} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white text-xs font-bold text-blue-900"><Clipboard size={14} /> Copy reviewer link</button><button type="button" onClick={() => void check()} disabled={busy !== null} className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-900 text-xs font-bold text-white disabled:opacity-50"><RefreshCw size={14} className={busy === 'check' ? 'animate-spin' : ''} /> {busy === 'check' ? 'Checking…' : 'Check and import decision'}</button></div>
    </div>}

    {unanswered.length > 0 && <div className="mt-5 border-t border-slate-200 pt-5"><h4 className="text-sm font-bold text-slate-950">Required architectural redline responses</h4><div className="mt-3 grid gap-3">{unanswered.map(({ cycle, redline }) => <RedlineResponse key={`${cycle.id}:${redline.id}`} cycle={cycle} redline={redline} targetFingerprint={fingerprint} onResolve={onResolveRedline} onError={setError} />)}</div></div>}
    {message && <div role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900"><FileCheck2 size={15} className="mt-0.5 shrink-0" />{message}</div>}
    {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{error}</div>}
  </section>;
}

function ReviewStep({ number, label, complete }: { number: string; label: string; complete: boolean }) {
  return <li className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 ${complete ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${complete ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>{complete ? <CheckCircle2 size={15} /> : number}</span><span className="text-xs font-bold text-slate-800">{label}</span></li>;
}
