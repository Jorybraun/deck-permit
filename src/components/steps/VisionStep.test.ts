import { describe, expect, it } from 'vitest';
import { DECK_PRESETS, deckPresetArea } from '../../services/deckPresets';

describe('deck style presets', () => {
  it('keeps the Raised card and generated model rectangular at the advertised area', () => {
    const raised = DECK_PRESETS.find((preset) => preset.name === 'Raised');
    expect(raised).toMatchObject({ shape: 'rectangle', width: 4.5, depth: 3.5, height: 1.2 });
    expect(deckPresetArea(raised!)).toBeCloseTo(15.75);
  });

  it('reports the actual L-shape footprint area instead of its bounding rectangle', () => {
    const lShape = DECK_PRESETS.find((preset) => preset.name === 'L-Shape');
    expect(deckPresetArea(lShape!)).toBeCloseTo(14);
  });
});
