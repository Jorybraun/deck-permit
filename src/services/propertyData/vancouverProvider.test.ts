import { describe, expect, it, vi } from 'vitest';
import type { Address } from '../../types';
import { VancouverPropertyProvider } from './vancouverProvider';

const address: Address = {
  fullAddress: '1364 W 11th Ave, Vancouver, BC', civicNumber: '1364', streetName: '11th', streetType: 'Ave',
  locality: 'Vancouver', localityType: 'City', province: 'BC', postalCode: '', coordinates: [-123.1351034, 49.2613856], score: 100,
};

describe('VancouverPropertyProvider', () => {
  it('selects the parcel containing the geocoder point and the largest footprint inside it', async () => {
    const parcel = [[-123.1352, 49.2612], [-123.1350, 49.2612], [-123.1350, 49.2616], [-123.1352, 49.2616], [-123.1352, 49.2612]];
    const neighbour = [[-123.1349, 49.2612], [-123.1347, 49.2612], [-123.1347, 49.2616], [-123.1349, 49.2616], [-123.1349, 49.2612]];
    const house = [[-123.13518, 49.26128], [-123.13504, 49.26128], [-123.13504, 49.26148], [-123.13518, 49.26148], [-123.13518, 49.26128]];
    const shed = [[-123.13517, 49.26151], [-123.13512, 49.26151], [-123.13512, 49.26156], [-123.13517, 49.26156], [-123.13517, 49.26151]];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ results: [record(neighbour, { site_id: '999999999' }), record(parcel, { site_id: '013256793', civic_number: '1364', streetname: 'W 11TH AV' })] }))
      .mockResolvedValueOnce(json({ results: [record(shed, { object_id: 2 }), record(house, { object_id: 1 })] }));
    const result = await new VancouverPropertyProvider(fetcher as typeof fetch).lookup(address);
    expect(result.parcel).toMatchObject({ pid: '013-256-793', municipality: 'City of Vancouver' });
    expect(result.buildings).toHaveLength(2);
    expect(result.buildings[0]).toMatchObject({ id: 'vancouver-building-1', primary: true, kind: 'building-footprint' });
    expect(result.evidence.map((source) => source.status)).toEqual(['authoritative', 'reference']);
  });
});

function record(ring: number[][], fields: Record<string, unknown>) { return { ...fields, geom: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } } }; }
function json(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }
