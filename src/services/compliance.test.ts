import { describe, expect, it } from 'vitest';
import type { Deck, Property } from '../types';
import { runComplianceCheck } from './compliance';

describe('compliance issue identity', () => {
  it('does not emit the closing polygon point as a duplicate setback warning', () => {
    const property = {
      address: null, parcel: { areaSqm: 500 }, zoning: { maxLotCoverage: 100 }, snowLoad: 1, buildings: [], evidence: [],
      buildableEnvelope: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
    } as unknown as Property;
    const deck = {
      area: 10,
      footprint: { polygons: [[[2, 2], [3, 2], [3, 3], [2, 2]]], heightAboveGrade: .3, attachedToHouse: false },
      stairs: { enabled: false }, guard: { enabled: false },
      structure: { postSize: '6x6', footingSize: 300, footingDepth: 450, ledgerAttachment: '', deckingThickness: 38, selection: { status: 'table-supported' } },
    } as unknown as Deck;
    const setbacks = runComplianceCheck(deck, property).filter((issue) => issue.category === 'setback');
    expect(setbacks).toHaveLength(3);
    expect(new Set(setbacks.map((issue) => issue.id)).size).toBe(setbacks.length);
  });
});
