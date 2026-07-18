import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, ChevronLeft, ChevronRight, Crosshair, Files, Layers3, Maximize2, Minus, MousePointer2, Palette, Plus, Ruler, Undo2 } from 'lucide-react';
import { useStore } from '../state/store';
import { renderSiteView, renderFramingView, renderElevationView } from '../services/canvasRenderer';
import { runComplianceCheck } from '../services/compliance';
import { rebuildDeck } from '../services/deckSizing';
import { DesignControls, type DeckingOption, type RailingOption } from './DesignControls';
import type { HouseModelContext, ModelDisplayMode, ModelPart } from './DeckModel3D';
import { ModelProperties } from './ModelProperties';
import { deriveHouseReference } from '../services/existingConditions';
import { FootprintSketchEditor } from './FootprintSketchEditor';
import type { DeckShape } from '../types';

const DeckModel3D = lazy(() => import('./DeckModel3D').then((module) => ({ default: module.DeckModel3D })));

type ViewMode = 'sketch' | 'model' | 'site' | 'framing' | 'elevation' | 'sheets';

export function CanvasView() {
  const property = useStore((s) => s.property);
  const deck = useStore((s) => s.deck);
  const planset = useStore((s) => s.planset);
  const step = useStore((s) => s.step);
  const setDeck = useStore((s) => s.setDeck);
  const setCompliance = useStore((s) => s.setCompliance);
  const [view, setView] = useState<ViewMode>('site');
  const [modelMode, setModelMode] = useState<ModelDisplayMode>('finished');
  const [showDimensions, setShowDimensions] = useState(true);
  const [selectedPart, setSelectedPart] = useState<ModelPart | null>(null);
  const [planPreviewIndex, setPlanPreviewIndex] = useState(0);

  useEffect(() => {
    if (step === 'vision' && deck) setView('model');
    if (step === 'shape' && deck) setView('sketch');
    if (step === 'structure' || step === 'safety') setView('framing');
    if ((step === 'planset' || step === 'submit') && planset) setView('sheets');
  }, [step, Boolean(deck), Boolean(planset)]);

  const effectiveView = view;
  const primaryBuilding = property.buildings.find((building) => building.primary);
  const conditions = property.existingConditions;
  const reference = deriveHouseReference(property);
  const houseContext: HouseModelContext | null = conditions ? {
    width: conditions.attachmentWallLengthM,
    depth: conditions.attachmentWall === 'north' || conditions.attachmentWall === 'south' ? conditions.houseDepthM : conditions.houseWidthM,
    wallHeight: conditions.wallHeightM,
    doorOpeningOffsetM: conditions.doorOpeningOffsetM,
    doorOpeningWidthM: conditions.doorOpeningWidthM,
    doorThresholdHeightMm: conditions.doorThresholdHeightMm,
    attachmentWall: conditions.attachmentWall,
    source: 'field-input-unverified',
  } : primaryBuilding ? { width: reference.widthM, depth: reference.depthM, source: reference.source } : null;

  const showLabels = true;
  const showCompliance = step === 'safety' || step === 'shape';

  let svg = '';
  if (effectiveView === 'site') {
    svg = renderSiteView(property, deck, { view: 'site', width: 800, height: 600, showLabels, showCompliance });
  } else if (effectiveView === 'framing') {
    svg = renderFramingView(deck, property, { view: 'framing', width: 800, height: 600, showLabels, showCompliance });
  } else if (effectiveView === 'elevation') {
    svg = renderElevationView(deck, { view: 'elevation', width: 800, height: 600, showLabels, showCompliance });
  }

  const viewModes: ViewMode[] = planset
    ? ['sketch', 'model', 'site', 'framing', 'elevation', 'sheets']
    : ['sketch', 'model', 'site', 'framing', 'elevation'];
  const activeSheet = planset?.[Math.min(planPreviewIndex, planset.length - 1)] || null;

  const handleSelectDecking = (option: DeckingOption) => {
    if (!deck) return;
    const nextDeck = { ...deck, structure: { ...deck.structure, deckingMaterial: option.value } };
    setDeck(nextDeck);
    setCompliance(runComplianceCheck(nextDeck, property));
  };

  const handleSelectRailing = (option: RailingOption) => {
    if (!deck) return;
    const nextDeck = { ...deck, guard: { ...deck.guard, enabled: option.enabled, material: option.value } };
    setDeck(nextDeck);
    setCompliance(runComplianceCheck(nextDeck, property));
  };

  const handleChangeDimensions = ({ width, depth, height }: { width: number; depth: number; height: number }) => {
    if (!deck || !property.parcel) return;
    const rebuilt = rebuildDeck(deck, property, { width, depth, heightAboveGrade: height });
    setDeck(rebuilt);
    setCompliance(runComplianceCheck(rebuilt, property));
  };
  const handleChangeShape = (shape: DeckShape) => {
    if (!deck || !property.parcel) return;
    const rebuilt = rebuildDeck(deck, property, { shape });
    setDeck(rebuilt);
    setCompliance(runComplianceCheck(rebuilt, property));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="canvas-toolbar">
        <div className="view-switcher" role="tablist" aria-label="Drawing view">
          {viewModes.map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={effectiveView === v}
              onClick={() => setView(v)}
              className={effectiveView === v ? 'active' : ''}
            >
              {v === 'sketch' ? <MousePointer2 size={14} /> : v === 'model' ? <Palette size={14} /> : v === 'site' ? <Layers3 size={14} /> : v === 'framing' ? <Box size={14} /> : v === 'sheets' ? <Files size={14} /> : <Ruler size={14} />}
              {v === 'sketch' ? 'Edit footprint' : v === 'model' ? '3D preview' : v === 'site' ? 'Site plan' : v === 'framing' ? 'Framing' : v === 'sheets' ? 'Drawing set' : 'Elevation'}
            </button>
          ))}
        </div>
        <div className="canvas-meta">
          {deck ? (
            <>
              <span>{deck.area.toFixed(1)} m²</span>
              <i />
              <span>{(deck.footprint.heightAboveGrade * 1000).toFixed(0)} mm high</span>
            </>
          ) : <span>Property view</span>}
        </div>
        <div className="toolbar-actions">
          <button aria-label="Undo"><Undo2 size={15} /></button>
          <button aria-label="Fit drawing"><Maximize2 size={15} /></button>
        </div>
      </div>

      <div className={`canvas-stage ${effectiveView === 'model' || effectiveView === 'sketch' ? 'canvas-stage-model' : ''}`}>
        {effectiveView !== 'model' && effectiveView !== 'sketch' && effectiveView !== 'sheets' && (
          <div className="canvas-tool-palette" aria-label="Drawing tools">
            <button className="active" aria-label="Select"><MousePointer2 size={16} /></button>
            <button aria-label="Measure"><Ruler size={16} /></button>
            <button aria-label="Center drawing"><Crosshair size={16} /></button>
          </div>
        )}
        {effectiveView === 'sheets' && activeSheet ? (
          <div className="plan-preview">
            <div className="plan-preview-bar">
              <button
                aria-label="Previous drawing sheet"
                disabled={planPreviewIndex === 0}
                onClick={() => setPlanPreviewIndex((index) => Math.max(0, index - 1))}
              ><ChevronLeft size={16} /></button>
              <div>
                <strong>{activeSheet.title}</strong>
                <span>Sheet {planPreviewIndex + 1} of {planset!.length} · {activeSheet.scale}</span>
              </div>
              <button
                aria-label="Next drawing sheet"
                disabled={planPreviewIndex === planset!.length - 1}
                onClick={() => setPlanPreviewIndex((index) => Math.min(planset!.length - 1, index + 1))}
              ><ChevronRight size={16} /></button>
            </div>
            <div className="plan-preview-sheet" dangerouslySetInnerHTML={{ __html: activeSheet.svg }} />
          </div>
        ) : effectiveView === 'sketch' && deck ? (
          <FootprintSketchEditor deck={deck} houseContext={houseContext} onResize={handleChangeDimensions} onShapeChange={handleChangeShape} />
        ) : effectiveView === 'model' && deck ? (
          <>
            <Suspense fallback={<div className="model-loading"><span /> Loading parametric model…</div>}>
              <DeckModel3D deck={deck} houseContext={houseContext} mode={modelMode} showDimensions={showDimensions} selectedPart={selectedPart} onSelectPart={setSelectedPart} />
            </Suspense>
            <ModelProperties
              deck={deck}
              selectedPart={selectedPart}
              mode={modelMode}
              showDimensions={showDimensions}
              houseContext={houseContext}
              onChangeMode={setModelMode}
              onToggleDimensions={() => setShowDimensions((visible) => !visible)}
              onChangeDimensions={handleChangeDimensions}
            />
            <DesignControls
              deckingMaterial={deck.structure.deckingMaterial}
              railingMaterial={deck.guard.material}
              railingEnabled={deck.guard.enabled}
              guardRequired={deck.footprint.heightAboveGrade > 0.6}
              onSelectDecking={handleSelectDecking}
              onSelectRailing={handleSelectRailing}
            />
            <div className="model-command-hint"><kbd>Left drag</kbd> Orbit <kbd>Right drag</kbd> Pan <kbd>Scroll</kbd> Zoom <span /> Click a member to inspect</div>
            <div className="absolute left-5 top-5 rounded-md border border-slate-300 bg-white/90 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm">
              House: {houseContext?.source === 'field-input-unverified' ? `field input · ${houseContext.width.toFixed(2)} m ${houseContext.attachmentWall} wall · evidence required` : houseContext?.source === 'municipal-roofline' ? 'municipal roofline reference' : 'estimated context'}
              {deck.sitePlacement && <div className="mt-1 text-primary">Deck offset: {deck.sitePlacement.wallStartOffsetM.toFixed(2)} m from {deck.footprint.houseWall} wall start</div>}
            </div>
          </>
        ) : (
          <div className="drawing-sheet" dangerouslySetInnerHTML={{ __html: svg }} />
        )}
        {!property.parcel && (
          <div className="canvas-empty-note">
            <div><SparkleIcon /></div>
            <strong>Your site plan will appear here</strong>
            <span>Enter an address to load the parcel, zoning envelope, and aerial context.</span>
          </div>
        )}
        {effectiveView !== 'model' && effectiveView !== 'sketch' && effectiveView !== 'sheets' && <div className="zoom-controls">
          <button aria-label="Zoom out"><Minus size={14} /></button>
          <span>100%</span>
          <button aria-label="Zoom in"><Plus size={14} /></button>
        </div>}
        {effectiveView !== 'model' && effectiveView !== 'sketch' && effectiveView !== 'sheets' && <div className="canvas-scale">1:100 <span /> Metric</div>}
      </div>
    </div>
  );
}

function SparkleIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l1.3 5.2L18 9l-4.7 1.8L12 16l-1.3-5.2L6 9l4.7-1.8L12 2Z" fill="currentColor"/><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" fill="currentColor"/></svg>;
}
