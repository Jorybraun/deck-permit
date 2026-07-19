import { describe, expect, it } from 'vitest';
import { existingLayersPointerEvents, openingPlanLabel } from './DeckPlanEditor';

describe('DeckPlanEditor layer hit testing', () => {
  it('lets a new platform place corners over every existing design layer', () => {
    expect(existingLayersPointerEvents('draw')).toBe('none');
  });

  it('restores existing geometry interactions for editing and connections', () => {
    expect(existingLayersPointerEvents('select')).toBeUndefined();
    expect(existingLayersPointerEvents('insert')).toBeUndefined();
    expect(existingLayersPointerEvents('remove')).toBeUndefined();
    expect(existingLayersPointerEvents('stairs')).toBeUndefined();
  });

  it('labels an admitted Cerebras observation by its real photo provenance', () => {
    expect(openingPlanLabel({ id: 'W1', kind: 'window', offsetMm: 600, widthMm: 1200, sillHeightMm: 900, evidenceStatus: 'photo-observed', sourceAiObservationRefs: ['analysis-1:observation-1'] })).toBe('WINDOW W1 · AI / PHOTO OBSERVED');
  });
});
