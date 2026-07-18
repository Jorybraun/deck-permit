import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupProperty, PropertyLookupError, suggestAddresses } from './propertyLookup';

afterEach(() => vi.unstubAllGlobals());

describe('property address resolution', () => {
  it('returns ranked civic address options for autocomplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [
      { properties: { fullAddress: '1364 W 11th Ave, Vancouver, BC', civicNumber: 1364, streetName: '11th', streetType: 'Ave', localityName: 'Vancouver', score: 100 }, geometry: { coordinates: [-123.1351034, 49.2613856] } },
      { properties: { fullAddress: '1364 E 11th Ave, Vancouver, BC', civicNumber: 1364, streetName: '11th', streetType: 'Ave', localityName: 'Vancouver', score: 97 }, geometry: { coordinates: [-123.0760493, 49.2604763] } },
    ] }), { status: 200 })));
    const options = await suggestAddresses('1364 w 11th ave vancouver bc');
    expect(options.map((option) => option.fullAddress)).toEqual(['1364 W 11th Ave, Vancouver, BC', '1364 E 11th Ave, Vancouver, BC']);
    expect(options[0]).toMatchObject({ score: 100, coordinates: [-123.1351034, 49.2613856] });
  });

  it('hides generic street fallbacks once the requested civic number has an exact candidate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [
      { properties: { fullAddress: '5828 Battison St, Vancouver, BC', civicNumber: 5828, streetName: 'Battison', streetType: 'St', localityName: 'Vancouver', score: 99 }, geometry: { coordinates: [-123.0305485, 49.2311057] } },
      { properties: { fullAddress: 'Battison St, Vancouver, BC', civicNumber: '', streetName: 'Battison', streetType: 'St', localityName: 'Vancouver', score: 77 }, geometry: { coordinates: [-123.0304839, 49.2292024] } },
    ] }), { status: 200 })));
    const options = await suggestAddresses('5828 Battison St, Vancouver, BC');
    expect(options.map((option) => option.fullAddress)).toEqual(['5828 Battison St, Vancouver, BC']);
  });

  it('rejects a street-level fallback and offers authoritative municipal civic addresses', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: 'FeatureCollection', features: [{
        type: 'Feature', properties: { fullAddress: 'Lovell Ave, Sidney, BC', civicNumber: '', streetName: 'Lovell', streetType: 'Ave', localityName: 'Sidney', localityType: 'Town', score: 77 }, geometry: { type: 'Point', coordinates: [-123.399763, 48.6593998] },
      }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ features: [
        { attributes: { FullAddress: '2433 LOVELL AVE' } },
        { attributes: { FullAddress: '2423 LOVELL AVE' } },
        { attributes: { FullAddress: '2403 LOVELL AVE' } },
      ] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    let failure: unknown;
    try { await lookupProperty('24243 Lovell Ave, Sidney, BC'); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(PropertyLookupError);
    expect((failure as PropertyLookupError).message).toContain('matched only Lovell Ave');
    expect((failure as PropertyLookupError).suggestions[0]).toBe('2423 Lovell Ave, Sidney, BC');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
