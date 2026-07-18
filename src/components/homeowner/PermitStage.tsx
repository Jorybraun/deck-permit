import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CircleDot, Download, ExternalLink, FileCheck2, FileText, GitBranch, HardHat, Layers3, Printer, RefreshCw, Ruler, ShieldCheck, X } from 'lucide-react';
import type { DeckDesign } from '../../domain/deckDesign';
import type { FramingCheck, FramingDesign, FramingReviewGate } from '../../domain/framingDesign';
import type { SiteModel } from '../../domain/siteModel';
import { buildCanonicalReviewIssue } from '../../services/canonicalReviewIssue';
import { canonicalPlanFingerprint } from '../../services/canonicalPlanSet';
import type { ProfessionalReviewCycle, Property, ReviewExchangePublication, ReviewRedlineResolution, VerificationEvidence } from '../../types';
import { FramingPlanPreview } from './FramingPlanPreview';
import { CanonicalReviewPanel } from './CanonicalReviewPanel';

interface PermitStageProps {
  property: Property;
  site: SiteModel;
  design: DeckDesign;
  framing: FramingDesign | null;
  framingStale: boolean;
  designErrors: string[];
  siteErrors: string[];
  siteWarnings: string[];
  reviewPublication: ReviewExchangePublication | null;
  reviewIssueRevision: number;
  professionalReviewCycles: ProfessionalReviewCycle[];
  verificationEvidence: VerificationEvidence[];
  onGenerateFraming: () => void;
  onDownloadReviewSet: () => void | Promise<void>;
  onDownloadCadExchange: () => void;
  onBackToDesign: () => void;
  onContinue: () => void;
  onPublishReview: (publication: ReviewExchangePublication) => void;
  onImportReview: (evidence: VerificationEvidence, cycle: ProfessionalReviewCycle) => void;
  onResolveRedline: (input: { cycleId: string; redlineId: string; targetDesignFingerprint: string; disposition: ReviewRedlineResolution['disposition']; response: string }) => void;
}

/** Composes reviewable framing evidence and permit readiness from canonical project state. */
export function PermitStage({ property, site, design, framing, framingStale, designErrors, siteErrors, siteWarnings, reviewPublication, reviewIssueRevision, professionalReviewCycles, verificationEvidence, onGenerateFraming, onDownloadReviewSet, onDownloadCadExchange, onBackToDesign, onContinue, onPublishReview, onImportReview, onResolveRedline }: PermitStageProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSheetIndex, setPreviewSheetIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'building' | 'ready' | 'error'>('idle');
  const [cadStatus, setCadStatus] = useState<'idle' | 'ready' | 'error'>('idle');
  const blockers = [...designErrors, ...siteErrors];
  const framingCurrent = Boolean(framing && !framingStale);
  const requiredGates = framing?.reviewGates.filter((gate) => gate.status === 'required') || [];
  const currentFingerprint = framing ? canonicalPlanFingerprint({ property, site, design, framing }) : '';
  const publicationIsCurrent = reviewPublication?.designFingerprint === currentFingerprint;
  const issueRevision = publicationIsCurrent ? reviewPublication?.revision || reviewIssueRevision : reviewIssueRevision + 1;
  const reviewIssue = useMemo(() => framingCurrent && framing ? buildCanonicalReviewIssue({ property, site, design, framing, reviewCycles: professionalReviewCycles, revision: issueRevision, issuedAt: publicationIsCurrent ? reviewPublication?.issueIssuedAt : undefined }) : null, [design, framing, framingCurrent, issueRevision, professionalReviewCycles, property, publicationIsCurrent, reviewPublication?.issueIssuedAt, site]);
  const reviewSheets = reviewIssue?.reviewPackage.planset || [];
  const plannedSheets = [
    { id: 'A0.0', name: 'Cover, project data & drawing index', status: property.parcel ? 'derived' : 'blocked' },
    { id: 'C1.0', name: 'Evidence & existing conditions', status: site.capture.evidence.length ? 'reference' : 'review' },
    { id: 'A1.0', name: 'Site & property relationship', status: property.parcel ? 'reference' : 'blocked' },
    { id: 'A2.0', name: 'Dimensioned deck, landing, stair & guard plan', status: framingCurrent ? 'derived' : 'blocked' },
    { id: 'S1.0', name: 'Foundation, post & coordinate plan', status: framingCurrent ? 'review' : 'blocked' },
    { id: 'S2.0', name: 'Framing plan & member schedule', status: framingCurrent ? 'derived' : 'blocked' },
    { id: 'A3.0', name: 'Platform & stair elevations', status: framingCurrent ? 'derived' : 'blocked' },
    { id: 'S3.0', name: 'Typical building sections', status: framingCurrent ? 'review' : 'blocked' },
    { id: 'A4.0', name: 'Stair, guard, footing & connection details', status: framingCurrent ? 'review' : 'blocked' },
    { id: 'S4.0', name: 'Design basis, checks & review gates', status: framingCurrent ? 'review' : 'blocked' },
  ] as const;
  const downloadReviewSet = async () => {
    if (pdfStatus === 'building') return;
    setPdfStatus('building');
    try {
      await onDownloadReviewSet();
      setPdfStatus('ready');
    } catch {
      setPdfStatus('error');
    }
  };
  const downloadCad = () => {
    try { onDownloadCadExchange(); setCadStatus('ready'); }
    catch { setCadStatus('error'); }
  };

  return <><main className="h-full overflow-y-auto bg-[#f4f6f3] px-4 py-7 sm:px-8 lg:px-12">
    <div className="mx-auto grid max-w-7xl gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><span className="text-xs font-bold uppercase tracking-[.16em] text-emerald-800">Permit workspace</span><h2 className="mt-2 max-w-4xl font-[Manrope] text-3xl font-bold tracking-tight text-slate-950">One design graph, translated into a reviewable construction set.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">The framing proposal below is generated from the platform, stair, and site geometry. It exposes assumptions and professional review gates instead of presenting automated work as approved engineering.</p></div><button type="button" onClick={onGenerateFraming} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-5 text-sm font-bold text-white"><RefreshCw size={16} /> {framing ? 'Regenerate framing' : 'Generate framing proposal'}</button></header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard icon={<FileCheck2 size={20} />} label="Property evidence" value={property.parcel ? 'Municipal parcel identified' : 'Required'} tone={property.parcel ? 'success' : 'warning'} />
        <StatusCard icon={<Ruler size={20} />} label="Existing conditions" value={site.designWall.selectionStatus === 'field-measured' ? 'Field measured' : 'Field verification required'} tone={site.designWall.selectionStatus === 'field-measured' ? 'success' : 'warning'} />
        <StatusCard icon={<GitBranch size={20} />} label="Framing graph" value={!framing ? 'Not generated' : framingStale ? 'Stale · regenerate' : `${framing.joists.length + framing.beams.length + framing.posts.length} members`} tone={framingCurrent ? 'success' : 'warning'} />
        <StatusCard icon={<HardHat size={20} />} label="Professional gates" value={framing ? `${requiredGates.length} required` : 'Generate to identify'} tone={requiredGates.length ? 'warning' : framing ? 'success' : 'warning'} />
      </section>

      {framingStale && framing && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><strong>Framing is out of date.</strong><p className="mt-1 text-xs leading-5">The deck, stair, site, or governing input changed after this proposal was generated. The old members remain visible for comparison but cannot be used in the current permit set.</p></div></div>}

      {!framing ? <section className="rounded-xl border border-dashed border-emerald-700/30 bg-white p-8 text-center"><Layers3 className="mx-auto text-emerald-700" size={28} /><h3 className="mt-3 text-lg font-bold text-slate-950">Generate the first framing proposal</h3><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">This creates explicit joists, beams, ledgers, posts, preliminary footings, guards, and stair stringers. Irregular or unsupported configurations are generated for coordination but marked for engineering.</p><button type="button" onClick={onGenerateFraming} className="mt-5 min-h-11 rounded-lg bg-emerald-800 px-5 text-sm font-bold text-white">Generate framing proposal</button></section> : <>
        <FramingPlanPreview design={design} framing={framing} stale={framingStale} />

        <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">Generated systems</span><h3 className="mt-1 text-lg font-bold text-slate-950">Platform load paths</h3></div><CircleDot className="text-emerald-700" size={20} /></div><div className="mt-4 grid gap-3">{framing.platformSystems.map((system) => { const platform = design.platforms.find((candidate) => candidate.id === system.platformId); return <div key={system.platformId} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-900">{platform?.name || system.platformId}</strong><StatusPill status={system.status} /></div><dl className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><Fact label="Support" value={system.supportStrategy} /><Fact label="Joist axis" value={system.joistAxis.toUpperCase()} /><Fact label="Design span" value={`${system.joistDesignSpanMm} mm`} /></dl><p className="mt-3 text-xs leading-5 text-slate-600">{system.explanation}</p></div>; })}</div></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">Design basis</span><h3 className="mt-1 text-lg font-bold text-slate-950">Loads and assumptions</h3><dl className="mt-4 grid grid-cols-2 gap-2"><Fact label="Code profile" value={framing.codeProfile.label} /><Fact label="Snow load" value={`${framing.assumptions.snowLoadKpa.toFixed(2)} kPa`} /><Fact label="Live load" value={`${framing.assumptions.liveLoadKpa.toFixed(2)} kPa`} /><Fact label="Governing load" value={`${framing.assumptions.governingAreaLoadKpa.toFixed(2)} kPa`} /><Fact label="Lumber" value={`${framing.assumptions.lumberSpecies} ${framing.assumptions.lumberGrade}`} /><Fact label="Treatment" value={framing.assumptions.treatment} /><Fact label="Assumed soil" value={`${framing.assumptions.soilBearingKpa} kPa`} /><Fact label="Max post spacing" value={`${framing.assumptions.maximumPostSpacingMm} mm`} /></dl><div className="mt-4 border-t border-slate-200 pt-4">{framing.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-xs leading-5 text-emerald-800"><ExternalLink size={13} className="mt-1 shrink-0" /><span><strong>{source.title}</strong><br />{source.edition} · {source.scope}</span></a>)}</div></article>
        </section>

        <section className="grid gap-5 lg:grid-cols-2"><CheckList checks={framing.checks} /><ReviewGateList gates={framing.reviewGates} /></section>
      </>}

      <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="font-[Manrope] text-lg font-bold text-slate-950">Permit drawing set</h3><p className="mt-1 text-sm text-slate-600">Ten coordinated 11×17 sheets and a layered CAD handoff derived from this controlled project revision.</p>{framingCurrent && framing && <p className="mt-2 text-[10px] font-bold uppercase tracking-[.1em] text-emerald-700">Issue fingerprint · {currentFingerprint}</p>}</div><FileText className="text-emerald-800" size={22} /></div><ol className="mt-5 grid gap-2">{plannedSheets.map((sheet) => <li key={sheet.id} className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"><span className="grid h-7 w-10 place-items-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-600">{sheet.id}</span><span className="flex-1 font-semibold">{sheet.name}</span><SheetStatus status={sheet.status} /></li>)}</ol><div className="mt-4 grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => { setPreviewSheetIndex(0); setPreviewZoom(100); setPreviewOpen(true); }} disabled={!framingCurrent} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-xs font-bold text-white disabled:opacity-40"><Printer size={15} /> Preview complete set</button><button type="button" onClick={() => void downloadReviewSet()} disabled={!framingCurrent || pdfStatus === 'building'} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-40"><Download size={15} /> {pdfStatus === 'building' ? 'Building vector PDF…' : 'Download 11×17 PDF'}</button><button type="button" onClick={downloadCad} disabled={!framingCurrent} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-40"><Layers3 size={15} /> Download layered DXF</button></div>{pdfStatus === 'ready' && <p role="status" className="mt-3 text-xs font-semibold text-emerald-700">The ten-sheet vector PDF is ready in your downloads.</p>}{pdfStatus === 'error' && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">The PDF could not be generated. Review the project error above and try again.</p>}{cadStatus === 'ready' && <p role="status" className="mt-3 text-xs font-semibold text-emerald-700">The layered millimetre DXF is ready for AutoCAD or Chief Architect handoff.</p>}{cadStatus === 'error' && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">The layered DXF could not be generated. Regenerate framing and try again.</p>}<p className="mt-3 text-[10px] leading-4 text-slate-500">The preview fits the complete 17:11 sheet before you zoom. The PDF uses a fixed 17×11 landscape media box. The DXF contains named architectural and structural model-space layers, stable IDs, and this issue fingerprint. Both remain professional-review outputs; a blank seal box is never treated as approval.</p></article>
        <div className="grid content-start gap-4">
          <article className={`rounded-xl border p-5 ${blockers.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><h3 className="flex items-center gap-2 font-[Manrope] text-lg font-bold">{blockers.length ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}{blockers.length ? 'Field and design blockers' : 'Spatial inputs complete'}</h3>{blockers.length ? <ul className="mt-3 grid gap-2 text-sm leading-5">{blockers.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-sm leading-6">The spatial design passes its current geometry checks. Framing and permit review gates remain independently visible above.</p>}</article>
          {siteWarnings.length > 0 && <article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-slate-900">Existing-condition warnings</h3><ul className="mt-3 grid gap-2 text-xs leading-5 text-slate-600">{siteWarnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></article>}
          <button type="button" onClick={onBackToDesign} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700">Back to design</button>
          <button type="button" onClick={onContinue} disabled={!framingCurrent || designErrors.length > 0} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-40">Prepare builder brief <ArrowRight size={16} /></button>
        </div>
      </section>
      {reviewIssue && <CanonicalReviewPanel issue={reviewIssue} publication={reviewPublication} reviewCycles={professionalReviewCycles} verificationEvidence={verificationEvidence} onPublish={onPublishReview} onImportReview={onImportReview} onResolveRedline={onResolveRedline} />}
    </div>
  </main>{previewOpen && reviewSheets.length > 0 && <div className="fixed inset-0 z-[90] flex flex-col bg-[#17211c]/95" role="dialog" aria-modal="true" aria-label="Permit drawing set preview">
    <header className="flex flex-wrap items-center gap-3 border-b border-white/15 bg-[#17211c] px-4 py-3 text-white sm:px-6"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-300">Complete 11×17 sheet</p><h3 className="truncate text-sm font-bold">{reviewSheets[previewSheetIndex].number} · {reviewSheets[previewSheetIndex].title}</h3></div><label className="flex items-center gap-2 text-xs font-bold"><span>Zoom</span><input aria-label="Drawing preview zoom" type="range" min="60" max="180" step="10" value={previewZoom} onChange={(event) => setPreviewZoom(Number(event.target.value))} /><span className="w-10 text-right tabular-nums">{previewZoom}%</span></label><button type="button" onClick={() => void downloadReviewSet()} disabled={pdfStatus === 'building'} className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-emerald-900 disabled:opacity-50"><Download size={14} /> {pdfStatus === 'building' ? 'Building…' : 'PDF'}</button><button type="button" onClick={() => setPreviewOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/20" aria-label="Close drawing preview"><X size={18} /></button></header>
    <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-white/10 bg-[#202d26] px-4 py-2 sm:px-6" aria-label="Drawing sheets">{reviewSheets.map((sheet, index) => <button key={sheet.id} type="button" onClick={() => setPreviewSheetIndex(index)} aria-current={index === previewSheetIndex ? 'page' : undefined} className={`shrink-0 rounded-md px-3 py-2 text-left text-[10px] ${index === previewSheetIndex ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}><strong className="block">{sheet.number}</strong><span className="block max-w-44 truncate opacity-80">{sheet.title}</span></button>)}</nav>
    <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6"><div className="mx-auto transition-[width] duration-150" style={{ width: `${previewZoom}%`, minWidth: previewZoom > 100 ? '900px' : undefined }}><div className="drawing-sheet overflow-hidden bg-white shadow-2xl" style={{ aspectRatio: '17 / 11' }} dangerouslySetInnerHTML={{ __html: reviewSheets[previewSheetIndex].svg }} /></div></div>
  </div>}</>;
}

function CheckList({ checks }: { checks: FramingCheck[] }) { return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 text-lg font-bold text-slate-950"><ShieldCheck size={19} className="text-emerald-700" /> Framing checks</h3><div className="mt-4 grid gap-2">{checks.map((check) => <details key={check.id} className="group rounded-lg border border-slate-200 p-3"><summary className="flex cursor-pointer list-none items-center gap-3"><CheckIcon status={check.status} /><strong className="flex-1 text-xs text-slate-900">{check.title}</strong><span className="text-[9px] font-bold uppercase text-slate-400">{check.status}</span></summary><p className="mt-3 text-xs leading-5 text-slate-700">{check.result}</p><p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-500"><strong>Basis:</strong> {check.basis}</p></details>)}</div></article>; }
function ReviewGateList({ gates }: { gates: FramingReviewGate[] }) { return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 text-lg font-bold text-slate-950"><HardHat size={19} className="text-amber-700" /> Professional review gates</h3><p className="mt-1 text-xs leading-5 text-slate-600">Required gates are work packages for the appropriate qualified reviewer, not generic disclaimers.</p><div className="mt-4 grid gap-2">{gates.map((gate) => <div key={gate.id} className={`rounded-lg border p-3 ${gate.status === 'required' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-900">{gate.title}</strong><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase ${gate.status === 'required' ? 'bg-amber-200 text-amber-950' : 'bg-slate-200 text-slate-600'}`}>{gate.status}</span></div><p className="mt-2 text-[10px] font-bold uppercase tracking-[.08em] text-slate-400">{gate.discipline}</p><p className="mt-1 text-xs leading-5 text-slate-600">{gate.reason}</p></div>)}</div></article>; }
function StatusCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'success' | 'warning' }) { return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={tone === 'success' ? 'text-emerald-700' : 'text-amber-700'}>{icon}</div><p className="mt-3 text-xs font-bold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></article>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-2.5"><dt className="text-[8px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</dt><dd className="mt-1 text-[11px] font-bold capitalize text-slate-800">{value}</dd></div>; }
function StatusPill({ status }: { status: FramingDesign['status'] }) { return <span className={`rounded-full px-2.5 py-1 text-[8px] font-bold uppercase ${status === 'engineering-required' ? 'bg-red-100 text-red-800' : status === 'review-required' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{status.replace(/-/g, ' ')}</span>; }
function CheckIcon({ status }: { status: FramingCheck['status'] }) { return <span className={`grid h-6 w-6 place-items-center rounded-full ${status === 'pass' ? 'bg-emerald-100 text-emerald-800' : status === 'review' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>{status === 'pass' ? <Check size={13} /> : status === 'review' ? <AlertTriangle size={12} /> : <X size={12} />}</span>; }
function SheetStatus({ status }: { status: 'derived' | 'reference' | 'review' | 'next' | 'blocked' }) { const styles = status === 'derived' ? 'bg-emerald-100 text-emerald-800' : status === 'reference' || status === 'review' ? 'bg-blue-100 text-blue-800' : status === 'next' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-900'; return <span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase ${styles}`}>{status}</span>; }
