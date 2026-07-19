import { ClipboardCheck, MapPinned, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { assessTerrainFieldRecord, type AddTerrainGradePointInput, type CaptureEvidence, type RecordTerrainFieldInput, type TerrainDatum, type TerrainGradePoint, type TerrainSurface } from '../../domain/siteModel';

interface TerrainCapturePanelProps {
  terrain: TerrainSurface;
  onUpdateDatum: (changes: Partial<Omit<TerrainDatum, 'id'>>) => void;
  onAddPoint: (point: AddTerrainGradePointInput) => void;
  onUpdatePoint: (pointId: string, changes: Partial<Omit<TerrainGradePoint, 'id'>>) => void;
  onRemovePoint: (pointId: string) => void;
  captureEvidence: CaptureEvidence[];
  onRecord: (input: RecordTerrainFieldInput) => void;
}

/** Records grade observations that locate platforms, stairs, posts, and footings vertically. */
export function TerrainCapturePanel({ terrain, onUpdateDatum, onAddPoint, onUpdatePoint, onRemovePoint, captureEvidence, onRecord }: TerrainCapturePanelProps) {
  const assessment = assessTerrainFieldRecord(terrain);
  const [recordedBy, setRecordedBy] = useState(terrain.fieldRecord?.recordedBy || '');
  const [recordedAt, setRecordedAt] = useState(terrain.fieldRecord?.recordedAt || new Date().toISOString().slice(0, 10));
  const [instrument, setInstrument] = useState<RecordTerrainFieldInput['instrument']>(terrain.fieldRecord?.instrument || 'laser-level');
  const [benchmarkDescription, setBenchmarkDescription] = useState(terrain.fieldRecord?.benchmark.description || '');
  const [sourceEvidenceIds, setSourceEvidenceIds] = useState<string[]>(terrain.fieldRecord?.sourceEvidenceIds || []);
  const [notes, setNotes] = useState(terrain.fieldRecord?.notes || '');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const addPoint = () => onAddPoint({
    label: `Grade point ${terrain.gradePoints.length + 1}`,
    xMm: 0,
    yMm: terrain.gradePoints.length * 2000 + 1000,
    elevationMm: terrain.datum.elevationMm,
    source: 'assumed-datum',
    verificationStatus: 'reference',
    notes: '',
  });
  const record = () => {
    try {
      onRecord({ id: globalThis.crypto?.randomUUID?.() || `GR-${Date.now()}`, recordedBy, recordedAt, instrument, benchmarkDescription, sourceEvidenceIds, notes });
      setConfirmed(false); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The local-grade worksheet could not be recorded.'); }
  };
  return <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4" aria-labelledby="terrain-capture-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-800"><MapPinned size={18} /></span><div><h4 id="terrain-capture-title" className="text-sm font-bold text-slate-950">Ground levels & grade points</h4><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Record actual ground elevations around the future deck. X runs along the selected house wall; Y runs away from it into the yard. These points determine stair rise, post height, guard requirements, and footing elevations.</p></div></div>
      <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${assessment.current ? 'bg-emerald-100 text-emerald-900' : assessment.status === 'stale' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>{assessment.current ? `${terrain.gradePoints.length} controlled observations` : assessment.status.replace(/-/g, ' ')}</span>
    </div>

    <div className="mt-4 grid gap-3 rounded-lg border border-violet-200 bg-white p-3 sm:grid-cols-[1fr_150px_180px]">
      <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[.09em] text-slate-500">Vertical reference<input value={terrain.datum.label} onChange={(event) => onUpdateDatum({ label: event.target.value })} className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold normal-case tracking-normal text-slate-800" /></label>
      <CommittedNumber label="Datum elevation" value={terrain.datum.elevationMm} suffix="mm" onCommit={(elevationMm) => onUpdateDatum({ elevationMm })} />
      <div className="grid gap-1 text-[10px] font-bold uppercase tracking-[.09em] text-slate-500">Datum evidence<div className="flex min-h-10 items-center rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold normal-case tracking-normal text-slate-800">{assessment.current ? 'Controlled field worksheet' : assessment.status === 'stale' ? 'Worksheet stale' : 'Assumed reference'}</div></div>
    </div>

    {terrain.gradePoints.length ? <div className="mt-3 grid gap-2">{terrain.gradePoints.map((point) => <article key={point.id} className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-2 lg:grid-cols-[72px_minmax(120px,1fr)_100px_100px_110px_170px_40px] lg:items-end">
        <div><span className="text-[9px] font-bold uppercase tracking-[.1em] text-violet-600">Point</span><strong className="mt-1 block text-xs text-slate-900">{point.id}</strong></div>
        <label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Label<input value={point.label} onChange={(event) => onUpdatePoint(point.id, { label: event.target.value })} className="min-h-9 rounded-md border border-slate-300 px-2 text-xs font-semibold normal-case tracking-normal text-slate-800" /></label>
        <CommittedNumber label="X along wall" value={point.xMm} suffix="mm" onCommit={(xMm) => onUpdatePoint(point.id, { xMm })} />
        <CommittedNumber label="Y into yard" value={point.yMm} suffix="mm" onCommit={(yMm) => onUpdatePoint(point.id, { yMm })} />
        <CommittedNumber label="Elevation" value={point.elevationMm} suffix="mm" onCommit={(elevationMm) => onUpdatePoint(point.id, { elevationMm })} />
        <div className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Evidence<div className="flex min-h-9 items-center rounded-md border border-slate-300 bg-slate-50 px-2 text-[10px] font-semibold normal-case tracking-normal text-slate-700">{assessment.current && point.verificationStatus === 'professional-verified' ? 'Professional record' : assessment.current ? 'Controlled field worksheet' : 'Provisional · worksheet required'}</div></div>
        <button type="button" onClick={() => onRemovePoint(point.id)} aria-label={`Remove ${point.label}`} className="grid h-9 w-9 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={14} /></button>
      </div>
    </article>)}</div> : <div className="mt-3 rounded-lg border border-dashed border-violet-300 bg-white/70 p-4 text-center"><strong className="text-xs text-slate-800">No local grade has been measured</strong><p className="mt-1 text-[10px] leading-4 text-slate-500">Until points are recorded, every ground-dependent result uses the assumed datum and remains blocked for professional issue.</p></div>}

    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] leading-4 text-slate-500">Shape the point list first. Points remain provisional until the complete worksheet below is recorded; professional verification belongs to the review evidence record.</p><button type="button" onClick={addPoint} className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-4 text-xs font-bold text-violet-900"><Plus size={14} /> Add grade point</button></div>

    <div className="mt-4 overflow-hidden rounded-xl border border-violet-300 bg-white">
      <div className="border-b border-violet-200 bg-violet-50 p-4"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-800"><ClipboardCheck size={17} /></span><div><h5 className="text-sm font-bold text-slate-950">Local-grade field worksheet</h5><p className="mt-1 text-[10px] leading-4 text-slate-600">Tie every point to one recoverable benchmark with one field instrument. Saving records the current X, Y and elevation values as a single evidence-controlled surface.</p></div></div><p className="mt-3 flex gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-[9px] leading-4 text-violet-950"><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span>Homeowner measurements remain unverified until accepted by the appropriate reviewer. This workflow cannot claim a legal survey or professional verification.</span></p>{assessment.messages.length > 0 && <ul className="mt-2 grid gap-1 text-[9px] leading-4 text-slate-600">{assessment.messages.map((message) => <li key={message}>• {message}</li>)}</ul>}</div>
      <div className="grid gap-3 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500 sm:col-span-2">Measured by<input value={recordedBy} onChange={(event) => setRecordedBy(event.target.value)} placeholder="Homeowner / technician name" className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold normal-case tracking-normal" /></label><label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Date<input type="date" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold normal-case tracking-normal" /></label><label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Instrument<select value={instrument} onChange={(event) => setInstrument(event.target.value as typeof instrument)} className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold normal-case tracking-normal"><option value="laser-level">Laser level</option><option value="rotary-laser">Rotary laser</option><option value="optical-level">Optical / builder level</option><option value="total-station">Total station</option></select></label></div>
        <label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Recoverable benchmark description<input value={benchmarkDescription} onChange={(event) => setBenchmarkDescription(event.target.value)} placeholder="Example: pencil mark on rear foundation, 150 mm below D1 threshold" className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold normal-case tracking-normal" /></label>
        {captureEvidence.length > 0 && <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3"><legend className="px-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Corroborating photos or measured sketch</legend><div className="flex flex-wrap gap-2">{captureEvidence.map((record) => <label key={record.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[9px] font-semibold ${sourceEvidenceIds.includes(record.id) ? 'border-violet-500 bg-violet-50 text-violet-900' : 'border-slate-200 bg-white text-slate-500'}`}><input type="checkbox" checked={sourceEvidenceIds.includes(record.id)} onChange={() => setSourceEvidenceIds((current) => current.includes(record.id) ? current.filter((id) => id !== record.id) : [...current, record.id])} className="sr-only" />{record.label}</label>)}</div></fieldset>}
        <label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Level-loop and field notes<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Setup location, backsight/foresight checks, obstructions, repeated readings…" className="rounded-md border border-slate-300 p-3 text-xs font-normal normal-case tracking-normal" /></label>
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-950"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" /><span><strong>I directly measured the benchmark and every listed grade point with this instrument.</strong> I understand provisional, GIS, photo, or assumed values must be replaced before saving.</span></label>
        <button type="button" disabled={!confirmed || !recordedBy.trim() || !recordedAt || !benchmarkDescription.trim() || terrain.gradePoints.length < 3} onClick={record} className="min-h-11 rounded-lg bg-violet-800 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Record controlled grade worksheet</button>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-[10px] leading-4 text-red-800">{error}</p>}
      </div>
    </div>
  </section>;
}

function CommittedNumber({ label, value, suffix, onCommit }: { label: string; value: number; suffix: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const parsed = Number(draft); if (Number.isFinite(parsed)) onCommit(parsed); else setDraft(String(value)); };
  return <label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500"><span>{label}</span><span className="flex min-h-9 overflow-hidden rounded-md border border-slate-300 bg-white"><input aria-label={label} type="number" step="10" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { commit(); event.currentTarget.blur(); } }} className="min-w-0 flex-1 px-2 text-right text-xs font-semibold normal-case tracking-normal text-slate-800 outline-none" /><span className="self-center pr-2 text-[9px] font-semibold normal-case tracking-normal text-slate-400">{suffix}</span></span></label>;
}
