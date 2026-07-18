import { describe, expect, it } from 'vitest';
import type { Property } from '../types';
import { createDeck, rebuildDeck } from './deckSizing';

const property: Property = {
  address: null,
  parcel: {
    pid: 'PID-1', pidRaw: '1', parcelName: '', planNumber: '', municipality: 'Sidney', ownerType: '', parcelClass: '', areaSqm: 400,
    polygon: [[-123, 48], [-122.999, 48], [-122.999, 48.001], [-123, 48.001], [-123, 48]], center: [-122.9995, 48.0005],
  },
  zoning: null,
  buildableEnvelope: null,
  snowLoad: 1,
  buildings: [],
  evidence: [],
};

describe('parametric deck rebuild', () => {
  it('resizes geometry while preserving user-selected finishes and detail choices', () => {
    const deck = createDeck('rectangle', property.parcel, 3, 4, 0.61, true, 'south', property.snowLoad);
    deck.structure.deckingMaterial = 'Driftwood composite decking';
    deck.guard = { ...deck.guard, enabled: true, height: 1070, material: 'Frameless glass guardrail' };
    deck.stairs = { ...deck.stairs, enabled: true, edge: 'east', width: 1.1, treadRun: 300 };

    const rebuilt = rebuildDeck(deck, property, { width: 5.5, depth: 3.4, heightAboveGrade: 1.2 });

    expect(rebuilt.dimensions).toEqual({ width: 5.5, depth: 3.4 });
    expect(rebuilt.footprint.heightAboveGrade).toBe(1.2);
    expect(rebuilt.structure.deckingMaterial).toBe('Driftwood composite decking');
    expect(rebuilt.guard).toMatchObject({ enabled: true, height: 1070, material: 'Frameless glass guardrail' });
    expect(rebuilt.stairs).toMatchObject({ enabled: true, edge: 'east', width: 1.1, treadRun: 300 });
    expect(rebuilt.stairs.numRisers).toBe(6);
  });

  it('reselects the CWC table using the retained lumber treatment', () => {
    const deck = createDeck('rectangle', property.parcel, 2.5, 4, 0.6, true, 'south', property.snowLoad);
    deck.structure.lumberTreatment = 'not-incised';
    const rebuilt = rebuildDeck(deck, property, { depth: 3 });
    expect(rebuilt.structure.lumberTreatment).toBe('not-incised');
    expect(rebuilt.structure.selection.joistTable).toBe('Table 2a');
  });
});
