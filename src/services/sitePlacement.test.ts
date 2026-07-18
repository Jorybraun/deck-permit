import { describe, expect, it } from 'vitest';
import type { BuildingFootprint, Property } from '../types';
import { createDeck, rebuildDeck } from './deckSizing';
import { assessSitePlacement, createDefaultSitePlacement } from './sitePlacement';

const parcel = { pid: '1', pidRaw: '1', parcelName: '', planNumber: '', municipality: 'Sidney', ownerType: '', parcelClass: '', areaSqm: 900, polygon: [[-123,48],[-122.9996,48],[-122.9996,48.0003],[-123,48.0003],[-123,48]], center: [-122.9998,48.00015] } as const;
const building: BuildingFootprint = { id: 'house', kind: 'roofline', sourceId: '1', confidence: 'medium', primary: true, areaSqm: 80, polygon: [[-122.9999,48.00012],[-122.9997,48.00012],[-122.9997,48.0002],[-122.9999,48.0002],[-122.9999,48.00012]] };
const property: Property = { address: null, parcel: { ...parcel, polygon: parcel.polygon.map((point) => [...point]) as [number, number][], center: [...parcel.center] }, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [building], evidence: [] };

describe('site placement', () => {
  it('centres a generated deck and moves its geospatial footprint from an explicit wall offset', () => {
    const placement = createDefaultSitePlacement(property, 4, true, 'south');
    const deck = createDeck('rectangle', property.parcel, 3, 4, .8, true, 'south', 1, building, placement);
    const moved = rebuildDeck(deck, property, { sitePlacement: { ...placement, wallStartOffsetM: placement.wallStartOffsetM + .5, recordedBy: 'Site designer', recordedAt: '2026-07-18', status: 'field-input-unverified', referenceSource: 'field-measurement' } });
    expect(moved.footprint.polygons[0][0][0]).toBeGreaterThan(deck.footprint.polygons[0][0][0]);
    expect(assessSitePlacement(property, moved).errors).toEqual([]);
  });

  it('rejects wall overflow and unattributed field input', () => {
    const placement = createDefaultSitePlacement(property, 4, true, 'south');
    const deck = createDeck('rectangle', property.parcel, 3, 4, .8, true, 'south', 1, building, { ...placement, wallStartOffsetM: 99, status: 'field-input-unverified', referenceSource: 'field-measurement' });
    const assessment = assessSitePlacement(property, deck);
    expect(assessment.errors.join(' ')).toContain('exceed');
    expect(assessment.errors.join(' ')).toContain('attribution');
    expect(assessment.errors.join(' ')).toContain('YYYY-MM-DD');
  });
});
