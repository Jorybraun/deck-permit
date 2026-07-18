import { useState } from 'react';
import type { Deck, PermitManifest, PlanSheet, ProfessionalReviewCycle, Property, ReviewExchangePublication, StructuralReport, VerificationEvidence } from '../types';
import { buildReviewPackage, getOwnerExchange, publishReviewExchange, reviewPdfFile } from '../services/reviewExchange';
import { saveEvidenceFile } from '../services/projectPersistence';
import { createProfessionalReviewCycle, unansweredRequiredRedlines } from '../services/reviewRedlines';

export function ReviewExchangePanel({ property, deck, planset, report, manifest, publication, reviewCycles, onPublish, onImport, onImportCycle }: {
  property: Property; deck: Deck; planset: PlanSheet[]; report: StructuralReport; manifest: PermitManifest;
  publication: ReviewExchangePublication | null; reviewCycles: ProfessionalReviewCycle[]; onPublish: (publication: ReviewExchangePublication) => void;
  onImport: (evidence: VerificationEvidence) => void; onImportCycle: (cycle: ProfessionalReviewCycle) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const unanswered = unansweredRequiredRedlines(reviewCycles);
  const publish = async () => {
    if (unanswered.length) return setError(`Respond to ${unanswered.length} required professional redline${unanswered.length === 1 ? '' : 's'} before publishing the next review package.`);
    setBusy(true); setError(''); setMessage('');
    try { const result = await publishReviewExchange(buildReviewPackage(property, deck, planset, report, manifest, reviewCycles)); onPublish(result); setMessage('Private reviewer link created.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The review package could not be published.'); } finally { setBusy(false); }
  };
  const check = async () => {
    if (!publication) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await getOwnerExchange(publication);
      if (!result.review) setMessage('No professional decision has been submitted yet.');
      else {
        const { pdfBase64: _pdf, redlines: _redlines, ...evidence } = result.review;
        await saveEvidenceFile(evidence.id, reviewPdfFile(result.review));
        onImport(evidence);
        onImportCycle(createProfessionalReviewCycle({ exchangeProjectId: publication.projectId, review: result.review }));
        setMessage(`${evidence.decision === 'accepted' ? 'Accepted review' : `Change request with ${result.review.redlines?.length || 0} redline(s)`} imported for ${evidence.designFingerprint}.`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The review status could not be checked.'); } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!publication) return;
    try { await navigator.clipboard.writeText(publication.reviewerUrl); setMessage('Reviewer link copied.'); } catch { setMessage('Copy was blocked; select the link below manually.'); }
  };
  return <div className="rounded-lg border border-border bg-white p-4 space-y-3"><div><h3 className="text-sm font-semibold text-text-primary">Private professional review</h3><p className="mt-1 text-xs text-text-secondary">Publish this exact revision to a capability-authenticated, read-only reviewer portal. The separate reviewer credential expires after 30 days.</p></div>
    {unanswered.length > 0 && <div className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs text-warning">{unanswered.length} required redline{unanswered.length === 1 ? '' : 's'} still need an owner/designer response before this revision can be republished.</div>}
    {!publication ? <button onClick={publish} disabled={busy} className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Publishing…' : 'Create private reviewer link'}</button> : <>
      <div className="rounded-md bg-surface p-3"><div className="text-[10px] uppercase tracking-wide text-text-secondary">Published revision</div><div className="mt-1 font-mono text-xs font-semibold text-primary">{publication.designFingerprint}</div><input readOnly value={publication.reviewerUrl} aria-label="Private reviewer link" className="mt-2 w-full rounded border border-border bg-white px-2 py-1.5 text-xs" /><div className="mt-2 text-[10px] text-text-secondary">Expires {new Date(publication.expiresAt).toLocaleString()} · anyone holding this link can submit a review.</div></div>
      <div className="grid grid-cols-2 gap-2"><button onClick={copy} className="rounded-lg border border-border px-3 py-2 text-sm font-medium">Copy link</button><button onClick={check} disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Checking…' : 'Check & import review'}</button></div>
    </>}
    {message && <div className="rounded-md bg-success/10 p-2 text-xs text-success">{message}</div>}{error && <div className="rounded-md bg-danger/5 p-2 text-xs text-danger">{error}</div>}
  </div>;
}
