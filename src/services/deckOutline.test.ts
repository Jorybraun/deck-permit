import { describe, expect, it } from 'vitest';
import type { Deck } from '../types';
import { assessDeckOutline, createDeckOutline, createOutlineFromPoints, exportDeckOutlineDxf } from './deckOutline';

describe('deck CAD outline', () => {
  it('creates a closed dimensioned rectangle in millimetres', () => {
    const outline = createDeckOutline('rectangle', 4, 3, '2026-07-18T00:00:00.000Z');
    const assessment = assessDeckOutline(outline);
    expect(assessment.errors).toEqual([]);
    expect(assessment.areaSqM).toBe(12);
    expect(assessment.widthMm).toBe(4000);
    expect(assessment.depthMm).toBe(3000);
  });

  it('blocks an open or self-crossing outline', () => {
    const open = createOutlineFromPoints([[0, 0], [3000, 3000], [0, 3000], [3000, 0]], false);
    expect(assessDeckOutline(open).errors).toContain('Close the deck outline before generating framing.');
    const crossing = { ...open, closed: true } as const;
    expect(assessDeckOutline(crossing).errors.some((error) => error.includes('cross'))).toBe(true);
  });

  it('exports actual CAD layers and millimetre geometry to DXF', () => {
    const deck = {
      dimensions: { width: 4, depth: 3 },
      footprint: { shape: 'rectangle', outline: createDeckOutline('rectangle', 4, 3), polygons: [], heightAboveGrade: .6, attachedToHouse: true, houseWall: 'south' },
    } as unknown as Deck;
    const dxf = exportDeckOutlineDxf(deck);
    expect(dxf).toContain('DECK-OUTLINE');
    expect(dxf).toContain('EXISTING-HOUSE');
    expect(dxf).toContain('4000');
  });
});
