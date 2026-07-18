import { Box, Eye, EyeOff, Layers3 } from 'lucide-react';
import type { Deck } from '../types';
import type { HouseModelContext, ModelDisplayMode, ModelPart } from './DeckModel3D';

interface ModelPropertiesProps {
  deck: Deck;
  selectedPart: ModelPart | null;
  mode: ModelDisplayMode;
  showDimensions: boolean;
  houseContext?: HouseModelContext | null;
  onChangeMode: (mode: ModelDisplayMode) => void;
  onToggleDimensions: () => void;
  onChangeDimensions: (dimensions: { width: number; depth: number; height: number }) => void;
}

export function ModelProperties({
  deck,
  selectedPart,
  mode,
  showDimensions,
  houseContext,
  onChangeMode,
  onToggleDimensions,
  onChangeDimensions,
}: ModelPropertiesProps) {
  const change = (field: 'width' | 'depth' | 'height', value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    onChangeDimensions({
      width: field === 'width' ? value : deck.dimensions.width,
      depth: field === 'depth' ? value : deck.dimensions.depth,
      height: field === 'height' ? value : deck.footprint.heightAboveGrade,
    });
  };

  return (
    <aside className="model-properties" aria-label="Model properties" data-testid="model-properties">
      <div className="model-properties-title">
        <div><span>Properties</span><strong>{selectedPart ? partLabel(selectedPart) : 'Deck assembly'}</strong></div>
        <Box size={16} />
      </div>

      {!selectedPart && (
        <div className="model-property-section">
          <h4>Geometry</h4>
          <NumberField label="Width" value={deck.dimensions.width} unit="m" step={0.1} onChange={(value) => change('width', value)} />
          <NumberField label="Depth" value={deck.dimensions.depth} unit="m" step={0.1} onChange={(value) => change('depth', value)} />
          <NumberField label="Deck height" value={deck.footprint.heightAboveGrade} unit="m" step={0.05} onChange={(value) => change('height', value)} />
          <PropertyRow label="Area" value={`${deck.area.toFixed(2)} m²`} />
          <PropertyRow label="Shape" value={deck.footprint.shape} />
        </div>
      )}

      {selectedPart && <PartProperties deck={deck} part={selectedPart} houseContext={houseContext} />}

      <div className="model-property-section">
        <h4>Layers</h4>
        <div className="model-layer-toggle" role="group" aria-label="Model layer">
          <button className={mode === 'finished' ? 'active' : ''} onClick={() => onChangeMode('finished')}><Box size={13} /> Finished</button>
          <button className={mode === 'framing' ? 'active' : ''} onClick={() => onChangeMode('framing')}><Layers3 size={13} /> Framing</button>
        </div>
        <button className="dimension-toggle" onClick={onToggleDimensions} aria-pressed={showDimensions}>
          {showDimensions ? <Eye size={13} /> : <EyeOff size={13} />}
          Dimensions
          <span>{showDimensions ? 'On' : 'Off'}</span>
        </button>
      </div>
    </aside>
  );
}

function PartProperties({ deck, part, houseContext }: { deck: Deck; part: ModelPart; houseContext?: HouseModelContext | null }) {
  const content: Record<ModelPart, Array<[string, string]>> = {
    decking: [['Material', deck.structure.deckingMaterial], ['Thickness', `${deck.structure.deckingThickness} mm`], ['Area', `${deck.area.toFixed(2)} m²`]],
    joists: [['Member', deck.structure.joistSize], ['Spacing', `${deck.structure.joistSpacing} mm o.c.`], ['Species', deck.structure.joistSpecies]],
    beam: [['Member', deck.structure.beamSize], ['Type', 'Built-up dimensional lumber']],
    posts: [['Member', deck.structure.postSize], ['Max spacing', `${deck.structure.postSpacing} m`]],
    footings: [['Type', deck.structure.footingType], ['Diameter/size', `${deck.structure.footingSize} mm`], ['Depth', `${deck.structure.footingDepth} mm`]],
    railing: [['System', deck.guard.material], ['Height', `${deck.guard.height} mm`], ['Max opening', `${deck.guard.openingMax} mm`]],
    stairs: [['Width', `${(deck.stairs.width * 1000).toFixed(0)} mm`], ['Risers', `${deck.stairs.numRisers} @ ${deck.stairs.riserHeight} mm`], ['Tread run', `${deck.stairs.treadRun} mm`]],
    house: [['Attachment wall', houseContext?.attachmentWall || deck.footprint.houseWall], ['Wall length', houseContext ? `${houseContext.width.toFixed(2)} m` : 'estimated'], ['Status', houseContext?.source === 'field-input-unverified' ? 'Field input · evidence required' : 'Reference geometry · verify']],
  };
  return <div className="model-property-section"><h4>Specifications</h4>{content[part].map(([label, value]) => <PropertyRow key={label} label={label} value={value} />)}</div>;
}

function NumberField({ label, value, unit, step, onChange }: { label: string; value: number; unit: string; step: number; onChange: (value: number) => void }) {
  const displayedValue = Number(value.toFixed(3));
  return <label className="model-number-field"><span>{label}</span><span><input type="number" min={step} step={step} value={displayedValue} onChange={(event) => onChange(Number(event.target.value))} /><i>{unit}</i></span></label>;
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return <div className="model-property-row"><span>{label}</span><strong>{value}</strong></div>;
}

function partLabel(part: ModelPart): string {
  const labels: Record<ModelPart, string> = { decking: 'Deck boards', joists: 'Joists', beam: 'Beam', posts: 'Posts', footings: 'Footings', railing: 'Railing', stairs: 'Stairs', house: 'Existing house' };
  return labels[part];
}
