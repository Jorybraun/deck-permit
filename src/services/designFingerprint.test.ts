import { describe, expect, it } from 'vitest';
import type { Deck, Property } from '../types';
import { computeDesignFingerprint } from './designFingerprint';
import { createDeck } from './deckSizing';

const property: Property = {
  address: null,
  parcel: { pid: 'PID-1', pidRaw: '1', parcelName: '', planNumber: '', municipality: 'Sidney', ownerType: '', parcelClass: '', areaSqm: 400, polygon: [[-123,48],[-122.999,48],[-122.999,48.001],[-123,48.001],[-123,48]], center: [-122.9995,48.0005] },
  zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [],
};

describe('design fingerprint', () => {
  it('is stable for the same design and changes with permit-relevant geometry', () => {
    const deck = createDeck('rectangle', property.parcel, 3, 4, 0.6, true, 'south', 1) as Deck;
    const first = computeDesignFingerprint(property, deck);
    expect(computeDesignFingerprint(property, structuredClone(deck))).toBe(first);
    expect(computeDesignFingerprint(property, { ...deck, dimensions: { ...deck.dimensions, width: 4.1 } })).not.toBe(first);
    const moved = { ...deck, sitePlacement: { ...deck.sitePlacement!, wallStartOffsetM: deck.sitePlacement!.wallStartOffsetM + .25 } };
    expect(computeDesignFingerprint(property, moved)).not.toBe(first);
    expect(computeDesignFingerprint(property, { ...deck, sitePlacement: { ...deck.sitePlacement!, updatedAt: '2099-01-01T00:00:00Z' } })).toBe(first);
    const supportMoved = { ...deck, layout: { ...deck.layout!, postStationsM: [0, 1.2, 2.8, 4] } };
    expect(computeDesignFingerprint(property, supportMoved)).not.toBe(first);
    expect(computeDesignFingerprint(property, { ...deck, layout: { ...deck.layout!, updatedAt: '2099-01-01T00:00:00Z' } })).toBe(first);
    const measuredProperty = { ...property, existingConditions: { schema: 'existing-house-conditions/v1', status: 'field-input-unverified', houseWidthM: 8, houseDepthM: 6, wallHeightM: 3, attachmentWall: 'south', attachmentWallLengthM: 8, proposedLedgerLengthM: 4, rimBoardMaterial: 'solid-sawn', rimBoardDepthMm: 241, cladding: 'wood-siding', doorOpeningOffsetM: 1, doorOpeningWidthM: .9, doorThresholdHeightMm: 675, flashingFeasible: 'yes', measuredBy: 'Designer', measuredAt: '2026-07-18', notes: '', updatedAt: '2026-07-18T12:00:00Z' } } satisfies Property;
    const measuredFingerprint = computeDesignFingerprint(measuredProperty, deck);
    expect(measuredFingerprint).not.toBe(first);
    expect(computeDesignFingerprint({ ...measuredProperty, existingConditions: { ...measuredProperty.existingConditions!, updatedAt: '2026-07-19T12:00:00Z' } }, deck)).toBe(measuredFingerprint);
  });
});
