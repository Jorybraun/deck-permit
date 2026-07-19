import { Bot, Camera, Check, Circle, Image as ImageIcon, Loader2, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CAPTURE_OBSERVATION_TAGS, defaultObservationTag, type CaptureCategory, type CaptureEvidenceChanges, type CaptureObservationTag, type ExistingConditionCapture, type ExistingConditionCaptureAssessment } from '../../domain/siteModel';
import { fetchAiDesignCapabilities } from '../../services/aiDesignStudio';

interface ExistingConditionCapturePanelProps {
  capture: ExistingConditionCapture;
  assessment: ExistingConditionCaptureAssessment;
  previewUrls: Record<string, string>;
  onAddFiles: (category: CaptureCategory, files: File[]) => Promise<void>;
  onUpdateEvidence: (evidenceId: string, changes: CaptureEvidenceChanges) => void;
  onRemoveEvidence: (evidenceId: string) => Promise<void>;
  onAnalyze: () => Promise<void>;
  onReviewAiObservation: (analysisId: string, observationId: string, decision: 'homeowner-accepted' | 'homeowner-rejected') => void;
}

/** Guides a homeowner through the minimum visual evidence needed to model existing conditions. */
export function ExistingConditionCapturePanel({ capture, assessment, previewUrls, onAddFiles, onUpdateEvidence, onRemoveEvidence, onAnalyze, onReviewAiObservation }: ExistingConditionCapturePanelProps) {
  const [busyCategory, setBusyCategory] = useState<CaptureCategory | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void fetchAiDesignCapabilities().then((value) => { if (active) setAiConfigured(value.configured); }).catch(() => undefined); return () => { active = false; }; }, []);
  const upload = async (category: CaptureCategory, files: File[]) => {
    if (!files.length) return;
    setBusyCategory(category); setError('');
    try { await onAddFiles(category, files); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The photos could not be saved on this device.'); }
    finally { setBusyCategory(null); }
  };
  return <section className="mt-5 overflow-hidden rounded-xl border border-sky-200 bg-sky-50/50" aria-labelledby="capture-title">
    <header className="border-b border-sky-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-800"><Camera size={19} /></span><div><h4 id="capture-title" className="text-sm font-bold text-slate-950">Photograph the real house and yard</h4><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Upload each required view, then record the camera viewpoint, what is visibly proven, and any known scale reference. The source photo and its SHA-256 integrity record become part of the existing-condition package; no image automatically becomes a dimension or structural fact.</p></div></div>
        <div className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-right"><strong className="block text-sm tabular-nums text-sky-950">{assessment.recordedRequiredCount}/{assessment.requiredCount}</strong><span className="text-[9px] font-bold uppercase tracking-[.1em] text-sky-700">required views recorded</span></div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-600"><ShieldCheck size={15} className="shrink-0 text-emerald-700" /><span>Originals stay in this browser unless you explicitly press Analyze photos or assemble a professional package. AI requests are transient and use store: false; the app server does not retain the image bytes.</span></div>
      <button type="button" disabled={!aiConfigured || !capture.evidence.length || aiBusy} onClick={() => { setAiBusy(true); setError(''); void onAnalyze().catch((reason) => setError(reason instanceof Error ? reason.message : 'Photo analysis failed.')).finally(() => setAiBusy(false)); }} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-800 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{aiBusy ? 'Analyzing source-bound observations…' : aiConfigured ? `Analyze ${capture.evidence.length} photo${capture.evidence.length === 1 ? '' : 's'} with AI` : 'AI photo analysis needs server setup'}</button>
    </header>

    {(capture.aiAnalyses?.length || 0) > 0 && <AiObservationReview capture={capture} onDecision={onReviewAiObservation} />}

    <div className="grid gap-3 p-4">
      {assessment.requirements.map((requirement) => {
        const evidence = capture.evidence.filter((record) => record.category === requirement.category);
        const busy = busyCategory === requirement.category;
        return <article key={requirement.category} className={`rounded-xl border bg-white p-3 ${requirement.status === 'confirmed' ? 'border-emerald-300' : requirement.status === 'recorded' ? 'border-sky-300' : 'border-slate-200'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${requirement.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : requirement.status === 'recorded' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-400'}`}>{requirement.status === 'confirmed' ? <Check size={14} strokeWidth={3} /> : requirement.status === 'recorded' ? <ImageIcon size={14} /> : <Circle size={12} />}</span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h5 className="text-xs font-bold text-slate-900">{requirement.title}</h5><span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[.09em] ${requirement.required ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>{requirement.required ? 'Required' : 'Helpful'}</span><span className="text-[9px] font-bold uppercase tracking-[.08em] text-slate-400">{requirement.status}</span></div><p className="mt-1 text-[10px] leading-4 text-slate-500">{requirement.reason}</p></div>
            <label className="flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 text-[10px] font-bold text-sky-900 focus-within:ring-2 focus-within:ring-sky-600">{busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {busy ? 'Saving locally…' : 'Add photos'}<input aria-label={`Add photos for ${requirement.title}`} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple capture="environment" disabled={Boolean(busyCategory)} onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(requirement.category, files); }} className="sr-only" /></label>
          </div>

          {evidence.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{evidence.map((record) => <div key={record.id} className="grid grid-cols-[74px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="grid h-16 place-items-center overflow-hidden rounded-md bg-slate-200">{previewUrls[record.id] && !record.mimeType.includes('heic') && !record.mimeType.includes('heif') ? <img src={previewUrls[record.id]} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={20} className="text-slate-500" />}</div>
            <div className="min-w-0"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><strong className="block truncate text-[10px] text-slate-900" title={record.fileName}>{record.label}</strong><span className="block truncate text-[8px] text-slate-400">{formatBytes(record.byteSize)} · SHA {record.sha256.slice(0, 10)}…</span></div><button type="button" onClick={() => void onRemoveEvidence(record.id).catch((reason) => setError(reason instanceof Error ? reason.message : 'The photo could not be removed.'))} aria-label={`Remove ${record.label}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={12} /></button></div>
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-[9px] leading-4 text-slate-600"><input type="checkbox" checked={record.status === 'homeowner-confirmed' || record.status === 'professional-verified'} disabled={record.status === 'professional-verified'} onChange={(event) => onUpdateEvidence(record.id, { status: event.target.checked ? 'homeowner-confirmed' : 'recorded-unverified', observationTags: event.target.checked && !(record.observationTags?.length) ? [defaultObservationTag(record.category)] : record.observationTags })} className="mt-0.5" /><span>I confirm this photo shows the requested view.</span></label>
            </div>
            <details className="col-span-2 rounded-md border border-sky-200 bg-white px-2 py-1.5">
              <summary className="cursor-pointer text-[9px] font-bold text-sky-900">Document what this photo proves</summary>
              <div className="mt-2 grid gap-2">
                <label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Viewpoint / direction<input aria-label={`Viewpoint for ${record.label}`} value={record.viewpoint || ''} onChange={(event) => onUpdateEvidence(record.id, { viewpoint: event.target.value })} placeholder="Example: rear yard looking toward house" className="min-h-9 rounded-md border border-slate-300 px-2 text-[10px] font-normal normal-case tracking-normal text-slate-800" /></label>
                <fieldset><legend className="text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Visible observations</legend><div className="mt-1 flex flex-wrap gap-1">{CAPTURE_OBSERVATION_TAGS.map((tag) => { const checked = record.observationTags?.includes(tag.id) || false; return <label key={tag.id} className={`cursor-pointer rounded-full border px-2 py-1 text-[8px] font-semibold ${checked ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-500'}`}><input type="checkbox" className="sr-only" checked={checked} onChange={() => onUpdateEvidence(record.id, { observationTags: toggleTag(record.observationTags || [], tag.id) })} />{tag.label}</label>; })}</div></fieldset>
                <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2"><label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Scale reference<input aria-label={`Scale reference for ${record.label}`} value={record.referenceLabel || ''} onChange={(event) => onUpdateEvidence(record.id, { referenceLabel: event.target.value })} placeholder="Tape / known object" className="min-h-9 rounded-md border border-slate-300 px-2 text-[10px] font-normal normal-case tracking-normal text-slate-800" /></label><label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Length (mm)<input aria-label={`Reference length for ${record.label}`} type="number" min="1" max="100000" value={record.referenceDimensionMm || ''} onChange={(event) => onUpdateEvidence(record.id, { referenceDimensionMm: event.target.value ? Number(event.target.value) : null })} className="min-h-9 rounded-md border border-slate-300 px-2 text-[10px] font-normal normal-case tracking-normal text-slate-800" /></label></div>
                <label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Condition notes<textarea aria-label={`Condition notes for ${record.label}`} value={record.notes || ''} onChange={(event) => onUpdateEvidence(record.id, { notes: event.target.value })} placeholder="Visible damage, drainage, obstruction, uncertainty…" rows={2} className="rounded-md border border-slate-300 p-2 text-[10px] font-normal normal-case tracking-normal text-slate-800" /></label>
                <p className="text-[8px] leading-3 text-slate-400">A scale reference documents what appears in the image; it does not calibrate the photo or replace a field measurement.</p>
              </div>
            </details>
          </div>)}</div>}
        </article>;
      })}
    </div>
    {error && <p className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">{error}</p>}
    <footer className="border-t border-sky-200 bg-white px-4 py-3 text-[10px] leading-4 text-slate-500">JPEG, PNG, WebP, HEIC or HEIF · 30 MB maximum each. AI analysis currently accepts JPEG, PNG, and WebP. Structured observations appear on C1.x; source bytes are never embedded in an AI observation record.</footer>
  </section>;
}

function AiObservationReview({ capture, onDecision }: { capture: ExistingConditionCapture; onDecision: ExistingConditionCapturePanelProps['onReviewAiObservation'] }) {
  const analysis = capture.aiAnalyses![capture.aiAnalyses!.length - 1];
  return <section className="border-b border-violet-200 bg-violet-50 p-4" aria-label="AI photo observation draft"><div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-800"><Bot size={15} /></span><div><h5 className="text-xs font-bold text-slate-950">AI observation draft · homeowner review required</h5><p className="mt-1 text-[10px] leading-4 text-slate-600">{analysis.summary}</p><span className="mt-1 block text-[8px] font-semibold text-slate-400">{analysis.generation.model} · {analysis.generation.responseId || 'response not retained'}</span></div></div><div className="mt-3 grid gap-2">{analysis.observations.map((observation) => {
    const source = capture.evidence.find((record) => record.id === observation.sourceEvidenceId);
    return <article key={observation.id} className="rounded-lg border border-violet-200 bg-white p-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-[10px] uppercase tracking-[.08em] text-violet-900">{observation.kind.replace(/-/g, ' ')}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-bold text-slate-600">{Math.round(observation.confidence * 100)}% visual confidence</span><span className="text-[8px] text-slate-400">Source: {source?.label || observation.sourceEvidenceId}</span></div><p className="mt-1 text-[10px] leading-4 text-slate-700">{observation.description}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-[.08em] text-amber-800">Not measured · cannot set geometry</p>{observation.uncertainties.length > 0 && <p className="mt-1 text-[8px] leading-3 text-slate-500">Uncertain: {observation.uncertainties.join(' · ')}</p>}<div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => onDecision(analysis.id, observation.id, 'homeowner-accepted')} className={`min-h-8 rounded-md border text-[9px] font-bold ${observation.decision === 'homeowner-accepted' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-300 text-slate-700'}`}>Accept observation</button><button type="button" onClick={() => onDecision(analysis.id, observation.id, 'homeowner-rejected')} className={`min-h-8 rounded-md border text-[9px] font-bold ${observation.decision === 'homeowner-rejected' ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300 text-slate-700'}`}>Reject</button></div></article>;
  })}</div>{analysis.unknowns.length > 0 && <p className="mt-3 rounded-lg bg-white p-2 text-[9px] leading-4 text-slate-600"><strong>Still unknown:</strong> {analysis.unknowns.join(' · ')}</p>}</section>;
}

function toggleTag(tags: CaptureObservationTag[], tag: CaptureObservationTag): CaptureObservationTag[] {
  return tags.includes(tag) ? tags.filter((candidate) => candidate !== tag) : [...tags, tag];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
