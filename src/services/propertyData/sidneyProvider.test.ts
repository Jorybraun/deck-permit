import { describe, expect, it, vi } from 'vitest';
import type { Address } from '../../types';
import { SidneyPropertyProvider } from './sidneyProvider';

const address: Address = {
  fullAddress: '2423 Lovell Ave, Sidney, BC',
  civicNumber: '2423',
  streetName: 'Lovell',
  streetType: 'Ave',
  locality: 'Sidney',
  localityType: 'Town',
  province: 'BC',
  postalCode: '',
  coordinates: [-123.3992251, 48.6592096],
  score: 100,
};

describe('SidneyPropertyProvider', () => {
  it('normalizes parcel facts and ranks the largest municipal roofline as the house', async () => {
    const parcelRing = [[-123.400, 48.658], [-123.398, 48.658], [-123.398, 48.660], [-123.400, 48.660], [-123.400, 48.658]];
    const smallRoof = [[-123.3998, 48.6583], [-123.3996, 48.6583], [-123.3996, 48.6585], [-123.3998, 48.6585], [-123.3998, 48.6583]];
    const houseRoof = [[-123.3995, 48.6588], [-123.3987, 48.6588], [-123.3987, 48.6595], [-123.3995, 48.6595], [-123.3995, 48.6588]];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {
        PID: '007-952-449', LegalDesc: 'LOT 21, BLOCK C, PLAN 1197', LotAreaSqm: 465,
        PlanNumber: '1197', ZONING: 'R2', ActualYearBuilt: 'AUGUST 1973', OBJECTID: 192502,
      }, geometry: { type: 'Polygon', coordinates: [parcelRing] } }] }))
      .mockResolvedValueOnce(jsonResponse({ type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { OBJECTID: 2, Shape__Area: 12 }, geometry: { type: 'Polygon', coordinates: [smallRoof] } },
        { type: 'Feature', properties: { OBJECTID: 1, Shape__Area: 108 }, geometry: { type: 'Polygon', coordinates: [houseRoof] } },
      ] }));

    const result = await new SidneyPropertyProvider(fetcher as typeof fetch).lookup(address);

    expect(result.parcel).toMatchObject({ pid: '007-952-449', planNumber: '1197', areaSqm: 465, zoningCode: 'R2' });
    expect(result.buildings).toHaveLength(2);
    expect(result.buildings[0]).toMatchObject({ areaSqm: 108, primary: true, kind: 'roofline', confidence: 'high' });
    expect(result.evidence.map((item) => item.status)).toEqual(['authoritative', 'reference']);
  });

  it('ranks authoritative municipal address suggestions by civic-number edit distance', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ features: [
      { attributes: { FullAddress: '2433 LOVELL AVE' } },
      { attributes: { FullAddress: '2423 LOVELL AVE' } },
      { attributes: { FullAddress: '2403 LOVELL AVE' } },
    ] }));
    const weakAddress = { ...address, fullAddress: 'Lovell Ave, Sidney, BC', civicNumber: '', score: 77 };
    const suggestions = await new SidneyPropertyProvider(fetcher as typeof fetch).suggestAddresses(weakAddress, '24243 Lovell Ave, Sidney, BC');
    expect(suggestions[0]).toBe('2423 Lovell Ave, Sidney, BC');
    expect(String(fetcher.mock.calls[0][0])).toContain('FullAddress');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
