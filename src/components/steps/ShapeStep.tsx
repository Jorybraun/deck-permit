import { useStore } from '../../state/store';
import { rebuildDeck } from '../../services/deckSizing';
import { runComplianceCheck } from '../../services/compliance';
import type { DeckShape } from '../../types';
import { SitePlacementPanel } from '../SitePlacementPanel';

export function ShapeStep() {
  const property = useStore((s) => s.property);
  const deck = useStore((s) => s.deck);
  const setDeck = useStore((s) => s.setDeck);
  const setCompliance = useStore((s) => s.setCompliance);
  const setStep = useStore((s) => s.setStep);
  const markStepComplete = useStore((s) => s.markStepComplete);

  if (!deck || !property.parcel) {
    return <div className="p-6 text-text-secondary">Pick a deck style first.</div>;
  }

  const updateDimension = (depth: number, width: number, height: number, shape?: DeckShape) => {
    const newDeck = rebuildDeck(deck, property, { shape: shape || deck.footprint.shape, depth, width, heightAboveGrade: height });
    setDeck(newDeck);
    // Live compliance check
    const issues = runComplianceCheck(newDeck, property);
    setCompliance(issues);
  };

  const handleContinue = () => {
    markStepComplete('shape');
    setStep('structure');
  };

  const applyDeck = (nextDeck: typeof deck) => {
    setDeck(nextDeck);
    setCompliance(runComplianceCheck(nextDeck, property));
  };

  // Dimensions are the parametric model's source of truth.
  const currentDepth = deck.dimensions.depth;
  const currentWidth = deck.dimensions.width;
  const currentHeight = deck.footprint.heightAboveGrade;

  const errorCount = useStore((s) => s.compliance.filter(i => i.severity === 'error' && !i.resolved).length);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-1">Shape & Size</h2>
        <p className="text-sm text-text-secondary">
          Drag the sliders to set your deck dimensions. The canvas updates live.
        </p>
      </div>

      {/* Shape selector */}
      <div>
        <label className="text-sm font-medium text-text-primary mb-2 block">Shape</label>
        <div className="flex gap-2">
          {(['rectangle', 'l-shape', 'wraparound'] as DeckShape[]).map((s) => (
            <button
              key={s}
              onClick={() => updateDimension(currentDepth, currentWidth, currentHeight, s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                deck.footprint.shape === s
                  ? 'bg-primary text-white'
                  : 'border border-border text-text-secondary hover:bg-surface'
              }`}
            >
              {s === 'l-shape' ? 'L-Shape' : s === 'wraparound' ? 'Wraparound' : 'Rectangle'}
            </button>
          ))}
        </div>
      </div>

      {/* Depth slider */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-text-primary">Depth (joist span)</label>
          <span className="text-sm text-primary font-medium">{currentDepth.toFixed(1)} m</span>
        </div>
        <input
          type="range"
          min="1.5"
          max="6.0"
          step="0.1"
          value={currentDepth}
          onChange={(e) => updateDimension(parseFloat(e.target.value), currentWidth, currentHeight)}
          className="w-full accent-primary"
        />
      </div>

      {/* Width slider */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-text-primary">Width</label>
          <span className="text-sm text-primary font-medium">{currentWidth.toFixed(1)} m</span>
        </div>
        <input
          type="range"
          min="2.0"
          max="8.0"
          step="0.1"
          value={currentWidth}
          onChange={(e) => updateDimension(currentDepth, parseFloat(e.target.value), currentHeight)}
          className="w-full accent-primary"
        />
      </div>

      {/* Height slider */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-text-primary">Height above grade</label>
          <span className="text-sm text-primary font-medium">{(currentHeight * 1000).toFixed(0)} mm</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="3.0"
          step="0.05"
          value={currentHeight}
          onChange={(e) => updateDimension(currentDepth, currentWidth, parseFloat(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-text-secondary mt-1">
          <span>Low (no guard)</span>
          <span>600mm (guard req'd)</span>
          <span>1.8m+ (taller guard)</span>
        </div>
      </div>

      {/* Attachment toggle */}
      <div>
        <label className="text-sm font-medium text-text-primary mb-2 block">Attached to house?</label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const newDeck = rebuildDeck(deck, property, { attachedToHouse: true });
              setDeck(newDeck);
              setCompliance(runComplianceCheck(newDeck, property));
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              deck.footprint.attachedToHouse ? 'bg-primary text-white' : 'border border-border text-text-secondary'
            }`}
          >
            Attached
          </button>
          <button
            onClick={() => {
              const newDeck = rebuildDeck(deck, property, { attachedToHouse: false });
              setDeck(newDeck);
              setCompliance(runComplianceCheck(newDeck, property));
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              !deck.footprint.attachedToHouse ? 'bg-primary text-white' : 'border border-border text-text-secondary'
            }`}
          >
            Detached
          </button>
        </div>
      </div>

      <SitePlacementPanel property={property} deck={deck} onChange={applyDeck} />

      {/* Live compliance summary */}
      <div className="bg-surface rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-primary">Live Code Check</h3>
          <span className={`text-sm font-medium ${errorCount > 0 ? 'text-danger' : 'text-success'}`}>
            {errorCount > 0 ? `${errorCount} issue${errorCount > 1 ? 's' : ''}` : 'All clear'}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          Issues are shown as markers on the canvas. Fix them on the Code Check step.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setStep('vision')}
          className="px-4 py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          className="flex-1 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover text-sm"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
