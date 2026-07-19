import { Crosshair, MousePointer2, RotateCcw, Ruler, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState, type PointerEvent } from 'react';
import { derivePhotoOpeningMeasurement, type ApplyPhotoWallCalibrationInput, type HouseOpening, type NormalizedPhotoBox, type NormalizedPhotoPoint, type SiteModel } from '../../domain/siteModel';

interface PhotoWallCalibrationPanelProps {
  site: SiteModel;
  previewUrls: Record<string, string>;
  onApply: (input: ApplyPhotoWallCalibrationInput) => void;
}

type PointKey = 'horizontalStart' | 'horizontalEnd' | 'verticalStart' | 'verticalEnd' | 'boxStart' | 'boxEnd';
type Points = Partial<Record<PointKey, NormalizedPhotoPoint>>;
const POINT_ORDER: PointKey[] = ['horizontalStart', 'horizontalEnd', 'verticalStart', 'verticalEnd', 'boxStart', 'boxEnd'];
const POINT_LABEL: Record<PointKey, string> = { horizontalStart: 'H1 · measured horizontal start', horizontalEnd: 'H2 · measured horizontal end', verticalStart: 'V1 · measured vertical start', verticalEnd: 'V2 · measured vertical end', boxStart: 'O1 · opening corner', boxEnd: 'O2 · opposite opening corner' };

/** Calibrates one planar wall photo from explicit homeowner measurements and click geometry. */
export function PhotoWallCalibrationPanel({ site, previewUrls, onApply }: PhotoWallCalibrationPanelProps) {
  const evidence = site.capture.evidence.filter((record) => previewUrls[record.id] && !record.mimeType.includes('heic') && !record.mimeType.includes('heif'));
  const [sourceEvidenceId, setSourceEvidenceId] = useState(evidence[0]?.id || '');
  const [openingChoice, setOpeningChoice] = useState(site.designWall.openings[0] ? `existing:${site.designWall.openings[0].id}` : 'new:door');
  const [horizontalLabel, setHorizontalLabel] = useState('Measured wall segment');
  const [horizontalDistance, setHorizontalDistance] = useState('');
  const [verticalLabel, setVerticalLabel] = useState('Measured vertical reference');
  const [verticalDistance, setVerticalDistance] = useState('');
  const [recordedBy, setRecordedBy] = useState(site.measuredBy || '');
  const [recordedAt, setRecordedAt] = useState(new Date().toISOString().slice(0, 10));
  const [points, setPoints] = useState<Points>({});
  const [error, setError] = useState('');
  const [imageSize, setImageSize] = useState({ width: 4, height: 3 });
  useEffect(() => { if (!evidence.some((record) => record.id === sourceEvidenceId)) setSourceEvidenceId(evidence[0]?.id || ''); }, [evidence, sourceEvidenceId]);
  useEffect(() => { if (!recordedBy && site.measuredBy) setRecordedBy(site.measuredBy); }, [recordedBy, site.measuredBy]);

  const selectedOpening = openingChoice.startsWith('existing:') ? site.designWall.openings.find((opening) => opening.id === openingChoice.slice(9)) : null;
  const openingKind: HouseOpening['kind'] = selectedOpening?.kind || (openingChoice.endsWith('window') ? 'window' : 'door');
  const nextPoint = POINT_ORDER.find((key) => !points[key]);
  const openingBox = boxFromPoints(points.boxStart, points.boxEnd);
  const calibrationInput = completeCalibrationInput(points, openingBox, horizontalLabel, Number(horizontalDistance), verticalLabel, Number(verticalDistance));
  const derived = useMemo(() => {
    if (!calibrationInput) return null;
    try { return { value: derivePhotoOpeningMeasurement(calibrationInput), error: '' }; }
    catch (reason) { return { value: null, error: reason instanceof Error ? reason.message : 'The calibration geometry is invalid.' }; }
  }, [calibrationInput]);
  const aiBox = findAiBox(site, selectedOpening, sourceEvidenceId);

  const recordPoint = (event: PointerEvent<HTMLDivElement>) => {
    if (!nextPoint) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
    setPoints((current) => ({ ...current, [nextPoint]: point }));
    setError('');
  };
  const apply = () => {
    if (!calibrationInput || !derived?.value || !sourceEvidenceId) { setError(derived?.error || 'Complete all six photo points and both measured reference distances.'); return; }
    try {
      onApply({ id: globalThis.crypto?.randomUUID?.() || `cal-${Date.now()}`, sourceEvidenceId, openingId: selectedOpening?.id || null, openingKind, ...calibrationInput, recordedBy, recordedAt });
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The calibrated opening could not be applied.'); }
  };

  return <section className="mt-5 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/40" aria-labelledby="photo-calibration-title">
    <header className="border-b border-emerald-200 bg-white p-4"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800"><Crosshair size={19} /></span><div><h4 id="photo-calibration-title" className="text-sm font-bold text-slate-950">Measure the wall from a calibrated photo</h4><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Choose a straight-on wall photo. Click two ends of a horizontal distance you measured, two ends of a vertical distance you measured, then opposite corners of one door or window. The app converts those clicks into wall-plane dimensions and keeps the source, measurements, and uncertainty attached.</p></div></div>
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-950"><strong>What this can prove:</strong> an approximate location and size on one visible wall plane. It cannot infer scale from pixels, replace a site measurement, correct strong perspective, locate grade behind obstructions, or reveal framing.</div>
    </header>
    {!evidence.length ? <div className="p-5 text-center text-xs text-slate-600">Add a JPEG, PNG, or WebP design-wall photo above. HEIC originals remain in evidence but need a browser-viewable copy for calibration.</div> : <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
      <div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Source photo<select value={sourceEvidenceId} onChange={(event) => { setSourceEvidenceId(event.target.value); setPoints({}); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-normal normal-case tracking-normal text-slate-800">{evidence.map((record) => <option key={record.id} value={record.id}>{record.label} · {record.fileName}</option>)}</select></label><label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Opening to measure<select value={openingChoice} onChange={(event) => { setOpeningChoice(event.target.value); setPoints({}); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-normal normal-case tracking-normal text-slate-800"><option value="new:door">New exterior door</option><option value="new:window">New window</option>{site.designWall.openings.map((opening) => <option key={opening.id} value={`existing:${opening.id}`}>Update {opening.id} · {opening.kind}</option>)}</select></label></div>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-300 bg-slate-950" style={{ aspectRatio: `${imageSize.width}/${imageSize.height}` }}>
          <div className={`relative h-full w-full ${nextPoint ? 'cursor-crosshair' : 'cursor-default'}`} onPointerDown={recordPoint} aria-label={nextPoint ? `Photo calibration: click ${POINT_LABEL[nextPoint]}` : 'Photo calibration points complete'}>
            <img src={previewUrls[sourceEvidenceId]} alt="Selected wall calibration source" draggable={false} onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth || 4, height: event.currentTarget.naturalHeight || 3 })} className="absolute inset-0 h-full w-full select-none" />
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">{renderLine(points.horizontalStart, points.horizontalEnd, '#34d399')}{renderLine(points.verticalStart, points.verticalEnd, '#38bdf8')}{openingBox && <rect x={openingBox.x * 1000} y={openingBox.y * 1000} width={openingBox.width * 1000} height={openingBox.height * 1000} fill="rgba(251,191,36,.16)" stroke="#fbbf24" strokeWidth="5" strokeDasharray="18 10" vectorEffect="non-scaling-stroke" />}{POINT_ORDER.map((key) => points[key] ? <g key={key}><circle cx={points[key]!.x * 1000} cy={points[key]!.y * 1000} r="13" fill="#fff" stroke={key.startsWith('horizontal') ? '#059669' : key.startsWith('vertical') ? '#0284c7' : '#d97706'} strokeWidth="5" vectorEffect="non-scaling-stroke" /><text x={points[key]!.x * 1000 + 18} y={points[key]!.y * 1000 - 16} fill="#fff" fontSize="24" fontWeight="700" style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 8 }}>{key === 'horizontalStart' ? 'H1' : key === 'horizontalEnd' ? 'H2' : key === 'verticalStart' ? 'V1' : key === 'verticalEnd' ? 'V2' : key === 'boxStart' ? 'O1' : 'O2'}</text></g> : null)}</svg>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><span className="flex min-h-9 flex-1 items-center gap-2 rounded-lg bg-slate-900 px-3 text-[10px] font-bold text-white"><MousePointer2 size={13} />{nextPoint ? `Next: ${POINT_LABEL[nextPoint]}` : 'All photo points recorded'}</span><button type="button" disabled={!POINT_ORDER.some((key) => points[key])} onClick={() => { const latest = [...POINT_ORDER].reverse().find((key) => points[key]); if (latest) setPoints((current) => { const next = { ...current }; delete next[latest]; return next; }); }} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[9px] font-bold disabled:opacity-40"><Undo2 size={12} /> Undo point</button><button type="button" onClick={() => setPoints({})} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[9px] font-bold"><RotateCcw size={12} /> Reset</button>{aiBox && <button type="button" onClick={() => setPoints((current) => ({ ...current, boxStart: { x: aiBox.x, y: aiBox.y }, boxEnd: { x: aiBox.x + aiBox.width, y: aiBox.y + aiBox.height } }))} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 text-[9px] font-bold text-violet-900"><Sparkles size={12} /> Use accepted AI outline</button>}</div>
      </div>
      <div className="grid content-start gap-3">
        <fieldset className="rounded-xl border border-emerald-200 bg-white p-3"><legend className="px-1 text-[9px] font-bold uppercase tracking-[.1em] text-emerald-800">1 · Known distances</legend><div className="grid gap-3"><ReferenceField label="Horizontal reference" name={horizontalLabel} distance={horizontalDistance} onName={setHorizontalLabel} onDistance={setHorizontalDistance} placeholder="Wall / tape segment" /><ReferenceField label="Vertical reference" name={verticalLabel} distance={verticalDistance} onName={setVerticalLabel} onDistance={setVerticalDistance} placeholder="Door / laser height" /></div><p className="mt-2 text-[9px] leading-4 text-slate-500">Enter measurements you actually took. A standard-object assumption is not a field measurement.</p></fieldset>
        <fieldset className="rounded-xl border border-slate-200 bg-white p-3"><legend className="px-1 text-[9px] font-bold uppercase tracking-[.1em] text-slate-600">2 · Measurement record</legend><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Measured by<input value={recordedBy} onChange={(event) => setRecordedBy(event.target.value)} placeholder="Homeowner name" className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-normal normal-case tracking-normal" /></label><label className="grid gap-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">Date<input type="date" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-normal normal-case tracking-normal" /></label></div></fieldset>
        <div className={`rounded-xl border p-3 ${derived?.value ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div className="flex items-center gap-2"><Ruler size={15} className="text-emerald-800" /><strong className="text-xs text-slate-900">Derived wall-plane result</strong></div>{derived?.value ? <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><Result label="Offset" value={derived.value.offsetMm} /><Result label="Width" value={derived.value.widthMm} /><Result label="Sill / threshold" value={derived.value.sillHeightMm} /><Result label="Opening height" value={derived.value.heightMm} /></dl> : <p className="mt-2 text-[10px] leading-4 text-slate-500">Complete the six points and reference distances to preview the result.</p>}{derived?.error && <p className="mt-2 text-[9px] leading-4 text-red-700">{derived.error}</p>}</div>
        <button type="button" disabled={!derived?.value || !recordedBy.trim() || !recordedAt} onClick={apply} className="min-h-11 rounded-lg bg-emerald-800 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Apply calibrated {openingKind} to wall model</button>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-[10px] leading-4 text-red-800">{error}</p>}
      </div>
    </div>}
    {(site.capture.wallCalibrations?.length || 0) > 0 && <footer className="border-t border-emerald-200 bg-white px-4 py-3 text-[10px] text-slate-600"><strong>{site.capture.wallCalibrations!.length} calibrated opening record{site.capture.wallCalibrations!.length === 1 ? '' : 's'}</strong> · source clicks, entered distances, derived dimensions, measurer, date, and warnings are controlled with the project fingerprint.</footer>}
  </section>;
}

function completeCalibrationInput(points: Points, openingBox: NormalizedPhotoBox | null, horizontalLabel: string, horizontalDistance: number, verticalLabel: string, verticalDistance: number): Omit<ApplyPhotoWallCalibrationInput, 'id' | 'sourceEvidenceId' | 'openingId' | 'openingKind' | 'recordedBy' | 'recordedAt'> | null {
  if (!points.horizontalStart || !points.horizontalEnd || !points.verticalStart || !points.verticalEnd || !openingBox || !horizontalDistance || !verticalDistance) return null;
  return { horizontalReference: { label: horizontalLabel, start: points.horizontalStart, end: points.horizontalEnd, distanceMm: horizontalDistance }, verticalReference: { label: verticalLabel, start: points.verticalStart, end: points.verticalEnd, distanceMm: verticalDistance }, openingBox };
}
function boxFromPoints(first?: NormalizedPhotoPoint, second?: NormalizedPhotoPoint): NormalizedPhotoBox | null { if (!first || !second) return null; return { x: Math.min(first.x, second.x), y: Math.min(first.y, second.y), width: Math.abs(second.x - first.x), height: Math.abs(second.y - first.y) }; }
function findAiBox(site: SiteModel, opening: HouseOpening | null | undefined, sourceEvidenceId: string): NormalizedPhotoBox | null { const refs = new Set(opening?.sourceAiObservationRefs || []); for (const analysis of site.capture.aiAnalyses || []) for (const observation of analysis.observations) if (refs.has(`${analysis.id}:${observation.id}`) && observation.sourceEvidenceId === sourceEvidenceId && observation.boundingBox) return observation.boundingBox; return null; }
function renderLine(start: NormalizedPhotoPoint | undefined, end: NormalizedPhotoPoint | undefined, color: string) { return start && end ? <line x1={start.x * 1000} y1={start.y * 1000} x2={end.x * 1000} y2={end.y * 1000} stroke={color} strokeWidth="6" strokeDasharray="18 10" vectorEffect="non-scaling-stroke" /> : null; }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function ReferenceField({ label, name, distance, onName, onDistance, placeholder }: { label: string; name: string; distance: string; onName: (value: string) => void; onDistance: (value: string) => void; placeholder: string }) { return <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2"><label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">{label}<input value={name} onChange={(event) => onName(event.target.value)} placeholder={placeholder} className="min-h-10 rounded-lg border border-slate-300 px-2 text-[10px] font-normal normal-case tracking-normal" /></label><label className="grid gap-1 text-[8px] font-bold uppercase tracking-[.08em] text-slate-500">Distance (mm)<input type="number" min="300" max="100000" value={distance} onChange={(event) => onDistance(event.target.value)} placeholder="Measure" className="min-h-10 rounded-lg border border-slate-300 px-2 text-[10px] font-normal normal-case tracking-normal" /></label></div>; }
function Result({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-white px-2 py-2"><dt className="text-[8px] font-bold uppercase tracking-[.08em] text-slate-400">{label}</dt><dd className="mt-1 font-bold tabular-nums text-slate-900">{value.toLocaleString()} mm</dd></div>; }
