import { afterEach, describe, expect, it } from 'vitest';
import type { BuildingFootprint, Property } from '../types';
import { useStore } from '../state/store';
import { createDeck } from './deckSizing';
import { executeTool } from './agent';

const parcel: NonNullable<Property['parcel']> = { pid: '1', pidRaw: '1', parcelName: '', planNumber: '', municipality: 'Sidney', ownerType: '', parcelClass: '', areaSqm: 900, polygon: [[-123,48],[-122.9996,48],[-122.9996,48.0003],[-123,48.0003],[-123,48]], center: [-122.9998,48.00015] };
const building: BuildingFootprint = { id: 'house', kind: 'roofline', sourceId: '1', confidence: 'medium', primary: true, areaSqm: 80, polygon: [[-122.9999,48.00012],[-122.9997,48.00012],[-122.9997,48.0002],[-122.9999,48.0002],[-122.9999,48.00012]] };

afterEach(() => useStore.getState().reset());

describe('agent site placement tool', () => {
  it('updates the same parametric placement record as the direct form input', async () => {
    const property: Property = { address: null, parcel, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [building], evidence: [] };
    const deck = createDeck('rectangle', parcel, 3, 4, .8, true, 'south', 1, building);
    useStore.getState().setProperty(property);
    useStore.getState().setDeck(deck);
    const before = deck.footprint.polygons[0][0][0];
    const response = await executeTool({ tool: 'set_site_placement', args: { house_wall: 'south', wall_start_offset_m: 1.25, recorded_by: 'QA designer', recorded_at: '2026-07-18', notes: 'West wall corner reference' } });
    const updated = useStore.getState().deck!;
    expect(response).toContain('1.250 m');
    expect(updated.sitePlacement).toMatchObject({ wallStartOffsetM: 1.25, recordedBy: 'QA designer', status: 'field-input-unverified' });
    expect(updated.footprint.polygons[0][0][0]).not.toBe(before);
    expect(useStore.getState().compliance.filter((issue) => issue.id.startsWith('site-placement-'))).toEqual([]);
  });

  it('applies exact beam and support coordinates through chat tooling', async () => {
    const property: Property = { address: null, parcel, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [building], evidence: [] };
    const deck = createDeck('rectangle', parcel, 3, 4, .8, true, 'south', 1, building);
    useStore.getState().setProperty(property);
    useStore.getState().setDeck(deck);
    const response = await executeTool({ tool: 'set_framing_layout', args: { beam_offsets_m: [2.6], post_stations_m: [0, 1.3, 2.7, 4], stair_offset_m: 1.4 } });
    expect(response).toContain('Construction layout updated');
    expect(useStore.getState().deck?.layout).toMatchObject({ beamOffsetsFromHouseM: [2.6], postStationsM: [0, 1.3, 2.7, 4], stairOffsetM: 1.4 });
  });
});
