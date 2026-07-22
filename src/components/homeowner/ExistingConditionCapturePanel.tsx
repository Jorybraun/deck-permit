import { Bot, Camera, Check, HelpCircle, Image as ImageIcon, Loader2, Lock, Plus, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AI_CLASSIFICATION_APPLY_THRESHOLD, CAPTURE_OBSERVATION_TAGS, categoryTitle, defaultObservationTag, type CaptureCategory, type CaptureEvidence, type CaptureEvidenceChanges, type CaptureObservationTag, type ExistingConditionCapture, type ExistingConditionCaptureAssessment } from '../../domain/siteModel';
import { fetchAiDesignCapabilities } from '../../services/aiDesignStudio';

interface ExistingConditionCapturePanelProps {
  capture: ExistingConditionCapture;
  assessment: ExistingConditionCaptureAssessment;
  previewUrls: Record<string, string>;
  analyzing: boolean;
  onAddFiles: (category: CaptureCategory, files: File[]) => Promise<void>;
  onUpdateEvidence: (evidenceId: string, changes: CaptureEvidenceChanges) => void;
  onRemoveEvidence: (evidenceId: string) => Promise<void>;
  onAnalyze: () => Promise<void>;
  onReviewAiObservation: (analysisId: string, observationId: string, decision: 'homeowner-accepted' | 'homeowner-rejected') => void;
  linkedAiOpeningRefs: string[];
  onPromoteAiOpening: (analysisId: string, observationId: string) => void;
}

/** The real views the homeowner can assign a photo to, in a friendly order. */
const REAL_VIEWS: Array<Exclude<CaptureCategory, 'unsorted'>> = ['house-overview', 'design-wall', 'door-threshold', 'grade-context', 'wall-assembly', 'obstruction', 'survey-or-sketch'];

const FRIENDLY_VIEW: Record<Exclude<CaptureCategory, 'unsorted'>, { chip: string; pick: string; need: string }> = {
  'house-overview': { chip: 'the house & yard', pick: 'House & yard', need: 'a wide shot of the house and yard' },
  'design-wall': { chip: 'the whole wall', pick: 'The whole wall', need: 'the full wall where the deck will go' },
  'door-threshold': { chip: 'your door & threshold', pick: 'Door & step', need: 'the door and the step down to the ground' },
  'grade-context': { chip: 'where the deck meets the ground', pick: 'Ground & slope', need: 'a shot of where the deck meets the ground' },
  'wall-assembly': { chip: 'the wall up close', pick: 'Wall close-up', need: 'a close-up of the wall base and siding' },
  obstruction: { chip: 'something in the way', pick: 'Things in the way', need: 'anything in the way (vents, taps, meters)' },
  'survey-or-sketch': { chip: 'a survey or sketch', pick: 'Survey / sketch', need: 'a survey or measured sketch, if you have one' },
};

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

/** One friendly place to add house photos; the AI sorts them and asks when it is unsure. */
export function ExistingConditionCapturePanel({ capture, assessment, previewUrls, analyzing, onAddFiles, onUpdateEvidence, onRemoveEvidence, onAnalyze, onReviewAiObservation, linkedAiOpeningRefs, onPromoteAiOpening }: ExistingConditionCapturePanelProps) {
  const [aiConfigured, setAiConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void fetchAiDesignCapabilities().then((value) => { if (active) setAiConfigured(value.configured); }).catch(() => undefined); return () => { active = false; }; }, []);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true); setError('');
    try { await onAddFiles('unsorted', files); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The photos could not be saved on this device.'); }
    finally { setBusy(false); }
  };

  const missingRequired = assessment.requirements.filter((requirement) => requirement.required && requirement.status === 'missing');
  const needsSorting = capture.evidence.filter((record) => isUnsorted(record));

  return <section className="mt-5 overflow-hidden rounded-xl border border-[#c9d6c2] bg-[#f4f6f1]" aria-labelledby="capture-title">
    <header className="border-b border-[#c9d6c2] bg-white p-4">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e3ede0] text-[#3f6b42]"><Camera size={19} /></span>
        <div>
          <h4 id="capture-title" className="text-base font-bold tracking-tight text-slate-950">Snap a few photos of your wall and yard — I'll figure out what each one shows.</h4>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Add or take them in any order. I'll sort each one, and if I'm not sure I'll just ask. You can always fix a wrong guess with a tap.</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#a9c2a0] bg-[#eef3ea] px-3 text-center text-[#3f6b42] transition hover:bg-[#e6efe1] focus-within:ring-2 focus-within:ring-[#3f6b42]">
          <span className="flex items-center gap-2 text-sm font-bold">{busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{busy ? 'Saving on your device…' : 'Add photos'}</span>
          <span className="text-[10px] font-medium text-[#5c7a55]">Choose from your gallery</span>
          <input aria-label="Add photos from your gallery" type="file" accept={IMAGE_ACCEPT} multiple disabled={busy} onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files); }} className="sr-only" />
        </label>
        <label className="flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-[#b98a4b] bg-[#f6ede0] px-3 text-center text-[#8a5a1f] transition hover:bg-[#f1e4d1] focus-within:ring-2 focus-within:ring-[#b98a4b]">
          <span className="flex items-center gap-2 text-sm font-bold"><Camera size={16} />Take a photo</span>
          <span className="text-[10px] font-medium text-[#a06e33]">Open your camera</span>
          <input aria-label="Take a photo with your camera" type="file" accept={IMAGE_ACCEPT} capture="environment" disabled={busy} onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files); }} className="sr-only" />
        </label>
      </div>

      {(analyzing || rechecking) && <p className="mt-3 flex items-center gap-2 rounded-lg bg-[#eef3ea] px-3 py-2 text-[11px] font-semibold text-[#3f6b42]"><Loader2 size={14} className="animate-spin" /> Looking at your photos to sort them…</p>}

      {/* Coverage strip: a progress indicator built from the required/helpful views. Not an upload target. */}
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Photo coverage">
          {assessment.requirements.map((requirement) => {
            const covered = requirement.status !== 'missing';
            const friendly = FRIENDLY_VIEW[requirement.category as Exclude<CaptureCategory, 'unsorted'>];
            return <span key={requirement.category} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${covered ? 'bg-[#e3ede0] text-[#345c38]' : requirement.required ? 'bg-[#f6ede0] text-[#8a5a1f]' : 'bg-slate-100 text-slate-400'}`}>{covered ? <Check size={11} strokeWidth={3} /> : null}{friendly?.pick || categoryTitle(requirement.category)}{!requirement.required && !covered ? <span className="opacity-70"> · optional</span> : null}</span>;
          })}
        </div>
        {missingRequired.length > 0 && <p className="mt-2 text-[11px] font-medium text-[#8a5a1f]">Still need: {FRIENDLY_VIEW[missingRequired[0].category as Exclude<CaptureCategory, 'unsorted'>].need}.</p>}
        {missingRequired.length === 0 && capture.evidence.length > 0 && !needsSorting.length && <p className="mt-2 text-[11px] font-medium text-[#345c38]">Nice — you've got every must-have shot covered.</p>}
      </div>

      {aiConfigured && capture.evidence.length > 0 && <button type="button" disabled={rechecking || analyzing} onClick={() => { setRechecking(true); setError(''); void onAnalyze().catch((reason) => setError(reason instanceof Error ? reason.message : 'The photos could not be re-checked.')).finally(() => setRechecking(false)); }} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#3f6b42] underline-offset-2 hover:underline disabled:opacity-50"><Sparkles size={13} />Re-check my photos</button>}
    </header>

    {(capture.aiAnalyses?.length || 0) > 0 && <AiObservationReview capture={capture} linkedOpeningRefs={linkedAiOpeningRefs} onDecision={onReviewAiObservation} onPromote={onPromoteAiOpening} onError={setError} />}

    {capture.evidence.length === 0
      ? <div className="p-4"><p className="rounded-xl border border-dashed border-[#c9d6c2] bg-white p-6 text-center text-xs text-slate-500">No photos yet. Add or take a few and I'll sort them for you.</p></div>
      : <div className="grid gap-2.5 p-4 sm:grid-cols-2">
        {capture.evidence.map((record) => <PhotoCard key={record.id} record={record} previewUrl={previewUrls[record.id]} onUpdateEvidence={onUpdateEvidence} onRemoveEvidence={onRemoveEvidence} onError={setError} />)}
      </div>}

    {error && <p className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">{error}</p>}

    <footer className="border-t border-[#c9d6c2] bg-white px-4 py-3">
      <details className="text-[11px] leading-4 text-slate-500">
        <summary className="cursor-pointer font-semibold text-slate-600">Why we ask, and how your photos are handled</summary>
        <div className="mt-2 grid gap-2">
          <p className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#3f6b42]" /><span>Your original photos stay in this browser on your device. When you add a photo, I send a temporary reduced copy to Cerebras just to figure out what it shows; the app server does not keep the bytes. Cerebras says original image payloads are not persisted after processing, though ephemeral organization-scoped caching may occur.</span></p>
          <p>Each photo also gets a SHA-256 fingerprint so the existing-condition package can prove the file was not swapped. JPEG, PNG, WebP, HEIC or HEIF · 30 MB maximum each. No photo ever becomes a measurement on its own — doors, windows, and dimensions are only added when you accept them.</p>
        </div>
      </details>
    </footer>
  </section>;
}

function PhotoCard({ record, previewUrl, onUpdateEvidence, onRemoveEvidence, onError }: { record: CaptureEvidence; previewUrl?: string; onUpdateEvidence: ExistingConditionCapturePanelProps['onUpdateEvidence']; onRemoveEvidence: ExistingConditionCapturePanelProps['onRemoveEvidence']; onError: (message: string) => void }) {
  const unsorted = isUnsorted(record);
  const showImage = previewUrl && !record.mimeType.includes('heic') && !record.mimeType.includes('heif');
  const pick = (category: CaptureCategory) => onUpdateEvidence(record.id, { category, observationTags: record.observationTags?.length ? record.observationTags : [defaultObservationTag(category)] });
  const dismiss = () => void onRemoveEvidence(record.id).catch((reason) => onError(reason instanceof Error ? reason.message : 'The photo could not be removed.'));
  return <div className={`rounded-xl border bg-white p-2.5 ${unsorted ? 'border-[#e0b877]' : 'border-[#c9d6c2]'}`}>
    <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-3">
      <div className="grid h-20 place-items-center overflow-hidden rounded-lg bg-slate-100">{showImage ? <img src={previewUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={22} className="text-slate-400" />}</div>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {unsorted
              ? <p className="flex items-center gap-1.5 text-xs font-bold text-[#8a5a1f]"><HelpCircle size={14} /> What's this one?</p>
              : <p className="flex items-center gap-1.5 text-xs font-bold text-[#345c38]"><Check size={14} strokeWidth={3} /> Looks like {FRIENDLY_VIEW[record.category as Exclude<CaptureCategory, 'unsorted'>].chip}</p>}
            <span className="mt-0.5 block truncate text-[9px] text-slate-400" title={record.fileName}>{record.fileName}</span>
          </div>
          <button type="button" onClick={() => void onRemoveEvidence(record.id).catch((reason) => onError(reason instanceof Error ? reason.message : 'The photo could not be removed.'))} aria-label={`Remove ${record.label}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={12} /></button>
        </div>
        {unsorted
          ? <ViewChooser record={record} onPick={pick} onDismiss={dismiss} />
          : <ConfidentChip record={record} onPick={pick} onDismiss={dismiss} onError={onError} />}
      </div>
    </div>

    <details className="mt-2 rounded-md border border-[#dbe6d5] bg-[#f7faf5] px-2 py-1.5">
      <summary className="cursor-pointer text-[9px] font-bold text-[#3f6b42]">Add detail (optional)</summary>
      <div className="mt-2 grid gap-2">
        <label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Which way was the camera pointing?<input aria-label={`Viewpoint for ${record.label}`} value={record.viewpoint || ''} onChange={(event) => onUpdateEvidence(record.id, { viewpoint: event.target.value })} placeholder="Example: rear yard looking at the house" className="min-h-9 rounded-md border border-slate-300 px-2 text-[10px] font-normal normal-case tracking-normal text-slate-800" /></label>
        <fieldset><legend className="text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">What's visible</legend><div className="mt-1 flex flex-wrap gap-1">{CAPTURE_OBSERVATION_TAGS.map((tag) => { const checked = record.observationTags?.includes(tag.id) || false; return <label key={tag.id} className={`cursor-pointer rounded-full border px-2 py-1 text-[8px] font-semibold ${checked ? 'border-[#3f6b42] bg-[#eef3ea] text-[#345c38]' : 'border-slate-200 bg-white text-slate-500'}`}><input type="checkbox" className="sr-only" checked={checked} onChange={() => onUpdateEvidence(record.id, { observationTags: toggleTag(record.observationTags || [], tag.id) })} />{tag.label}</label>; })}</div></fieldset>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2"><label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Something for scale<input aria-label={`Scale reference for ${record.label}`} value={record.referenceLabel || ''} onChange={(event) => onUpdateEvidence(record.id, { referenceLabel: event.target.value })} placeholder="Tape / known object" className="min-h-9 rounded-md border border-slate-300 px-2 text-[10px] font-normal normal-case tracking-normal text-slate-800" /></label><label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Length (mm)<input aria-label={`Reference length for ${record.label}`} type="number" min="1" max="100000" value={record.referenceDimensionMm || ''} onChange={(event) => onUpdateEvidence(record.id, { referenceDimensionMm: event.target.value ? Number(event.target.value) : null })} className="min-h-9 rounded-md border border-slate-300 px-2 font-mono text-[10px] font-normal normal-case tracking-normal text-slate-800" /></label></div>
        <label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Notes<textarea aria-label={`Condition notes for ${record.label}`} value={record.notes || ''} onChange={(event) => onUpdateEvidence(record.id, { notes: event.target.value })} placeholder="Damage, drainage, obstruction, anything you're unsure about…" rows={2} className="rounded-md border border-slate-300 p-2 text-[10px] font-normal normal-case tracking-normal text-slate-800" /></label>
        <label className="flex cursor-pointer items-start gap-2 text-[9px] leading-4 text-slate-600"><input type="checkbox" checked={record.status === 'homeowner-confirmed' || record.status === 'professional-verified'} disabled={record.status === 'professional-verified'} onChange={(event) => onUpdateEvidence(record.id, { status: event.target.checked ? 'homeowner-confirmed' : 'recorded-unverified', observationTags: event.target.checked && !(record.observationTags?.length) && !isUnsorted(record) ? [defaultObservationTag(record.category)] : record.observationTags })} className="mt-0.5" /><span>I'm confirming this photo shows what it's marked as.</span></label>
        <p className="font-mono text-[8px] leading-3 text-slate-400">{formatBytes(record.byteSize)} · SHA {record.sha256.slice(0, 10)}…</p>
        <p className="text-[8px] leading-3 text-slate-400">A scale reference just documents what's in the photo; it does not measure the deck or replace a tape measurement.</p>
      </div>
    </details>
  </div>;
}

/** Confident guess: a tappable chip that opens the same view chooser so the owner can correct it. */
function ConfidentChip({ record, onPick, onDismiss, onError }: { record: CaptureEvidence; onPick: (category: CaptureCategory) => void; onDismiss: () => void; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const confidence = record.aiCategoryConfidence;
  return <div className="mt-1.5">
    <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-full bg-[#e3ede0] px-2.5 py-1 text-[10px] font-bold text-[#345c38]" aria-expanded={open}>{FRIENDLY_VIEW[record.category as Exclude<CaptureCategory, 'unsorted'>].pick}<span className="text-[9px] font-medium text-[#5c7a55]">· tap to change</span></button>
    {typeof confidence === 'number' && confidence >= AI_CLASSIFICATION_APPLY_THRESHOLD && <span className="ml-2 text-[8px] font-medium text-slate-400">fairly sure</span>}
    {open && <div className="mt-1.5"><QuickChooser current={record.category} onPick={(category) => { onPick(category); setOpen(false); onError(''); }} onDismiss={() => { setOpen(false); onDismiss(); }} /></div>}
  </div>;
}

/** Unsure / unsorted: the friendly "What's this one?" chooser. */
function ViewChooser({ record, onPick, onDismiss }: { record: CaptureEvidence; onPick: (category: CaptureCategory) => void; onDismiss: () => void }) {
  const guess = record.aiCategoryGuess && record.aiCategoryGuess !== 'unsorted' ? FRIENDLY_VIEW[record.aiCategoryGuess as Exclude<CaptureCategory, 'unsorted'>] : null;
  return <div className="mt-1.5">
    {guess && <p className="mb-1 text-[9px] text-[#8a5a1f]">Maybe {guess.chip}? Pick the best match:</p>}
    <QuickChooser current={record.category} onPick={onPick} onDismiss={onDismiss} />
  </div>;
}

/** The shared quick chooser: the 7 real views plus "Not needed" (removes the photo). */
function QuickChooser({ current, onPick, onDismiss }: { current: CaptureCategory; onPick: (category: CaptureCategory) => void; onDismiss: () => void }) {
  return <div className="flex flex-wrap gap-1">
    {REAL_VIEWS.map((category) => <button key={category} type="button" onClick={() => onPick(category)} className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${current === category ? 'border-[#3f6b42] bg-[#eef3ea] text-[#345c38]' : 'border-slate-200 bg-white text-slate-600 hover:border-[#a9c2a0]'}`}>{FRIENDLY_VIEW[category].pick}</button>)}
    <button type="button" onClick={onDismiss} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-semibold text-slate-500 hover:border-red-300 hover:text-red-700">Not needed</button>
  </div>;
}

function AiObservationReview({ capture, linkedOpeningRefs, onDecision, onPromote, onError }: { capture: ExistingConditionCapture; linkedOpeningRefs: string[]; onDecision: ExistingConditionCapturePanelProps['onReviewAiObservation']; onPromote: ExistingConditionCapturePanelProps['onPromoteAiOpening']; onError: (message: string) => void }) {
  const analysis = capture.aiAnalyses![capture.aiAnalyses!.length - 1];
  const openingObservations = analysis.observations.filter((observation) => observation.kind === 'door' || observation.kind === 'window');
  return <section className="border-y border-[#cdbfe0] bg-[#f5f1fb] p-4" aria-label="Doors and windows I spotted"><div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e6def4] text-[#5b46a0]"><Bot size={15} /></span><div><h5 className="text-sm font-bold text-slate-950">Doors and windows I spotted — you decide</h5><p className="mt-1 text-[11px] leading-4 text-slate-600">{analysis.summary}</p><span className="mt-1 block text-[8px] font-semibold text-slate-400">{analysis.generation.model} · {analysis.generation.responseId || 'response not retained'}</span></div></div>{openingObservations.length === 0 ? <p className="mt-3 rounded-lg bg-white p-2 text-[10px] text-slate-500">I didn't spot a clear door or window this time. You can add them by hand below.</p> : <div className="mt-3 grid gap-2">{openingObservations.map((observation) => {
    const source = capture.evidence.find((record) => record.id === observation.sourceEvidenceId);
    const sourceRef = `${analysis.id}:${observation.id}`;
    const linked = linkedOpeningRefs.includes(sourceRef);
    return <article key={observation.id} className="rounded-lg border border-[#cdbfe0] bg-white p-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-[11px] font-bold capitalize text-[#4b3a86]">{observation.kind}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-bold text-slate-600">{Math.round(observation.confidence * 100)}% sure</span><span className="text-[8px] text-slate-400">From: {source?.label || observation.sourceEvidenceId}</span></div><p className="mt-1 text-[11px] leading-4 text-slate-700">{observation.description}</p><p className="mt-1 flex items-center gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-[#8a5a1f]"><Lock size={9} /> A photo shows it's there — it doesn't measure it</p>{observation.uncertainties.length > 0 && <p className="mt-1 text-[8px] leading-3 text-slate-500">Not sure about: {observation.uncertainties.join(' · ')}</p>}<div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => onDecision(analysis.id, observation.id, 'homeowner-accepted')} className={`min-h-8 rounded-md border text-[9px] font-bold ${observation.decision === 'homeowner-accepted' ? 'border-[#3f6b42] bg-[#eef3ea] text-[#345c38]' : 'border-slate-300 text-slate-700'}`}>Yes, that's real</button><button type="button" onClick={() => onDecision(analysis.id, observation.id, 'homeowner-rejected')} className={`min-h-8 rounded-md border text-[9px] font-bold ${observation.decision === 'homeowner-rejected' ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300 text-slate-700'}`}>No, skip it</button></div>{observation.decision === 'homeowner-accepted' && <button type="button" disabled={linked} onClick={() => { try { onPromote(analysis.id, observation.id); onError(''); } catch (reason) { onError(reason instanceof Error ? reason.message : 'The observed opening could not be added.'); } }} className="mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-[#5b46a0] px-3 text-[9px] font-bold text-white disabled:bg-[#e3ede0] disabled:text-[#345c38]"><Plus size={12} />{linked ? 'Added to your wall' : `Add this ${observation.kind} to your wall`}</button>}</article>;
  })}</div>}{analysis.unknowns.length > 0 && <p className="mt-3 rounded-lg bg-white p-2 text-[9px] leading-4 text-slate-600"><strong>Still unclear:</strong> {analysis.unknowns.join(' · ')}</p>}</section>;
}

/** A photo needs sorting until it carries a real view category (confident AI fill or a hand pick). */
function isUnsorted(record: CaptureEvidence): boolean {
  return record.category === 'unsorted';
}

function toggleTag(tags: CaptureObservationTag[], tag: CaptureObservationTag): CaptureObservationTag[] {
  return tags.includes(tag) ? tags.filter((candidate) => candidate !== tag) : [...tags, tag];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
