import { AlertTriangle, ArrowRight, Building2, CheckCircle2, DoorOpen, ExternalLink, Loader2, MapPin, Plus, Ruler, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyPhotoWallCalibration, recordExistingConditionFieldSurvey, recordTerrainFieldSurvey, type AddTerrainGradePointInput, type ApplyPhotoWallCalibrationInput, type CaptureCategory, type CaptureEvidenceChanges, type ExistingConditionCaptureAssessment, type RecordExistingConditionFieldSurveyInput, type RecordTerrainFieldInput, type SiteModel, type TerrainDatum, type TerrainGradePoint } from '../../domain/siteModel';
import type { Address, Property } from '../../types';
import { PropertyContextPlan } from './PropertyContextPlan';
import { TerrainCapturePanel } from './TerrainCapturePanel';
import { ExistingConditionCapturePanel } from './ExistingConditionCapturePanel';
import { PhotoWallCalibrationPanel } from './PhotoWallCalibrationPanel';
import { ExistingConditionFieldSurveyPanel } from './ExistingConditionFieldSurveyPanel';

export type PropertyResearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; suggestions: string[] }
  | { status: 'success' };

interface PropertyStageProps {
  property: Property;
  site: SiteModel | null;
  research: PropertyResearchState;
  onResearch: (address: string) => void;
  onResearchAddress: (address: Address) => void;
  onSuggestAddresses: (query: string, maxResults?: number) => Promise<Address[]>;
  onSelectWall: (buildingId: string, edgeIndex: number) => void;
  onUpdateSite: (changes: Partial<Omit<SiteModel, 'schema' | 'units' | 'designWall'>>, wallChanges?: Partial<SiteModel['designWall']>) => void;
  onUpdateTerrainDatum: (changes: Partial<Omit<TerrainDatum, 'id'>>) => void;
  onAddTerrainPoint: (point: AddTerrainGradePointInput) => void;
  onUpdateTerrainPoint: (pointId: string, changes: Partial<Omit<TerrainGradePoint, 'id'>>) => void;
  onRemoveTerrainPoint: (pointId: string) => void;
  captureAssessment: ExistingConditionCaptureAssessment;
  capturePreviewUrls: Record<string, string>;
  onAddCaptureFiles: (category: CaptureCategory, files: File[]) => Promise<void>;
  onUpdateCaptureEvidence: (evidenceId: string, changes: CaptureEvidenceChanges) => void;
  onRemoveCaptureEvidence: (evidenceId: string) => Promise<void>;
  onAnalyzeCapture: () => Promise<void>;
  onReviewAiObservation: (analysisId: string, observationId: string, decision: 'homeowner-accepted' | 'homeowner-rejected') => void;
  onPromoteAiOpening: (analysisId: string, observationId: string) => void;
  onContinue: () => void;
}

/** Lets a homeowner research a parcel and turn reference geometry into explicit field inputs. */
export function PropertyStage({ property, site, research, onResearch, onResearchAddress, onSuggestAddresses, onSelectWall, onUpdateSite, onUpdateTerrainDatum, onAddTerrainPoint, onUpdateTerrainPoint, onRemoveTerrainPoint, captureAssessment, capturePreviewUrls, onAddCaptureFiles, onUpdateCaptureEvidence, onRemoveCaptureEvidence, onAnalyzeCapture, onReviewAiObservation, onPromoteAiOpening, onContinue }: PropertyStageProps) {
  const [address, setAddress] = useState(property.address?.fullAddress || '');
  const [addressOptions, setAddressOptions] = useState<Address[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [showAddressOptions, setShowAddressOptions] = useState(false);
  useEffect(() => { if (property.address?.fullAddress) { setAddress(property.address.fullAddress); setAddressOptions([]); } }, [property.address?.fullAddress]);
  useEffect(() => {
    const query = address.trim();
    if (query.length < 4 || query === property.address?.fullAddress || research.status === 'loading') { setSuggestionStatus('idle'); setAddressOptions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setSuggestionStatus('loading');
      void onSuggestAddresses(query, 5).then((options) => { if (active) { setAddressOptions(options); setSuggestionStatus('ready'); setShowAddressOptions(true); } }).catch(() => { if (active) { setAddressOptions([]); setSuggestionStatus('ready'); } });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [address, onSuggestAddresses, property.address?.fullAddress, research.status]);
  const ready = Boolean(property.address && property.parcel && site);
  const selectAddressOption = (option: Address) => {
    setAddress(option.fullAddress);
    setAddressOptions([]);
    setShowAddressOptions(false);
    onResearchAddress(option);
  };

  return <main className="h-full overflow-y-auto bg-[#f7f8f6] px-4 py-6 sm:px-7 lg:px-10">
    <div className="mx-auto grid max-w-5xl gap-5">
      <header>
        <span className="text-xs font-bold uppercase tracking-[.16em] text-emerald-800">Property evidence</span>
        <h2 className="mt-2 font-[Manrope] text-3xl font-bold tracking-tight text-slate-950">Find the lot, then confirm the house.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Municipal geometry is reference evidence, not a field survey. We show exactly what came from public data and what still needs a measurement.</p>
      </header>

      <form onSubmit={(event) => { event.preventDefault(); if (address.trim()) onResearch(address.trim()); }} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="property-address" className="text-sm font-semibold text-slate-800">Property address</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="relative z-50 flex-1" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setShowAddressOptions(false); }}><MapPin size={17} className="absolute left-3 top-3.5 text-slate-400" /><input id="property-address" role="combobox" aria-autocomplete="list" aria-expanded={showAddressOptions && addressOptions.length > 0} aria-controls="property-address-options" value={address} onChange={(event) => { setAddress(event.target.value); setShowAddressOptions(true); }} onFocus={() => setShowAddressOptions(true)} placeholder="Start typing a BC street address" autoComplete="off" disabled={research.status === 'loading'} className="min-h-11 w-full rounded-lg border border-slate-300 pl-10 pr-10 text-sm" />{suggestionStatus === 'loading' && <Loader2 size={15} className="absolute right-3 top-3.5 animate-spin text-slate-400" />}{showAddressOptions && addressOptions.length > 0 && <ul id="property-address-options" role="listbox" className="absolute left-0 right-0 top-[calc(100%+.35rem)] z-50 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">{addressOptions.map((option) => <li key={`${option.fullAddress}-${option.coordinates.join(',')}`} role="option" aria-selected={false}><button type="button" aria-label={`Use ${option.fullAddress}`} onPointerDown={(event) => { event.preventDefault(); selectAddressOption(option); }} onClick={() => selectAddressOption(option)} className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-emerald-50 focus:bg-emerald-50"><MapPin size={15} className="mt-0.5 shrink-0 text-emerald-700" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{option.fullAddress}</strong><small className="mt-0.5 block text-xs text-slate-500">BC Address Geocoder · {option.score}/100 match</small></span></button></li>)}</ul>}</div>
          <button type="submit" disabled={!address.trim() || research.status === 'loading'} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-5 text-sm font-bold text-white disabled:opacity-50">{research.status === 'loading' ? <><Loader2 size={16} className="animate-spin" /> Researching sources</> : <><Search size={16} /> Research property</>}</button>
        </div>
        {research.status === 'error' && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><p className="flex gap-2"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{research.message}</p>{research.suggestions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{research.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setAddress(suggestion); onResearch(suggestion); }} className="rounded-md border border-red-300 bg-white px-3 py-2 text-left font-semibold">Use {suggestion}</button>)}</div>}</div>}
      </form>

      {ready && site && <>
        <PropertyContextPlan property={property} site={site} onSelectWall={onSelectWall} onSelectFrontage={(frontEdgeIndex) => onUpdateSite({ yardReference: { ...site.yardReference, status: 'homeowner-selected', frontEdgeIndex, rearEdgeIndex: site.yardReference.rearEdgeIndex === frontEdgeIndex ? null : site.yardReference.rearEdgeIndex, exteriorSideEdgeIndex: site.yardReference.exteriorSideEdgeIndex === frontEdgeIndex ? null : site.yardReference.exteriorSideEdgeIndex, selectedBy: site.measuredBy || 'Homeowner', selectedAt: new Date().toISOString() } })} />
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-[Manrope] text-lg font-bold text-slate-950">Yard orientation</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">The front and rear property lines determine which zoning setback applies to every parcel edge. Select the street frontage on the plan, then identify the rear line; do not infer either from compass direction or house orientation.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${site.yardReference.frontEdgeIndex === null || site.yardReference.rearEdgeIndex === null ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{site.yardReference.frontEdgeIndex === null ? 'Frontage required' : site.yardReference.rearEdgeIndex === null ? 'Rear line required' : `PL-${site.yardReference.frontEdgeIndex + 1} front · PL-${site.yardReference.rearEdgeIndex + 1} rear`}</span></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3"><label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Homeowner orientation<select value={site.yardReference.status === 'unselected' ? 'unselected' : 'homeowner-selected'} onChange={(event) => onUpdateSite({ yardReference: event.target.value === 'unselected' ? { schema: 'parcel-yard-reference/v1', status: 'unselected', frontEdgeIndex: null, rearEdgeIndex: null, exteriorSideEdgeIndex: null, selectedBy: '', selectedAt: '', notes: site.yardReference.notes } : { ...site.yardReference, status: 'homeowner-selected' } })} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-800"><option value="unselected">Not selected</option><option value="homeowner-selected">Selected from municipal parcel plan</option></select></label><label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Rear property line<select value={site.yardReference.rearEdgeIndex ?? ''} onChange={(event) => onUpdateSite({ yardReference: { ...site.yardReference, rearEdgeIndex: event.target.value === '' ? null : Number(event.target.value) } })} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-800"><option value="">Select rear line</option>{openParcelEdgeIndexes(property).filter((index) => index !== site.yardReference.frontEdgeIndex && index !== site.yardReference.exteriorSideEdgeIndex).map((index) => <option key={index} value={index}>Parcel edge {index + 1}</option>)}</select></label><label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Exterior street-side line<select value={site.yardReference.exteriorSideEdgeIndex ?? ''} onChange={(event) => onUpdateSite({ yardReference: { ...site.yardReference, exteriorSideEdgeIndex: event.target.value === '' ? null : Number(event.target.value) } })} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-800"><option value="">None / not a corner lot</option>{openParcelEdgeIndexes(property).filter((index) => index !== site.yardReference.frontEdgeIndex && index !== site.yardReference.rearEdgeIndex).map((index) => <option key={index} value={index}>Parcel edge {index + 1}</option>)}</select></label></div>
          <p className="mt-3 text-[10px] leading-4 text-slate-500">This control records homeowner orientation only. A survey file or professional review may corroborate it, but the interface does not upgrade homeowner input to survey-verified evidence.</p>
          <label className="mt-4 grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Orientation notes<textarea value={site.yardReference.notes} onChange={(event) => onUpdateSite({ yardReference: { ...site.yardReference, notes: event.target.value } })} rows={2} placeholder="Street name, corner-lot condition, survey reference, or uncertainty" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800" /></label>
        </section>
        <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><Building2 size={18} /></span><div><h3 className="font-[Manrope] text-lg font-bold text-slate-950">Parcel identified</h3><p className="mt-1 text-sm text-slate-600">{property.address?.fullAddress}</p></div><CheckCircle2 size={19} className="ml-auto text-emerald-700" /></div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <Fact label="Parcel / site ID" value={property.parcel?.pid || 'Not supplied'} />
              <Fact label="Municipality" value={property.parcel?.municipality || 'Unknown'} />
              <Fact label="Zone" value={property.zoning?.zone || 'Not resolved'} />
              <Fact label="Lot area" value={property.parcel?.areaSqm ? `${Math.round(property.parcel.areaSqm)} m²` : 'Not supplied'} />
            </dl>
            <div className="mt-5 border-t border-slate-200 pt-4"><h4 className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Evidence pulled</h4><ul className="mt-2 grid gap-2">{property.evidence.map((source) => <li key={source.id} className="flex items-start gap-2 text-xs leading-5 text-slate-600"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${source.status === 'authoritative' ? 'bg-emerald-600' : 'bg-amber-500'}`} /><span className="flex-1"><strong className="text-slate-800">{source.label}</strong> · {source.status}<br />{source.notes}</span><a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.label}`} className="text-emerald-800"><ExternalLink size={14} /></a></li>)}</ul></div>
          </article>

          <article className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3"><Ruler size={20} className="mt-0.5 text-amber-800" /><div><h3 className="font-[Manrope] text-lg font-bold text-amber-950">House reference needs confirmation</h3><p className="mt-1 text-sm leading-6 text-amber-900">{site.referenceSource === 'municipal-roofline' ? 'The outline comes from a municipal roofline and may include eaves.' : site.referenceSource === 'field-measurement' ? 'Field measurements have been recorded but still need evidence and professional review.' : 'No usable municipal building outline was found, so starter dimensions are estimated.'}</p></div></div>
            <p className="mt-4 rounded-lg bg-white/70 p-3 text-xs leading-5 text-amber-950">These measurements locate the deck against the house. They must be field-checked before the drawings are issued for professional review.</p>
          </article>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-[Manrope] text-lg font-bold text-slate-950">Design wall measurements</h3><p className="mt-1 text-sm text-slate-600">Use the exterior wall where the deck will connect or sit beside the house.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${site.status === 'field-input-unverified' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{site.status === 'field-input-unverified' ? 'Field values recorded · unverified' : 'Reference only'}</span></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500 sm:col-span-2">Selected wall<input value={site.designWall.label} onChange={(event) => onUpdateSite({}, { label: event.target.value, selectionStatus: 'user-selected' })} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-800" /></label>
            <div className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Wall evidence<div className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800">{site.designWall.selectionStatus === 'field-measured' ? 'Controlled field worksheet' : site.designWall.selectionStatus === 'user-selected' ? 'Selected from roofline' : 'Not selected'}</div><span className="text-[9px] font-normal normal-case leading-4 tracking-normal">Field status comes only from the worksheet below.</span></div>
            <NumberField label="Wall length" value={site.designWall.lengthMm} suffix="mm" min={2000} max={30000} onChange={(lengthMm) => onUpdateSite({}, { lengthMm })} />
            <NumberField label="House depth" value={site.houseDepthMm} suffix="mm" min={2000} max={30000} onChange={(houseDepthMm) => onUpdateSite({ houseDepthMm })} />
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Cladding<select value={site.designWall.cladding} onChange={(event) => onUpdateSite({}, { cladding: event.target.value as SiteModel['designWall']['cladding'] })} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-800"><option value="unknown">Unknown</option><option value="wood-siding">Wood siding</option><option value="fiber-cement">Fiber cement</option><option value="vinyl">Vinyl</option><option value="stucco">Stucco</option><option value="brick-veneer">Brick veneer</option><option value="other">Other</option></select></label>
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Measured by<input value={site.measuredBy} onChange={(event) => onUpdateSite({ measuredBy: event.target.value })} placeholder="Homeowner or surveyor" className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-800" /></label>
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Measured date<input type="date" value={site.measuredAt} onChange={(event) => onUpdateSite({ measuredAt: event.target.value })} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-800" /></label>
          </div>
          <ExistingConditionCapturePanel capture={site.capture} assessment={captureAssessment} previewUrls={capturePreviewUrls} onAddFiles={onAddCaptureFiles} onUpdateEvidence={onUpdateCaptureEvidence} onRemoveEvidence={onRemoveCaptureEvidence} onAnalyze={onAnalyzeCapture} onReviewAiObservation={onReviewAiObservation} linkedAiOpeningRefs={site.designWall.openings.flatMap((opening) => opening.sourceAiObservationRefs || [])} onPromoteAiOpening={onPromoteAiOpening} />
          <PhotoWallCalibrationPanel site={site} previewUrls={capturePreviewUrls} onApply={(input: ApplyPhotoWallCalibrationInput) => { const calibrated = applyPhotoWallCalibration(site, input); onUpdateSite({ capture: calibrated.capture, measuredBy: calibrated.measuredBy, measuredAt: input.recordedAt }, { openings: calibrated.designWall.openings }); }} />
          <ExistingConditionFieldSurveyPanel site={site} onRecord={(input: RecordExistingConditionFieldSurveyInput) => {
            const recorded = recordExistingConditionFieldSurvey(site, input);
            onUpdateSite({ houseDepthMm: recorded.houseDepthMm, fieldSurvey: recorded.fieldSurvey, status: recorded.status, measuredBy: recorded.measuredBy, measuredAt: recorded.measuredAt, referenceSource: recorded.referenceSource }, { selectionStatus: recorded.designWall.selectionStatus, lengthMm: recorded.designWall.lengthMm, wallHeightMm: recorded.designWall.wallHeightMm, openings: recorded.designWall.openings });
          }} />
          <WallOpeningEditor site={site} onUpdateOpenings={(openings) => { const openingIds = new Set(openings.map((opening) => opening.id)); onUpdateSite({ capture: { ...site.capture, wallCalibrations: (site.capture.wallCalibrations || []).filter((record) => openingIds.has(record.openingId)) } }, { openings }); }} />
          <TerrainCapturePanel terrain={site.terrain} captureEvidence={site.capture.evidence} onUpdateDatum={onUpdateTerrainDatum} onAddPoint={onAddTerrainPoint} onUpdatePoint={onUpdateTerrainPoint} onRemovePoint={onRemoveTerrainPoint} onRecord={(input: RecordTerrainFieldInput) => onUpdateSite({ terrain: recordTerrainFieldSurvey(site.terrain, input, site.capture.evidence.map((record) => record.id)) })} />
          <div className="mt-5 flex justify-end"><button type="button" onClick={onContinue} className="flex min-h-11 items-center gap-2 rounded-lg bg-emerald-800 px-5 text-sm font-bold text-white">Open deck designer <ArrowRight size={16} /></button></div>
        </section>
      </>}
    </div>
  </main>;
}

function WallOpeningEditor({ site, onUpdateOpenings }: { site: SiteModel; onUpdateOpenings: (openings: SiteModel['designWall']['openings']) => void }) {
  const openings = site.designWall.openings;
  const update = (id: string, changes: Partial<SiteModel['designWall']['openings'][number]>) => onUpdateOpenings(openings.map((opening) => opening.id === id ? { ...opening, ...changes } : opening));
  const add = (kind: 'door' | 'window') => {
    const sameKind = openings.filter((opening) => opening.kind === kind);
    const widthMm = kind === 'door' ? 900 : 1200;
    const starterOffset = Math.min(Math.max(0, sameKind.length * 1600 + 600), Math.max(0, site.designWall.lengthMm - widthMm));
    onUpdateOpenings([...openings, {
      id: nextOpeningId(openings.map((opening) => opening.id), kind),
      kind,
      offsetMm: starterOffset,
      widthMm,
      sillHeightMm: kind === 'door' ? 750 : 900,
      heightMm: kind === 'door' ? 2100 : 1200,
      evidenceStatus: 'photo-observed',
      sourceEvidenceIds: [],
    }]);
  };
  return <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-2"><DoorOpen size={18} className="mt-0.5 shrink-0 text-slate-600" /><div><h4 className="text-sm font-bold text-slate-900">Doors and windows on the design wall</h4><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Photos can prove an opening exists. Offset, width, sill and head remain provisional until measured. These openings appear in plan, elevation, CAD, and conflict review.</p></div></div>
      <div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => add('door')} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[10px] font-bold text-slate-700"><Plus size={13} /> Door</button><button type="button" onClick={() => add('window')} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[10px] font-bold text-slate-700"><Plus size={13} /> Window</button></div>
    </div>
    {!openings.length ? <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">No openings recorded on this wall yet. Add every door and rear-wall window visible in the photo set.</p> : <div className="mt-4 grid gap-3">{openings.map((opening) => {
      const evidenceStatus = opening.evidenceStatus || 'field-measured';
      const verifiedMeasurement = evidenceStatus === 'field-measured' || evidenceStatus === 'professional-verified';
      const statusLabel = evidenceStatus === 'professional-verified' ? 'Professional verified' : evidenceStatus === 'field-measured' ? 'Field measured' : evidenceStatus === 'scaled-photo-derived' ? 'Scaled photo · verify in field' : 'Photo observed · dimensions provisional';
      return <article key={opening.id} className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-slate-900">{opening.id} · {opening.kind === 'door' ? 'Exterior door' : 'Window'}</strong><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[.08em] ${verifiedMeasurement ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{statusLabel}</span><button type="button" onClick={() => onUpdateOpenings(openings.filter((candidate) => candidate.id !== opening.id))} aria-label={`Remove ${opening.id}`} className="ml-auto grid h-8 w-8 place-items-center rounded-md border border-red-200 text-red-700"><Trash2 size={13} /></button></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">Evidence<div className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold normal-case tracking-normal text-slate-800">{statusLabel}</div></div>
          <NumberField label="Offset from wall start" value={opening.offsetMm} suffix="mm" min={0} max={site.designWall.lengthMm} onChange={(offsetMm) => update(opening.id, { offsetMm })} />
          <NumberField label="Opening width" value={opening.widthMm} suffix="mm" min={300} max={4000} onChange={(widthMm) => update(opening.id, { widthMm })} />
          <NumberField label="Sill above grade" value={opening.sillHeightMm} suffix="mm" min={0} max={5000} onChange={(sillHeightMm) => update(opening.id, { sillHeightMm })} />
          <NumberField label="Opening height" value={opening.heightMm ?? (opening.kind === 'door' ? 2100 : 1200)} suffix="mm" min={300} max={4000} onChange={(heightMm) => update(opening.id, { heightMm })} />
        </div>
        {evidenceStatus === 'photo-observed' && <p className="mt-2 text-[9px] leading-4 text-amber-800">Starter numbers only keep the symbol editable; they are not derived from the photograph. Measure from the selected wall start, local grade, sill and head before relying on clearance checks.</p>}
        {evidenceStatus === 'scaled-photo-derived' && <p className="mt-2 text-[9px] leading-4 text-amber-800">Derived from two homeowner-measured axes on one source photo. Use this for layout coordination, then verify offset, width, sill and head with a tape or laser before professional issue.</p>}
        {(opening.sourceEvidenceIds?.length || 0) > 0 && <p className="mt-2 rounded-md bg-violet-50 px-2 py-1.5 text-[9px] leading-4 text-violet-900">Source-bound photo observation · {opening.sourceEvidenceIds!.map((id) => site.capture.evidence.find((record) => record.id === id)?.label || id).join(', ')} · {opening.sourceAiObservationRefs?.length || 0} accepted AI observation{opening.sourceAiObservationRefs?.length === 1 ? '' : 's'}.</p>}
        {site.capture.wallCalibrations?.find((record) => record.openingId === opening.id) && <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5 text-[9px] leading-4 text-emerald-900">Calibration {site.capture.wallCalibrations!.find((record) => record.openingId === opening.id)!.id.slice(0, 12)} · {site.capture.wallCalibrations!.find((record) => record.openingId === opening.id)!.recordedBy} · {site.capture.wallCalibrations!.find((record) => record.openingId === opening.id)!.recordedAt} · source clicks and known distances retained.</p>}
      </article>;
    })}</div>}
  </div>;
}

function nextOpeningId(existingIds: string[], kind: 'door' | 'window'): string {
  const prefix = kind === 'door' ? 'D' : 'W';
  let number = 1;
  while (existingIds.includes(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

function NumberField({ label, value, suffix, min, max, onChange }: { label: string; value: number; suffix: string; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-slate-500">{label}<span className="flex min-h-11 items-center overflow-hidden rounded-lg border border-slate-300 bg-white"><input type="number" value={value} min={min} max={max} step="10" onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 px-3 text-sm font-normal text-slate-800 outline-none" /><span className="pr-3 text-xs font-semibold normal-case tracking-normal text-slate-400">{suffix}</span></span></label>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-bold uppercase tracking-[.1em] text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value}</dd></div>; }
function openParcelEdgeIndexes(property: Property): number[] { const ring = property.parcel?.polygon || []; const count = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length; return Array.from({ length: count }, (_, index) => index); }
