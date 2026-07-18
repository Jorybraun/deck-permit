import type { DeckShape } from '../types';

export const DECK_PRESETS: { shape: DeckShape; name: string; description: string; depth: number; width: number; height: number }[] = [
  { shape: 'rectangle', name: 'Platform', description: 'A simple low deck off the back door', depth: 3.0, width: 4.0, height: 0.3 },
  { shape: 'l-shape', name: 'L-Shape', description: 'Wraps around a corner of the house', depth: 4.0, width: 5.0, height: 0.6 },
  { shape: 'rectangle', name: 'Raised', description: 'Taller deck with stairs down to yard', depth: 3.5, width: 4.5, height: 1.2 },
];

export function deckPresetArea(preset: (typeof DECK_PRESETS)[number]): number {
  const shapeFactor = preset.shape === 'l-shape' ? 0.7 : preset.shape === 'wraparound' ? 0.44 : 1;
  return preset.width * preset.depth * shapeFactor;
}
