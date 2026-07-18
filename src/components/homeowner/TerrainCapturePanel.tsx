import { MapPinned, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AddTerrainGradePointInput, TerrainDatum, TerrainGradePoint, TerrainSurface } from '../../domain/siteModel';

interface TerrainCapturePanelProps {
  terrain: TerrainSurface;
  onUpdateDatum: (changes: Partial<Omit<TerrainDatum, 'id'>>) => void;
  onAddPoint: (point: AddTerrainGradePointInput) => void;
  onUpdatePoint: (pointId: string, changes: Partial<Omit<TerrainGradePoint, 'id'>>) => void;
  onRemovePoint: (pointId: string) => void;
}

/** Records grade observations that locate platforms, stairs, posts, and footings vertically. */
export function TerrainCapturePanel({ terrain, onUpdateDatum, onAddPoint, onUpdatePoint, onRemovePoint }: TerrainCapturePanelProps) {
  const addPoint = () => onAddPoint({
    label: `Grade point ${terrain.gradePoints.length + 1}`,
    xMm: 0,
    yMm: terrain.gradePoints.length * 2000 + 1000,
    elevationMm: terrain.datum.elevationMm,
    source: 'homeowner-measurement',
    verificationStatus: 'recorded',
    notes: '',
  });
  return <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4" aria-labelledby="terrain-capture-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-800"><MapPinned size={18} /></span><div><h4 id="terrain-capture-title" className="text-sm font-bold text-slate-950">Ground levels & grade points</h4><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Record actual ground elevations around the future deck. X runs along the selected house wall; Y runs away from it into the yard. These points determine stair rise, post height, guard requirements, and footing elevations.</p></div></div>
      <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${terrain.gradePoints.length >= 3 ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{terrain.gradePoints.length >= 3 ? `${terrain.gradePoints.length} observations` : '3+ points recommended'}</span>
    </div>

    <div className="mt-4 grid gap-3 rounded-lg border border-violet-200 bg-white p-3 sm:grid-cols-[1fr_150px_180px]">
      <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[.09em] text-slate-500">Vertical reference<input value={terrain.datum.label} onChange={(event) => onUpdateDatum({ label: event.target.value })} className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold normal-case tracking-normal text-slate-800" /></label>
      <CommittedNumber label="Datum elevation" value={terrain.datum.elevationMm} suffix="mm" onCommit={(elevationMm) => onUpdateDatum({ elevationMm })} />
      <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[.09em] text-slate-500">Datum status<select value={terrain.datum.verificationStatus} onChange={(event) => onUpdateDatum({ verificationStatus: event.target.value as TerrainDatum['verificationStatus'] })} className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold normal-case tracking-normal text-slate-800"><option value="reference">Assumed reference</option><option value="recorded">Tied to measurement</option><option value="professional-verified">Professionally verified</option></select></label>
    </div>

    {terrain.gradePoints.length ? <div className="mt-3 grid gap-2">{terrain.gradePoints.map((point) => <article key={point.id} className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-2 lg:grid-cols-[72px_minmax(120px,1fr)_100px_100px_110px_170px_40px] lg:items-end">
        <div><span className="text-[9px] font-bold uppercase tracking-[.1em] text-violet-600">Point</span><strong className="mt-1 block text-xs text-slate-900">{point.id}</strong></div>
        <label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Label<input value={point.label} onChange={(event) => onUpdatePoint(point.id, { label: event.target.value })} className="min-h-9 rounded-md border border-slate-300 px-2 text-xs font-semibold normal-case tracking-normal text-slate-800" /></label>
        <CommittedNumber label="X along wall" value={point.xMm} suffix="mm" onCommit={(xMm) => onUpdatePoint(point.id, { xMm })} />
        <CommittedNumber label="Y into yard" value={point.yMm} suffix="mm" onCommit={(yMm) => onUpdatePoint(point.id, { yMm })} />
        <CommittedNumber label="Elevation" value={point.elevationMm} suffix="mm" onCommit={(elevationMm) => onUpdatePoint(point.id, { elevationMm })} />
        <label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Evidence<select value={point.source} onChange={(event) => onUpdatePoint(point.id, { source: event.target.value as TerrainGradePoint['source'] })} className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold normal-case tracking-normal text-slate-800"><option value="homeowner-measurement">Tape / laser level</option><option value="lidar-scan">LiDAR scan</option><option value="survey">Survey</option><option value="assumed-datum">Reference only</option></select></label>
        <button type="button" onClick={() => onRemovePoint(point.id)} aria-label={`Remove ${point.label}`} className="grid h-9 w-9 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={14} /></button>
      </div>
    </article>)}</div> : <div className="mt-3 rounded-lg border border-dashed border-violet-300 bg-white/70 p-4 text-center"><strong className="text-xs text-slate-800">No local grade has been measured</strong><p className="mt-1 text-[10px] leading-4 text-slate-500">Until points are recorded, every ground-dependent result uses the assumed datum and remains blocked for professional issue.</p></div>}

    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] leading-4 text-slate-500">A survey point may be entered here, but its document and professional verification still belong in the evidence/review record.</p><button type="button" onClick={addPoint} className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-4 text-xs font-bold text-violet-900"><Plus size={14} /> Add grade point</button></div>
  </section>;
}

function CommittedNumber({ label, value, suffix, onCommit }: { label: string; value: number; suffix: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const parsed = Number(draft); if (Number.isFinite(parsed)) onCommit(parsed); else setDraft(String(value)); };
  return <label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500"><span>{label}</span><span className="flex min-h-9 overflow-hidden rounded-md border border-slate-300 bg-white"><input aria-label={label} type="number" step="10" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { commit(); event.currentTarget.blur(); } }} className="min-w-0 flex-1 px-2 text-right text-xs font-semibold normal-case tracking-normal text-slate-800 outline-none" /><span className="self-center pr-2 text-[9px] font-semibold normal-case tracking-normal text-slate-400">{suffix}</span></span></label>;
}
