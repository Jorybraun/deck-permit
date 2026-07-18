import { describe, expect, it } from 'vitest';
import { existingLayersPointerEvents } from './DeckPlanEditor';

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
});
