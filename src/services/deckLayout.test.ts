import { describe, expect, it } from 'vitest';
import type { Property } from '../types';
import { createDeck, rebuildDeck } from './deckSizing';
import { assessDeckLayout, normalizeDeckLayout } from './deckLayout';

const property: Property = { address: null, parcel: { pid: '1', pidRaw: '1', parcelName: '', planNumber: '', municipality: 'Sidney', ownerType: '', parcelClass: '', areaSqm: 400, polygon: [[-123,48],[-122.999,48],[-122.999,48.001],[-123,48.001],[-123,48]], center: [-122.9995,48.0005] }, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] };

describe('dimensioned deck layout', () => {
  it('generates coordinated beam and support coordinates inside the selected spacing', () => {
    const deck = createDeck('rectangle', property.parcel, 3, 4, .8, true, 'south', 1);
    const assessment = assessDeckLayout(deck);
    expect(assessment.errors).toEqual([]);
    expect(assessment.layout.beamOffsetsFromHouseM).toEqual([2.65]);
    expect(assessment.layout.postStationsM).toEqual([0, 1.333, 2.667, 4]);
    expect(assessment.maxPostBayM).toBe(1.334);
  });

  it('fails closed on excessive bays and stairs that run past the selected edge', () => {
    const deck = createDeck('rectangle', property.parcel, 3, 4, .8, true, 'south', 1);
    deck.layout = { ...normalizeDeckLayout(deck), postStationsM: [0, 2, 4], stairOffsetM: 3.5 };
    expect(assessDeckLayout(deck).errors.join(' ')).toContain('exceeds');
  });

  it('preserves coordinates for non-geometric edits and safely regenerates them after resizing', () => {
    const deck = createDeck('rectangle', property.parcel, 3, 4, .8, true, 'south', 1);
    deck.layout = { ...normalizeDeckLayout(deck), postStationsM: [0, 1, 2.5, 4] };
    expect(rebuildDeck(deck, property, { heightAboveGrade: 1 }).layout?.postStationsM).toEqual([0, 1, 2.5, 4]);
    expect(rebuildDeck(deck, property, { width: 5 }).layout?.postStationsM).not.toEqual([0, 1, 2.5, 4]);
  });
});
