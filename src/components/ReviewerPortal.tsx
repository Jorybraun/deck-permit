import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, FileCheck2, MapPin, ShieldCheck, X } from 'lucide-react';
import { getReviewerExchange, submitReviewerDecision, fileToBase64, type ReviewerExchangeResult, type ReviewSubmission } from '../services/reviewExchange';
import { PROFESSIONAL_REGISTRIES, registryForRole } from '../services/professionalRegistry';
import { sha256File } from '../services/fileDigest';
import { validateReviewRedlines } from '../services/reviewRedlines';
import type { ReviewRedline, ReviewRedlineCategory } from '../types';

export function ReviewerPortal({ projectId, reviewerToken }: { projectId: string; reviewerToken: string }) {
  const [exchange, setExchange] = useState<ReviewerExchangeResult | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [issuerName, setIssuerName] = useState('');
  const [issuerRole, setIssuerRole] = useState<'engineer' | 'architect'>('engineer');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [decision, setDecision] = useState<'accepted' | 'changes-requested'>('accepted');
  const [registryConfirmed, setRegistryConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [redlines, setRedlines] = useState<ReviewRedline[]>([]);
  const [placingRedline, setPlacingRedline] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<ReviewRedline['anchor'] | null>(null);
  const [redlineTitle, setRedlineTitle] = useState('');
  const [redlineComment, setRedlineComment] = useState('');
  const [redlineCategory, setRedlineCategory] = useState<ReviewRedlineCategory>('coordination');
  const [redlineSeverity, setRedlineSeverity] = useState<ReviewRedline['severity']>('required');
  const registry = registryForRole(issuerRole)!;

  useEffect(() => {
    void getReviewerExchange(projectId, reviewerToken).then((result) => {
      setExchange(result);
      if (result.review) {
        setRedlines(result.review.redlines || []);
        if (result.review.decision) setDecision(result.review.decision);
      }
    }).catch((reason) => setLoadError(reason instanceof Error ? reason.message : 'The private review package could not be loaded.'));
  }, [projectId, reviewerToken]);

  const activeSheet = exchange?.reviewPackage.planset[sheetIndex];
  const sheetSource = useMemo(() => activeSheet ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(activeSheet.svg)}` : '', [activeSheet]);
  const activeRedlines = redlines.filter((redline) => redline.sheetId === activeSheet?.id);

  const placeMarker = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placingRedline || !activeSheet) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPendingAnchor({
      xPercent: Number((((event.clientX - bounds.left) / bounds.width) * 100).toFixed(2)),
      yPercent: Number((((event.clientY - bounds.top) / bounds.height) * 100).toFixed(2)),
    });
    setPlacingRedline(false);
  };

  const addRedline = () => {
    if (!exchange || !activeSheet || !pendingAnchor || redlineTitle.trim().length < 3 || redlineComment.trim().length < 5) return setError('Place a marker and enter a title and review comment.');
    const next: ReviewRedline = {
      id: crypto.randomUUID(), designFingerprint: exchange.reviewPackage.manifest.designFingerprint, sheetId: activeSheet.id,
      category: redlineCategory, severity: redlineSeverity, title: redlineTitle.trim(), comment: redlineComment.trim(), anchor: pendingAnchor, createdAt: new Date().toISOString(),
    };
    setRedlines((items) => [...items, next]);
    if (next.severity === 'required') setDecision('changes-requested');
    setPendingAnchor(null); setRedlineTitle(''); setRedlineComment(''); setError('');
  };

  const submit = async () => {
    if (!exchange || !file || !issuerName.trim() || !licenseNumber.trim()) return setError('Enter your professional identity and attach the sealed review PDF.');
    if (!registryConfirmed) return setError(`Confirm your current registration in the ${PROFESSIONAL_REGISTRIES[registry].label}.`);
    if (file.type !== 'application/pdf' || file.size > 10_000_000) return setError('Attach a PDF no larger than 10 MB.');
    try { validateReviewRedlines(redlines, exchange.reviewPackage.manifest.designFingerprint, exchange.reviewPackage.manifest.sheetIds, decision); }
    catch (reason) { return setError(reason instanceof Error ? reason.message : 'The sheet redlines are invalid.'); }
    setBusy(true); setError('');
    try {
      const recordedAt = new Date().toISOString();
      const review: ReviewSubmission = {
        id: crypto.randomUUID(), gateId: 'structural-review', kind: 'sealed-structural-review', fileName: file.name, mimeType: file.type, byteSize: file.size,
        pdfBase64: await fileToBase64(file), sha256: await sha256File(file), issuerName: issuerName.trim(), issuerRole, licenseNumber: licenseNumber.trim(), decision,
        designFingerprint: exchange.reviewPackage.manifest.designFingerprint, professionalRegistry: registry, registryUrl: PROFESSIONAL_REGISTRIES[registry].url,
        registryCheckedAt: recordedAt, registryStatus: 'directory-confirmed-by-user', recordedAt, status: 'recorded-unverified', redlines,
      };
      await submitReviewerDecision(projectId, reviewerToken, review);
      setSubmitted(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The review could not be submitted.'); } finally { setBusy(false); }
  };

  if (loadError) return <PortalMessage title="Private review unavailable" detail={loadError} />;
  if (!exchange) return <PortalMessage title="Loading review package…" detail="Checking the private reviewer credential." />;
  if (submitted) return <PortalMessage title="Review submitted" detail={`Your ${decision === 'accepted' ? 'accepted review' : 'change request'} is attached to ${exchange.reviewPackage.manifest.designFingerprint}. The homeowner can now import it.`} success />;

  const { reviewPackage } = exchange;
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="border-b border-border bg-white px-5 py-4"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={18} className="text-primary" /> Permitly professional review</div><p className="mt-0.5 text-xs text-text-secondary">Private, revision-bound package · expires {new Date(exchange.expiresAt).toLocaleDateString()}</p></div><span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">Not for construction</span></div></header>
      <main className="mx-auto grid max-w-7xl gap-5 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,.7fr)]">
        <section className="space-y-3">
          <div className="rounded-lg border border-border bg-white p-4"><h1 className="text-xl font-bold">{reviewPackage.property.address}</h1><p className="mt-1 text-sm text-text-secondary">PID {reviewPackage.property.pid || 'unconfirmed'} · {reviewPackage.property.zone || 'zone unconfirmed'} · {reviewPackage.deck.area.toFixed(1)} m² deck</p><div className="mt-3 inline-flex rounded-md bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary">{reviewPackage.manifest.designFingerprint}</div></div>
          <div className="rounded-lg border border-border bg-white p-3">
            <div className="mb-3 grid grid-cols-[36px_1fr_36px] items-center gap-2"><button aria-label="Previous sheet" disabled={sheetIndex === 0} onClick={() => setSheetIndex((value) => value - 1)} className="icon-button"><ChevronLeft size={17} /></button><div className="text-center"><strong className="block text-sm">{activeSheet?.title}</strong><span className="text-xs text-text-secondary">Sheet {sheetIndex + 1} of {reviewPackage.planset.length} · {activeSheet?.scale}</span></div><button aria-label="Next sheet" disabled={sheetIndex === reviewPackage.planset.length - 1} onClick={() => setSheetIndex((value) => value + 1)} className="icon-button"><ChevronRight size={17} /></button></div>
            {activeSheet && <div onClick={placeMarker} className={`relative border border-border bg-white ${placingRedline ? 'cursor-crosshair ring-2 ring-danger/40' : ''}`} data-testid="review-sheet-markup"><img src={sheetSource} alt={activeSheet.title} className="w-full" />
              {activeRedlines.map((redline) => <span key={redline.id} title={`${redline.title}: ${redline.comment}`} className={`absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${redline.severity === 'required' ? 'bg-danger' : 'bg-primary'}`} style={{ left: `${redline.anchor.xPercent}%`, top: `${redline.anchor.yPercent}%` }}>{redlines.indexOf(redline) + 1}</span>)}
              {pendingAnchor && activeSheet.id === reviewPackage.planset[sheetIndex].id && <span className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-warning text-xs font-bold text-white shadow" style={{ left: `${pendingAnchor.xPercent}%`, top: `${pendingAnchor.yPercent}%` }}>+</span>}
            </div>}
          </div>
        </section>
        <aside className="space-y-4">
          {(reviewPackage.priorReviewCycles || []).length > 0 && <div className="rounded-lg border border-border bg-white p-4 space-y-3"><div><h2 className="text-sm font-semibold">Prior review responses</h2><p className="mt-1 text-xs text-text-secondary">Coordination history supplied by the owner for comparison with this revision.</p></div>{[...(reviewPackage.priorReviewCycles || [])].reverse().slice(0, 3).map((cycle) => <div key={cycle.id} className="rounded-md bg-surface p-2.5 text-xs"><div className="flex justify-between gap-2"><strong>{cycle.sourceDesignFingerprint}</strong><span className="uppercase text-text-secondary">{cycle.decision.replace('-', ' ')}</span></div>{cycle.redlines.map((redline) => { const responses = cycle.resolutions.filter((resolution) => resolution.redlineId === redline.id); const response = responses[responses.length - 1]; return <div key={redline.id} className="mt-2 border-l-2 border-warning pl-2"><div className="font-semibold">{redline.sheetId}: {redline.title}</div><div className="mt-0.5 text-text-secondary">{redline.comment}</div><div className={`mt-1 ${response ? 'text-success' : 'text-danger'}`}>{response ? `${response.disposition.replace(/-/g, ' ')} — ${response.response}` : 'No owner/designer response recorded'}</div></div>; })}</div>)}</div>}
          <div className="rounded-lg border border-border bg-white p-4"><h2 className="text-sm font-semibold">Design-basis review</h2><div className="mt-3 space-y-2">{reviewPackage.report.checks.map((check) => <div key={check.id} className="rounded-md bg-surface p-2.5"><div className="flex justify-between gap-2 text-xs font-semibold"><span>{check.title}</span><span className={check.status === 'pass' ? 'text-success' : 'text-warning'}>{check.status}</span></div><p className="mt-1 text-xs text-text-secondary">{check.result}</p></div>)}</div></div>
          <div className="rounded-lg border border-border bg-white p-4 space-y-3"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Sheet redlines</h2><p className="mt-1 text-xs text-text-secondary">Place numbered comments directly on {activeSheet?.title || 'the active sheet'}.</p></div><span className="rounded-full bg-surface px-2 py-1 text-[10px] font-semibold">{redlines.length} total</span></div>
            <button onClick={() => { setPlacingRedline(true); setPendingAnchor(null); }} className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold ${placingRedline ? 'border-danger bg-danger/5 text-danger' : 'border-border text-text-primary'}`}><MapPin size={14} className="mr-1 inline" />{placingRedline ? 'Click the drawing to place marker' : 'Place redline on active sheet'}</button>
            {pendingAnchor && <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-warning">Marker at {pendingAnchor.xPercent}% × {pendingAnchor.yPercent}%</div><Field label="Redline title" value={redlineTitle} onChange={(event) => setRedlineTitle(event.target.value)} /><label className="block text-xs text-text-secondary">Category<select value={redlineCategory} onChange={(event) => setRedlineCategory(event.target.value as ReviewRedlineCategory)} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"><option value="coordination">Coordination</option><option value="structure">Structure</option><option value="code">Code</option><option value="site">Site</option><option value="documentation">Documentation</option></select></label><label className="block text-xs text-text-secondary">Severity<select value={redlineSeverity} onChange={(event) => setRedlineSeverity(event.target.value as ReviewRedline['severity'])} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"><option value="required">Required change</option><option value="advisory">Advisory note</option></select></label><label className="block text-xs text-text-secondary">Review comment<textarea value={redlineComment} onChange={(event) => setRedlineComment(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" /></label><button onClick={addRedline} className="w-full rounded-md bg-warning px-3 py-2 text-xs font-semibold text-white">Add sheet redline</button></div>}
            {activeRedlines.map((redline) => <div key={redline.id} className="rounded-md bg-surface p-2.5 text-xs"><div className="flex items-start justify-between gap-2"><div><span className={`mr-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${redline.severity === 'required' ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'}`}>{redline.severity}</span><strong>{redline.title}</strong></div><button aria-label={`Remove redline ${redline.title}`} onClick={() => setRedlines((items) => items.filter((item) => item.id !== redline.id))} className="text-text-secondary"><X size={14} /></button></div><p className="mt-1 text-text-secondary">{redline.comment}</p></div>)}
          </div>
          <div className="rounded-lg border border-border bg-white p-4 space-y-3"><div><h2 className="text-sm font-semibold">Submit professional decision</h2><p className="mt-1 text-xs text-text-secondary">Your PDF and identity attestation are locked to {reviewPackage.manifest.designFingerprint}.</p></div>
            <Field label="Professional name" value={issuerName} onChange={(event) => setIssuerName(event.target.value)} />
            <label className="block text-xs text-text-secondary">Profession<select value={issuerRole} onChange={(event) => { setIssuerRole(event.target.value as typeof issuerRole); setRegistryConfirmed(false); }} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"><option value="engineer">Professional engineer</option><option value="architect">Architect AIBC</option></select></label>
            <Field label="Licence / registration number" value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} />
            <div className="rounded-md border border-primary/25 bg-primary/5 p-3 text-xs"><a href={PROFESSIONAL_REGISTRIES[registry].url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Open official {PROFESSIONAL_REGISTRIES[registry].label} →</a><label className="mt-2 flex items-start gap-2 text-text-secondary"><input type="checkbox" checked={registryConfirmed} onChange={(event) => setRegistryConfirmed(event.target.checked)} className="mt-0.5" /><span>I confirmed my current registration and the name/number above in this directory today.</span></label></div>
            <label className="block text-xs text-text-secondary">Decision<select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"><option value="accepted">Accepted for this revision</option><option value="changes-requested">Changes requested</option></select></label>
            <label className="block text-xs text-text-secondary">Sealed review PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary" /></label>
            {exchange.review && <div className="rounded-md bg-warning/10 p-2 text-xs text-warning">A {exchange.review.decision} decision with {exchange.review.redlines?.length || 0} redline(s) was previously submitted. Submitting again replaces it.</div>}
            {error && <div className="rounded-md bg-danger/5 p-2 text-xs text-danger">{error}</div>}
            <button onClick={submit} disabled={busy} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Submitting…' : decision === 'accepted' ? 'Submit accepted review' : 'Submit change request'}</button>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label className="block text-xs text-text-secondary">{label}<input {...input} className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" /></label>; }

function PortalMessage({ title, detail, success = false }: { title: string; detail: string; success?: boolean }) { return <div className="grid min-h-screen place-items-center bg-surface p-6"><div className="max-w-md rounded-xl border border-border bg-white p-8 text-center shadow-sm">{success ? <CheckCircle2 className="mx-auto mb-3 text-success" size={34} /> : <FileCheck2 className="mx-auto mb-3 text-primary" size={34} />}<h1 className="text-xl font-bold">{title}</h1><p className="mt-2 text-sm text-text-secondary">{detail}</p></div></div>; }
