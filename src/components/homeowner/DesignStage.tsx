import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Layers3, Plus, RotateCw, Ruler, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { stairDepartureDirection, stairLandingCandidates, suggestedPlatformElevationForBoundary, suggestPointToPointStair, type AddPlatformInput, type AddStairInput, type ClosedBoundary, type DeckDesign, type DesignAssessment, type DeckPlatform, type DeckStair, type PlatformEdgeRole } from '../../domain/deckDesign';
import { assessSiteCompliance, projectPropertyToLocal, terrainElevationAt, type SiteModel } from '../../domain/siteModel';
import type { Property } from '../../types';
import { DeckElevationEditor } from '../design/DeckElevationEditor';
import { DeckPlanEditor } from '../design/DeckPlanEditor';

interface DesignStageProps {
  design: DeckDesign;
  site: SiteModel;
  property: Property;
  assessment: DesignAssessment;
  canUndo: boolean;
  canRedo: boolean;
  onAddPlatform: (input: AddPlatformInput) => void;
  onUpdatePlatformBoundary: (platformId: string, boundary: ClosedBoundary) => void;
  onSelectObject: (objectId: string | null) => void;
  onRenamePlatform: (platformId: string, name: string) => void;
  onSetElevation: (platformId: string, elevationMm: number) => void;
  onSetPurpose: (platformId: string, purpose: 'deck' | 'landing') => void;
  onSetFinish: (platformId: string, finish: Partial<DeckPlatform['finish']>) => void;
  onSetFramingIntent: (platformId: string, intent: Partial<DeckPlatform['framingIntent']>) => void;
  onSetEdgeRole: (platformId: string, edgeId: string, role: PlatformEdgeRole) => void;
  onSetEdgeLength: (platformId: string, edgeId: string, lengthMm: number) => void;
  onInsertVertex: (platformId: string, edgeId: string) => void;
  onAddStair: (input: AddStairInput) => void;
  onMovePlatformLayer: (platformId: string, delta: -1 | 1) => void;
  onRotatePlatform: (platformId: string, deltaDeg: number) => void;
  onRemovePlatform: (platformId: string) => void;
  onRemoveStair: (stairId: string) => void;
  onMoveStair: (stairId: string, deltaXmm: number, deltaYmm: number) => void;
  onResizeStairSide: (stairId: string, side: 'left' | 'right', widthMm: number) => void;
  onSetStairConstruction: (stairId: string, changes: Partial<Pick<DeckStair, 'widthMm' | 'landingDepthMm' | 'stringerCount' | 'handrailSides' | 'directionDeg'>>) => void;
  onConnectStairLanding: (stairId: string, platformId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProperty: () => void;
  onMirrorProperty: () => void;
  onRotateProperty: () => void;
  onContinue: () => void;
}

/** Composes the plan canvas with exact properties for the selected construction region. */
export function DesignStage(props: DesignStageProps) {
  const selected = props.design.platforms.find((platform) => platform.id === props.design.selectedObjectId) || null;
  const selectedStair = props.design.stairs.find((stair) => stair.id === props.design.selectedObjectId) || null;
  const siteCompliance = assessSiteCompliance(props.property, projectPropertyToLocal(props.property, props.site), props.site, props.design);
  const [designView, setDesignView] = useState<'plan' | 'elevation'>('plan');
  return <main className="grid h-full min-h-0 bg-[#edf2ef] lg:grid-cols-[minmax(0,1fr)_330px]">
    <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden" aria-label="Deck design canvas">
      <div className="flex min-h-12 items-center justify-between border-b border-slate-300 bg-slate-950 px-4 text-white">
        <div><strong className="text-xs">Linked architectural views</strong><span className="ml-2 text-[10px] text-slate-400">One model · plan position and vertical construction</span></div>
        <div className="flex rounded-lg bg-slate-800 p-1" role="group" aria-label="Deck design view">
          <button type="button" aria-pressed={designView === 'plan'} onClick={() => setDesignView('plan')} className={`min-h-8 rounded-md px-4 text-xs font-bold ${designView === 'plan' ? 'bg-white text-slate-950' : 'text-slate-300'}`}>Plan</button>
          <button type="button" aria-pressed={designView === 'elevation'} onClick={() => setDesignView('elevation')} className={`min-h-8 rounded-md px-4 text-xs font-bold ${designView === 'elevation' ? 'bg-white text-slate-950' : 'text-slate-300'}`}>Side / section</button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {designView === 'plan' ? <DeckPlanEditor design={props.design} site={props.site} property={props.property} canUndo={props.canUndo} canRedo={props.canRedo} onAddPlatform={props.onAddPlatform} onUpdatePlatformBoundary={props.onUpdatePlatformBoundary} onRotatePlatform={props.onRotatePlatform} onSelectObject={props.onSelectObject} onConnectStair={(sourcePlatformId, sourceEdgeId, sourcePointMm, targetPointMm, targetPlatformId, targetEdgeId) => { const target = targetPlatformId ? { kind: 'platform' as const, platformId: targetPlatformId } : { kind: 'terrain' as const, elevationMm: terrainElevationAt(props.site.terrain, targetPointMm).elevationMm }; const input = suggestPointToPointStair(props.design, sourcePlatformId, sourceEdgeId, target, sourcePointMm, targetPointMm, targetEdgeId); props.onAddStair(input); props.onSetEdgeRole(sourcePlatformId, sourceEdgeId, 'stair'); if (targetPlatformId && targetEdgeId) props.onSetEdgeRole(targetPlatformId, targetEdgeId, 'stair'); }} onSetStairConstruction={props.onSetStairConstruction} onMoveStair={props.onMoveStair} onResizeStairSide={props.onResizeStairSide} onOpenProperty={props.onOpenProperty} onMirrorProperty={props.onMirrorProperty} onRotateProperty={props.onRotateProperty} onUndo={props.onUndo} onRedo={props.onRedo} /> : <DeckElevationEditor design={props.design} site={props.site} onSelectObject={props.onSelectObject} onSetElevation={props.onSetElevation} />}
      </div>
    </section>
    <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white" aria-label="Selected design properties">
      <div className="border-b border-slate-200 p-5">
        <span className="text-[10px] font-bold uppercase tracking-[.15em] text-emerald-800">Architectural plan</span>
        <h2 className="mt-1 font-[Manrope] text-xl font-bold text-slate-950">Shape, levels & access</h2>
        <p className="mt-2 text-xs leading-5 text-slate-600">Draw platforms against the measured house. Each platform can move, change shape, and sit at its own elevation.</p>
      </div>
      <PlatformLayers design={props.design} site={props.site} onSelect={props.onSelectObject} onMove={props.onMovePlatformLayer} />
      {selected ? <PlatformInspector design={props.design} platform={selected} gradeElevationMm={terrainElevationAt(props.site.terrain, platformReferencePoint(selected)).elevationMm} onRename={props.onRenamePlatform} onSetElevation={props.onSetElevation} onSetPurpose={props.onSetPurpose} onRotate={props.onRotatePlatform} onSetFinish={props.onSetFinish} onSetFramingIntent={props.onSetFramingIntent} onSetEdgeRole={props.onSetEdgeRole} onSetEdgeLength={props.onSetEdgeLength} onInsertVertex={props.onInsertVertex} onRemove={props.onRemovePlatform} /> : selectedStair ? <StairInspector stair={selectedStair} design={props.design} onSetConstruction={props.onSetStairConstruction} onConnectLanding={props.onConnectStairLanding} onResizeSide={props.onResizeStairSide} onRemove={props.onRemoveStair} /> : <div className="p-5"><div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center"><Layers3 className="mx-auto text-slate-400" size={24} /><strong className="mt-3 block text-sm text-slate-800">Select a platform or stair</strong><p className="mt-1 text-xs leading-5 text-slate-500">Click a deck area to edit it, or click a stair callout to inspect and remove that stair.</p></div></div>}

      <div className="border-t border-slate-200 p-5">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-slate-500"><ShieldCheck size={15} /> Live design checks</h3>
        {props.assessment.errors.length === 0 && props.assessment.warnings.length === 0 ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">Platform geometry is valid. Structural framing and site compliance are the next checks.</p> : <ul className="mt-3 grid gap-2">{[...props.assessment.errors, ...props.assessment.warnings].slice(0, 5).map((issue, index) => <li key={`${issue.objectId}-${index}`} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{issue.message}</li>)}</ul>}
        {siteCompliance.setbackStatus === 'orientation-required' ? <button type="button" onClick={props.onOpenProperty} className="mt-3 flex w-full items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs leading-5 text-amber-950"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span><strong className="block">Select the front and rear property lines</strong>Front/rear/side setback checks cannot be named from compass direction alone.</span></button> : siteCompliance.setbackStatus === 'reference-fail' ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900"><strong className="block">Reference setback conflict</strong>{siteCompliance.setbackChecks.filter((check) => check.status === 'reference-fail').map((check) => <span key={check.parcelEdgeIndex} className="block"><strong>{check.governingComponentId}</strong> {check.governingComponentKind.replace(/-/g, ' ')} → {check.yard.replace(/-/g, ' ')} PL-{check.parcelEdgeIndex + 1}: {(check.referenceDistanceMm / 1000).toFixed(2)} m / {(check.requiredMm / 1000).toFixed(2)} m required</span>)}</div> : siteCompliance.setbackStatus === 'reference-pass' ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><strong>Reference siting screen passes.</strong> Platforms, stairs, and modeled landings are inside the recorded setback limits. Coverage {siteCompliance.coverage.referenceCoveragePercent?.toFixed(2) ?? '—'}% / {siteCompliance.coverage.maximumCoveragePercent?.toFixed(1) ?? '—'}% maximum. Survey and municipal interpretation remain required.</p> : null}
        {siteCompliance.coverage.status === 'reference-exceeds-limit' && <p className="mt-2 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-900"><strong>Reference lot coverage exceeds the recorded maximum:</strong> {siteCompliance.coverage.referenceCoveragePercent?.toFixed(2)}% / {siteCompliance.coverage.maximumCoveragePercent?.toFixed(2)}%.</p>}
        {siteCompliance.coverage.proposedReferenceFootprintSqM !== null && <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-600"><strong className="block text-slate-800">Modeled zoning footprint · {siteCompliance.coverage.proposedReferenceFootprintSqM.toFixed(2)} m²</strong>{siteCompliance.coverage.proposedPlatformFootprintSqM?.toFixed(2)} m² platform union + {siteCompliance.coverage.proposedStairAndLandingFootprintSqM?.toFixed(2)} m² stair/grade-landing union. Overlaps are counted once in the total.</p>}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{props.design.platforms.length} platform{props.design.platforms.length === 1 ? '' : 's'} · {props.assessment.areaSqM.toFixed(1)} m²</span><span>{props.design.stairs.length} stair{props.design.stairs.length === 1 ? '' : 's'}</span></div>
        <button type="button" onClick={props.onContinue} disabled={!props.design.platforms.length || props.assessment.errors.length > 0} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Review permit requirements <ArrowRight size={16} /></button>
      </div>
    </aside>
  </main>;
}

function StairInspector({ stair, design, onSetConstruction, onConnectLanding, onResizeSide, onRemove }: { stair: DeckStair; design: DeckDesign; onSetConstruction: (id: string, changes: Partial<Pick<DeckStair, 'widthMm' | 'landingDepthMm' | 'stringerCount' | 'handrailSides' | 'directionDeg'>>) => void; onConnectLanding: (stairId: string, platformId: string) => void; onResizeSide: (id: string, side: 'left' | 'right', widthMm: number) => void; onRemove: (id: string) => void }) {
  const [widthSide, setWidthSide] = useState<'left' | 'right'>('right');
  const from = endpointName(stair.from, design);
  const to = endpointName(stair.to, design);
  const stringerCount = stair.stringerCount ?? Math.max(2, Math.ceil(stair.widthMm / 450) + 1);
  const handrailSides = stair.handrailSides ?? (stair.riserCount >= 3 ? 'both' : 'none');
  const treadCount = Math.max(0, stair.riserCount - 1);
  const totalRiseMm = stair.riserCount * stair.riserHeightMm;
  const pitchDeg = Math.atan2(stair.riserHeightMm, Math.max(1, stair.treadDepthMm)) * 180 / Math.PI;
  const sourcePlatformId = stair.from.kind === 'platform' ? stair.from.platformId : null;
  const sourcePlatform = sourcePlatformId ? design.platforms.find((platform) => platform.id === sourcePlatformId) : null;
  const squareDirectionDeg = sourcePlatform && stair.fromEdgeId ? stairDepartureDirection(sourcePlatform, stair.fromEdgeId) : stair.directionDeg;
  const jointSkewDeg = normalizeSignedDegrees(stair.directionDeg - squareDirectionDeg);
  const landingCandidates = stair.to.kind === 'terrain' ? stairLandingCandidates(design, stair.id) : [];
  return <section className="grid gap-4 p-5" aria-labelledby="stair-inspector-heading">
    <div><span className="text-[10px] font-bold uppercase tracking-[.12em] text-emerald-700">A → B vertical connection</span><h3 id="stair-inspector-heading" className="mt-1 text-lg font-bold text-slate-950">{stair.name}</h3><div className="mt-2 grid grid-cols-[22px_1fr] gap-x-2 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs"><strong className="text-emerald-800">A</strong><span><strong>{from}</strong> · departure</span><strong className="text-amber-700">B</strong><span><strong>{to}</strong> · landing</span></div></div>
    {stair.to.kind === 'terrain' && <div className={`rounded-xl border p-3 ${landingCandidates.length ? 'border-emerald-300 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><h4 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-700">Where does Point B land?</h4>{landingCandidates.length ? <><p className="mt-1 text-[10px] leading-4 text-emerald-950">The stair axis reaches the following lower platform. Connect it to replace the grade endpoint with a hosted landing edge.</p><div className="mt-2 grid gap-2">{landingCandidates.map((candidate) => <button key={candidate.platformId} type="button" onClick={() => onConnectLanding(stair.id, candidate.platformId)} className="min-h-10 rounded-lg bg-emerald-800 px-3 text-left text-xs font-bold text-white">Connect B to {candidate.platformName} · EL. {candidate.elevationMm} mm</button>)}</div></> : <p className="mt-1 text-[10px] leading-4 text-amber-950">B is still connected to yard/grade. Move or rotate a lower platform into the stair axis, or adjust the stair so its endpoint reaches the landing edge.</p>}</div>}
    <div><h4 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">Calculated stair geometry</h4><dl className="grid grid-cols-2 gap-2 text-xs"><StairFact label="Total rise" value={`${totalRiseMm} mm`} /><StairFact label="Step pitch" value={`${pitchDeg.toFixed(1)}°`} /><StairFact label="Risers" value={`${stair.riserCount} @ ${stair.riserHeightMm} mm`} /><StairFact label="Treads" value={`${treadCount} @ ${stair.treadDepthMm} mm`} /><StairFact label="Total run" value={`${stair.totalRunMm} mm`} /><StairFact label="Plan direction" value={`${Math.round(stair.directionDeg)}°`} /></dl></div>
    <div><h4 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">Width & structure</h4><div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Stair side to move"><button type="button" aria-pressed={widthSide === 'left'} onClick={() => setWidthSide('left')} className={`min-h-8 rounded-md text-[10px] font-bold ${widthSide === 'left' ? 'bg-white text-amber-900 shadow-sm' : 'text-slate-500'}`}>Move left edge</button><button type="button" aria-pressed={widthSide === 'right'} onClick={() => setWidthSide('right')} className={`min-h-8 rounded-md text-[10px] font-bold ${widthSide === 'right' ? 'bg-white text-amber-900 shadow-sm' : 'text-slate-500'}`}>Move right edge</button></div><div className="grid grid-cols-2 gap-2"><NumberField icon={<Ruler size={14} />} label="Clear width" value={stair.widthMm} suffix="mm" min={860} max={4800} onChange={(widthMm) => onResizeSide(stair.id, widthSide, widthMm)} /><NumberField icon={<Ruler size={14} />} label="Landing depth" value={stair.landingDepthMm} suffix="mm" min={stair.widthMm} max={5000} onChange={(landingDepthMm) => onSetConstruction(stair.id, { landingDepthMm })} /><label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Stringers<span className="flex min-h-10 items-center overflow-hidden rounded-lg border border-slate-300"><input aria-label="Stringer count" type="number" value={stringerCount} min="2" max="12" step="1" onChange={(event) => onSetConstruction(stair.id, { stringerCount: Number(event.target.value) })} className="min-w-0 flex-1 px-2 text-xs font-semibold normal-case tracking-normal text-slate-800 outline-none" /></span></label></div>
      <input aria-label="Stair clear width" type="range" value={stair.widthMm} min="860" max="2400" step="10" onChange={(event) => onResizeSide(stair.id, widthSide, Number(event.target.value))} className="mt-3 w-full accent-amber-700" />
      <div className="mt-2 grid grid-cols-4 gap-1">{[900, 1200, 1500, 1800].map((widthMm) => <button key={widthMm} type="button" onClick={() => onResizeSide(stair.id, widthSide, widthMm)} className={`min-h-8 rounded-md border text-[10px] font-bold ${stair.widthMm === widthMm ? 'border-amber-700 bg-amber-50 text-amber-900' : 'border-slate-300 text-slate-600'}`}>{widthMm}</button>)}</div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Only the selected side moves; the opposite stair edge stays fixed. The preliminary stringer count updates at roughly 450 mm spacing.</p>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-amber-900"><RotateCw size={13} /> Joint angle at platform</h4><div className="mt-2 grid grid-cols-[44px_1fr_44px] gap-2"><button type="button" onClick={() => onSetConstruction(stair.id, { directionDeg: squareDirectionDeg + Math.max(-45, jointSkewDeg - 5) })} className="min-h-10 rounded-md border border-amber-300 bg-white text-xs font-bold text-amber-900">−5°</button><NumberField icon={<RotateCw size={14} />} label="Joint skew" value={Math.round(jointSkewDeg)} suffix="°" min={-45} max={45} step={1} onChange={(skewDeg) => onSetConstruction(stair.id, { directionDeg: squareDirectionDeg + skewDeg })} /><button type="button" onClick={() => onSetConstruction(stair.id, { directionDeg: squareDirectionDeg + Math.min(45, jointSkewDeg + 5) })} className="min-h-10 rounded-md border border-amber-300 bg-white text-xs font-bold text-amber-900">+5°</button></div><input aria-label="Stair joint skew" type="range" value={Math.max(-45, Math.min(45, Math.round(jointSkewDeg)))} min="-45" max="45" step="1" onChange={(event) => onSetConstruction(stair.id, { directionDeg: squareDirectionDeg + Number(event.target.value) })} className="mt-3 w-full accent-amber-700" /><div className="mt-2 flex items-center justify-between gap-2"><p className="text-[10px] leading-4 text-amber-950"><strong>{Math.abs(jointSkewDeg) < .5 ? 'Square joint' : `${Math.abs(jointSkewDeg).toFixed(0)}° ${jointSkewDeg < 0 ? 'left' : 'right'} skew`}.</strong> Stringer ends follow the platform header line; oblique joints need a wider opening and a reviewed attachment detail.</p><button type="button" onClick={() => onSetConstruction(stair.id, { directionDeg: squareDirectionDeg })} className="min-h-8 shrink-0 rounded-md border border-amber-300 bg-white px-2 text-[10px] font-bold text-amber-900">Make square</button></div></div>
    <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Handrails<select value={handrailSides} onChange={(event) => onSetConstruction(stair.id, { handrailSides: event.target.value as DeckStair['handrailSides'] })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-slate-800"><option value="both">Both sides</option><option value="left">Left side</option><option value="right">Right side</option><option value="none">None</option></select></label>
    <p className="rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-950">The risers were calculated from the difference between the two elevations. Final handrails, guards, landings, and structural stringers are checked during permit framing.</p>
    <button type="button" onClick={() => onRemove(stair.id)} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={15} /> Remove this stair</button>
  </section>;
}

function endpointName(endpoint: DeckStair['from'], design: DeckDesign): string {
  return endpoint.kind === 'terrain' ? `Yard / grade (${endpoint.elevationMm} mm)` : design.platforms.find((platform) => platform.id === endpoint.platformId)?.name || endpoint.platformId;
}

function platformReferencePoint(platform: DeckPlatform): readonly [number, number] {
  const count = Math.max(1, platform.boundary.vertices.length);
  return [platform.boundary.vertices.reduce((sum, vertex) => sum + vertex.xMm, 0) / count, platform.boundary.vertices.reduce((sum, vertex) => sum + vertex.yMm, 0) / count];
}

function normalizeSignedDegrees(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Math.max(-45, Math.min(45, normalized));
}

function StairFact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><dt className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</dt><dd className="mt-1 font-bold text-slate-800">{value}</dd></div>; }

function PlatformLayers({ design, site, onSelect, onMove }: { design: DeckDesign; site: SiteModel; onSelect: (id: string | null) => void; onMove: (id: string, delta: -1 | 1) => void }) {
  return <section className="border-b border-slate-200 p-5" aria-labelledby="platform-layers-heading">
    <div className="flex items-center justify-between"><h3 id="platform-layers-heading" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-slate-500"><Layers3 size={15} /> Platform layers</h3><span className="text-[10px] text-slate-400">Top draws last</span></div>
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><strong className="block text-[10px] uppercase tracking-[.1em] text-slate-700">Project datum · {site.terrain.datum.elevationMm} mm</strong><span className="text-[10px] leading-4 text-slate-500">{site.terrain.gradePoints.length ? `${site.terrain.gradePoints.length} local grade observation${site.terrain.gradePoints.length === 1 ? '' : 's'} used for heights.` : 'No local grade observations; heights still use the assumed datum.'}</span></div>
    {design.platforms.length ? <ol className="mt-3 grid gap-2">{[...design.platforms].reverse().map((platform, reverseIndex) => {
      const index = design.platforms.length - 1 - reverseIndex;
      const selected = design.selectedObjectId === platform.id;
      return <li key={platform.id} className={`grid grid-cols-[1fr_32px_32px] items-center gap-1 rounded-lg border p-1.5 ${selected ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
        <button type="button" onClick={() => onSelect(platform.id)} className="min-w-0 px-2 py-1 text-left"><strong className="block truncate text-xs text-slate-900">{platform.name}</strong><span className="text-[10px] text-slate-500">{platform.purpose === 'landing' ? 'Landing' : 'Deck'} · EL. {platform.elevationMm} mm · +{platform.elevationMm - terrainElevationAt(site.terrain, platformReferencePoint(platform)).elevationMm} above local grade</span></button>
        <button type="button" onClick={() => onMove(platform.id, 1)} disabled={index === design.platforms.length - 1} aria-label={`Move ${platform.name} forward`} title="Draw in front" className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 disabled:opacity-30"><ArrowUp size={13} /></button>
        <button type="button" onClick={() => onMove(platform.id, -1)} disabled={index === 0} aria-label={`Move ${platform.name} backward`} title="Draw behind" className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 disabled:opacity-30"><ArrowDown size={13} /></button>
      </li>;
    })}</ol> : <p className="mt-3 text-xs text-slate-500">Draw a closed platform outline to create the first level.</p>}
    {design.stairs.length > 0 && <div className="mt-4 border-t border-slate-200 pt-3"><span className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-400">Stair connections</span><div className="mt-2 grid gap-2">{design.stairs.map((stair) => <button key={stair.id} type="button" onClick={() => onSelect(stair.id)} className={`rounded-lg border p-2.5 text-left ${design.selectedObjectId === stair.id ? 'border-amber-600 bg-amber-50' : 'border-slate-200 bg-white'}`}><strong className="block text-xs text-slate-900">A · {endpointName(stair.from, design)} → B · {endpointName(stair.to, design)}</strong><span className="mt-1 block text-[10px] text-slate-500">{stair.riserCount} risers · {Math.max(0, stair.riserCount - 1)} treads · {stair.stringerCount} stringers</span></button>)}</div></div>}
  </section>;
}

function PlatformInspector({ design, platform, gradeElevationMm, onRename, onSetElevation, onSetPurpose, onRotate, onSetFinish, onSetFramingIntent, onSetEdgeRole, onSetEdgeLength, onInsertVertex, onRemove }: {
  design: DeckDesign;
  platform: DeckPlatform;
  gradeElevationMm: number;
  onRename: (id: string, name: string) => void;
  onSetElevation: (id: string, value: number) => void;
  onSetPurpose: (id: string, purpose: 'deck' | 'landing') => void;
  onRotate: (id: string, deltaDeg: number) => void;
  onSetFinish: (id: string, finish: Partial<DeckPlatform['finish']>) => void;
  onSetFramingIntent: (id: string, intent: Partial<DeckPlatform['framingIntent']>) => void;
  onSetEdgeRole: (platformId: string, edgeId: string, role: PlatformEdgeRole) => void;
  onSetEdgeLength: (platformId: string, edgeId: string, lengthMm: number) => void;
  onInsertVertex: (platformId: string, edgeId: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(platform.name);
  const detectedStairLandingElevation = suggestedPlatformElevationForBoundary(design, platform.boundary);
  return <div className="grid gap-5 p-5">
    <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[.1em] text-slate-500">Platform name<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== platform.name) onRename(platform.id, name); }} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900" /></label>
    <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Platform purpose<select value={platform.purpose ?? 'deck'} onChange={(event) => onSetPurpose(platform.id, event.target.value as 'deck' | 'landing')} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-slate-800"><option value="deck">Deck area</option><option value="landing">Stair landing</option></select></label>
    <div className="grid grid-cols-2 gap-3">
      <NumberField icon={<Ruler size={14} />} label="Elevation" value={platform.elevationMm} suffix="mm" min={0} max={5000} onChange={(value) => onSetElevation(platform.id, value)} />
      <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Joist spacing<select value={platform.framingIntent.joistSpacingMm} onChange={(event) => onSetFramingIntent(platform.id, { joistSpacingMm: Number(event.target.value) as 300 | 400 | 600 })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold normal-case tracking-normal text-slate-800"><option value="300">300 mm</option><option value="400">400 mm</option><option value="600">600 mm</option></select></label>
    </div>
    <p className="-mt-2 rounded-lg bg-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-600"><strong>{platform.elevationMm - gradeElevationMm} mm above ground datum.</strong> Stairs connected to this level derive their vertical rise from this value.</p>
    {detectedStairLandingElevation !== null && detectedStairLandingElevation !== platform.elevationMm && <div className="-mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3"><strong className="block text-xs text-amber-950">A yard stair lands on this platform outline</strong><p className="mt-1 text-[10px] leading-4 text-amber-900">Point B currently expects elevation {detectedStairLandingElevation} mm. Set this platform to that level to host the stair and recalculate the complete flight.</p><button type="button" onClick={() => onSetElevation(platform.id, detectedStairLandingElevation)} className="mt-2 min-h-9 w-full rounded-lg bg-amber-800 px-3 text-xs font-bold text-white">Use detected stair landing · EL. {detectedStairLandingElevation} mm</button></div>}
    <div className="-mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-950"><strong>Surface level and assembly depth are separate.</strong> Walking surface: EL. {platform.elevationMm} mm · decking: {platform.finish.deckingThicknessMm} mm. Joist and beam depths are selected from spans and loads during framing; post/support heights then derive from the surface level, assembly, and local grade.</div>
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-900"><RotateCw size={13} /> Rotate platform</h4><div className="mt-2 grid grid-cols-3 gap-2"><button type="button" onClick={() => onRotate(platform.id, -15)} aria-label={`Rotate ${platform.name} counterclockwise 15 degrees`} className="min-h-9 rounded-md border border-emerald-300 bg-white text-xs font-bold text-emerald-900">−15°</button><button type="button" onClick={() => onRotate(platform.id, 15)} aria-label={`Rotate ${platform.name} clockwise 15 degrees`} className="min-h-9 rounded-md border border-emerald-300 bg-white text-xs font-bold text-emerald-900">+15°</button><button type="button" onClick={() => onRotate(platform.id, 90)} aria-label={`Rotate ${platform.name} clockwise 90 degrees`} className="min-h-9 rounded-md border border-emerald-300 bg-white text-xs font-bold text-emerald-900">+90°</button></div><p className="mt-2 text-[10px] leading-4 text-emerald-950">Rotates around the platform centre. Use the canvas handle for a free angle; hold Alt to suppress 15° snapping.</p></div>
    <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Decking<select value={platform.finish.decking} onChange={(event) => onSetFinish(platform.id, { decking: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-slate-800"><option>Pressure-treated wood decking</option><option>Cedar decking</option><option>Composite decking</option><option>Waterproof vinyl membrane</option></select></label>
    <div className="rounded-xl border border-slate-200 p-3"><label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Guard / railing system<select value={platform.finish.guardSystem} onChange={(event) => onSetFinish(platform.id, { guardSystem: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-slate-800"><option>Pressure-treated wood guardrail</option><option>Cedar guardrail</option><option>Black aluminum guardrail</option><option>Glass guard system</option></select></label><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => platform.edges.filter((edge) => edge.role === 'open').forEach((edge) => onSetEdgeRole(platform.id, edge.id, 'guard'))} className="min-h-9 rounded-lg bg-slate-900 px-2 text-[10px] font-bold text-white">Guard all open edges</button><button type="button" onClick={() => platform.edges.filter((edge) => edge.role === 'guard').forEach((edge) => onSetEdgeRole(platform.id, edge.id, 'open'))} className="min-h-9 rounded-lg border border-slate-300 px-2 text-[10px] font-bold text-slate-700">Remove platform guards</button></div><p className="mt-2 text-[10px] leading-4 text-slate-500">Use the edge-role controls below for individual sides. Stair handrails are controlled from the selected stair.</p></div>
    <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Support strategy<select value={platform.framingIntent.supportStrategy} onChange={(event) => onSetFramingIntent(platform.id, { supportStrategy: event.target.value as DeckPlatform['framingIntent']['supportStrategy'] })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-slate-800"><option value="auto">Automatic preliminary layout</option><option value="ledger">Ledger at house</option><option value="freestanding">Freestanding</option></select></label>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950"><strong>Shape corners are not supports.</strong> Framing generation creates separate joists, beams, posts, and footings after platforms, levels, and stairs are resolved.</div>

    <fieldset className="border-t border-slate-200 pt-4">
      <legend className="px-1 text-xs font-bold uppercase tracking-[.12em] text-slate-500">Edge dimensions</legend>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Use <strong>Add stairs</strong> on the canvas to create a stair opening and connect it to the yard or another platform.</p>
      <div className="mt-3 grid gap-2">{platform.edges.map((edge, index) => {
        const start = platform.boundary.vertices[index]; const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
        const lengthMm = Math.round(Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm));
        return <div key={edge.id} className="grid grid-cols-[24px_74px_1fr_32px] items-center gap-1.5 rounded-lg border border-slate-200 p-2"><span className="text-[10px] font-bold text-slate-500">E{index + 1}</span><EdgeLengthInput value={lengthMm} label={`Edge ${index + 1} length in millimetres`} onCommit={(value) => onSetEdgeLength(platform.id, edge.id, value)} /><select aria-label={`Edge ${index + 1} role`} value={edge.role} onChange={(event) => onSetEdgeRole(platform.id, edge.id, event.target.value as PlatformEdgeRole)} className="min-h-9 min-w-0 rounded-md border border-slate-300 bg-white px-1 text-[10px] text-slate-700"><option value="open">Open</option><option value="guard">Guard</option><option value="house">House</option><option value="shared">Shared</option><option value="stair">Stair opening</option></select><button type="button" onClick={() => onInsertVertex(platform.id, edge.id)} aria-label={`Insert shape corner on edge ${index + 1}`} title="Insert shape corner" className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white text-slate-700"><Plus size={14} /></button></div>;
      })}</div>
    </fieldset>
    <button type="button" onClick={() => onRemove(platform.id)} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={15} /> Remove platform</button>
  </div>;
}

function NumberField({ icon, label, value, suffix, min, max, step = 10, onChange }: { icon: React.ReactNode; label: string; value: number; suffix: string; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const parsed = Number(draft); if (Number.isFinite(parsed) && parsed >= min && parsed <= max) { if (parsed !== value) onChange(parsed); } else setDraft(String(value)); };
  return <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500"><span className="flex items-center gap-1">{icon}{label}</span><span className="flex min-h-10 items-center overflow-hidden rounded-lg border border-slate-300"><input aria-label={label} type="number" value={draft} min={min} max={max} step={step} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { commit(); event.currentTarget.blur(); } }} className="min-w-0 flex-1 px-2 text-xs font-semibold normal-case tracking-normal text-slate-800 outline-none" /><span className="pr-2 text-[10px] normal-case tracking-normal text-slate-400">{suffix}</span></span></label>;
}

function EdgeLengthInput({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const parsed = Number(draft); if (Number.isFinite(parsed) && parsed >= 300 && parsed !== value) onCommit(parsed); else setDraft(String(value)); };
  return <span className="flex min-h-9 items-center overflow-hidden rounded-md border border-slate-300 bg-white"><input aria-label={label} type="number" min="300" step="10" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { commit(); event.currentTarget.blur(); } }} className="min-w-0 flex-1 px-2 text-right text-[11px] font-semibold text-slate-800 outline-none" /><span className="pr-1 text-[8px] text-slate-400">mm</span></span>;
}
