import { useState } from 'react';
import { useStore } from '../../state/store';
import { createDeck } from '../../services/deckSizing';
import { runComplianceCheck } from '../../services/compliance';
import { interpretDeckIntent } from '../../services/aiProvider';
import { deckingMaterialFor, deckToolFor } from '../../services/chatIntent';
import { DECK_PRESETS, deckPresetArea } from '../../services/deckPresets';
import type { DeckShape } from '../../types';

export function VisionStep() {
  const property = useStore((s) => s.property);
  const setDeck = useStore((s) => s.setDeck);
  const setCompliance = useStore((s) => s.setCompliance);
  const setStep = useStore((s) => s.setStep);
  const markStepComplete = useStore((s) => s.markStepComplete);

  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const apiKey = import.meta.env.VITE_CEREBRAS_API_KEY as string | undefined;

  const makeDeck = (
    shape: DeckShape,
    depth: number,
    width: number,
    height: number,
    material?: string,
    stairs?: boolean,
  ) => {
    if (!property.parcel) return;
    const deck = createDeck(shape, property.parcel, depth, width, height, true, 'south', property.snowLoad, property.buildings.find((building) => building.primary));
    if (material) deck.structure.deckingMaterial = material;
    if (stairs !== undefined) deck.stairs.enabled = stairs;
    setDeck(deck);
    setCompliance(runComplianceCheck(deck, property));
    markStepComplete('vision');
    setStep('shape');
  };

  const handleAiGenerate = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiError(null);

    const deterministic = deckToolFor(aiInput);
    if (deterministic) {
      const args = deterministic.args;
      makeDeck(
        String(args.shape) as DeckShape,
        Number(args.depth_m),
        Number(args.width_m),
        Number(args.height_mm) / 1000,
        typeof args.material === 'string' ? args.material : undefined,
        typeof args.stairs === 'boolean' ? args.stairs : undefined,
      );
      setAiLoading(false);
      return;
    }

    if (!apiKey) {
      setAiLoading(false);
      setAiError('Include an exact size, such as “12x16 deck 2 feet high,” or configure an AI key for less structured descriptions.');
      return;
    }

    const { text, error } = await interpretDeckIntent(aiInput.trim(), apiKey);
    setAiLoading(false);

    if (error) {
      setAiError(error);
      return;
    }

    try {
      const parsed = JSON.parse(text) as {
        shape?: DeckShape | null;
        width_m?: number | null;
        depth_m?: number | null;
        height_mm?: number | null;
        materials?: string | null;
        features?: string[];
      };

      const shape = parsed.shape && ['rectangle', 'l-shape', 'wraparound'].includes(parsed.shape)
        ? parsed.shape
        : 'rectangle';
      const width = parsed.width_m || 4.0;
      const depth = parsed.depth_m || 3.0;
      const height = (parsed.height_mm || 600) / 1000;

      makeDeck(shape, depth, width, height, parsed.materials ? deckingMaterialFor(parsed.materials) : undefined, parsed.features?.includes('stairs'));
    } catch (e) {
      setAiError('AI response was not valid JSON. Try again or use a preset.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-1">Pick a Starting Point</h2>
        <p className="text-sm text-text-secondary">
          Don't worry — you can adjust everything next. Choose a preset, or describe your deck to the AI.
        </p>
      </div>

      {/* AI design intent */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-primary">Describe your deck to AI</h3>
        <input
          type="text"
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !aiLoading && handleAiGenerate()}
          placeholder="A 12x16 cedar deck, 3 feet off the ground, with stairs down the back"
          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={aiLoading}
        />
        {!apiKey && (
          <p className="text-xs text-warning">
            Exact dimensions work locally. Add VITE_CEREBRAS_API_KEY only for open-ended descriptions.
          </p>
        )}
        {aiError && <p className="text-xs text-danger">{aiError}</p>}
        <button
          onClick={handleAiGenerate}
          disabled={aiLoading || !aiInput.trim()}
          className="w-full py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
        >
          {aiLoading ? 'Thinking...' : 'Generate with AI'}
        </button>
      </div>

      <div className="space-y-3">
        {DECK_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => makeDeck(preset.shape, preset.depth, preset.width, preset.height)}
            className="w-full text-left p-4 rounded-lg border border-border hover:border-primary hover:bg-surface transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary group-hover:text-primary">
                  {preset.name}
                </h3>
                <p className="text-sm text-text-secondary mt-1">{preset.description}</p>
                <div className="flex gap-4 mt-2 text-xs text-text-secondary">
                  <span>{preset.width}m × {preset.depth}m</span>
                  <span>{(preset.height * 1000).toFixed(0)}mm high</span>
                  <span>{deckPresetArea(preset).toFixed(1)} m²</span>
                </div>
              </div>
              <div className="text-primary opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
                Select →
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setStep('lot')}
          className="px-4 py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm"
        >
          Back
        </button>
      </div>
    </div>
  );
}
