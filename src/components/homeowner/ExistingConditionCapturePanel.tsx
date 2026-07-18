import { Camera, Check, Circle, Image as ImageIcon, Loader2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import type { CaptureCategory, CaptureEvidence, ExistingConditionCapture, ExistingConditionCaptureAssessment } from '../../domain/siteModel';

interface ExistingConditionCapturePanelProps {
  capture: ExistingConditionCapture;
  assessment: ExistingConditionCaptureAssessment;
  previewUrls: Record<string, string>;
  onAddFiles: (category: CaptureCategory, files: File[]) => Promise<void>;
  onUpdateEvidence: (evidenceId: string, changes: Partial<Pick<CaptureEvidence, 'category' | 'label' | 'notes' | 'status'>>) => void;
  onRemoveEvidence: (evidenceId: string) => Promise<void>;
}

/** Guides a homeowner through the minimum visual evidence needed to model existing conditions. */
export function ExistingConditionCapturePanel({ capture, assessment, previewUrls, onAddFiles, onUpdateEvidence, onRemoveEvidence }: ExistingConditionCapturePanelProps) {
  const [busyCategory, setBusyCategory] = useState<CaptureCategory | null>(null);
  const [error, setError] = useState('');
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
        <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-800"><Camera size={19} /></span><div><h4 id="capture-title" className="text-sm font-bold text-slate-950">Photograph the real house and yard</h4><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">These photos become private source evidence for the existing-condition model. AI may propose findings later, but no photo automatically becomes a dimension or structural fact.</p></div></div>
        <div className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-right"><strong className="block text-sm tabular-nums text-sky-950">{assessment.recordedRequiredCount}/{assessment.requiredCount}</strong><span className="text-[9px] font-bold uppercase tracking-[.1em] text-sky-700">required views recorded</span></div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-600"><ShieldCheck size={15} className="shrink-0 text-emerald-700" /><span>Stored only in this browser. Nothing is uploaded or shared until the homeowner explicitly publishes a professional-review package.</span></div>
    </header>

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
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-[9px] leading-4 text-slate-600"><input type="checkbox" checked={record.status === 'homeowner-confirmed' || record.status === 'professional-verified'} disabled={record.status === 'professional-verified'} onChange={(event) => onUpdateEvidence(record.id, { status: event.target.checked ? 'homeowner-confirmed' : 'recorded-unverified' })} className="mt-0.5" /><span>I confirm this photo shows the requested view.</span></label>
            </div>
          </div>)}</div>}
        </article>;
      })}
    </div>
    {error && <p className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">{error}</p>}
    <footer className="border-t border-sky-200 bg-white px-4 py-3 text-[10px] leading-4 text-slate-500">JPEG, PNG, WebP, HEIC or HEIF · 30 MB maximum each. Original files and metadata remain local; consider disabling location metadata before sharing a final review package.</footer>
  </section>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
