import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary } from '../domain/deckDesign';
import { generateFramingDesign } from '../domain/framingDesign';
import { createSiteModel, selectHouseWall } from '../domain/siteModel';
import type { Property } from '../types';
import { buildProjectCadExchange, PROJECT_CAD_EXCHANGE_SCHEMA } from './projectCadExchange';

const property: Property = {
  address: { fullAddress: '2433 Lovell Ave, Sidney, BC', civicNumber: '2433', streetName: 'Lovell', streetType: 'Ave', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: '', coordinates: [-123.399, 48.659], score: 100 },
  parcel: { pid: '000-111-222', pidRaw: '000111222', parcelName: 'Test parcel', planNumber: 'VIP123', municipality: 'Town of Sidney', ownerType: '', parcelClass: '', areaSqm: 720, polygon: [[-123.400, 48.658], [-123.398, 48.658], [-123.398, 48.660], [-123.400, 48.660], [-123.400, 48.658]], center: [-123.399, 48.659], geometrySource: 'live' },
  buildings: [{ id: 'house', primary: true, areaSqm: 100, kind: 'building-footprint', sourceId: 'sidney-gis', confidence: 'medium', polygon: [[-123.3995, 48.6590], [-123.3988, 48.6590], [-123.3988, 48.6593], [-123.3995, 48.6593], [-123.3995, 48.6590]] }],
  zoning: null, buildableEnvelope: null, snowLoad: 1, evidence: [],
};

describe('project CAD exchange', () => {
  it('exports the canonical property, architectural, framing, and connection graph on named millimetre layers', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
    design = addPlatform(design, { boundary: rectangularBoundary(4710, 0, 3500, 3000), elevationMm: 450 });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'platform', platformId: 'P2' }, fromEdgeId: 'P1-E2', toEdgeId: 'P2-E4', startMm: [4000, 1500], endMm: [4710, 1500], directionDeg: 0, riserCount: 3 });
    const selectedSite = selectHouseWall(createSiteModel(property), property, 'house', 0);
    const site = { ...selectedSite, designWall: { ...selectedSite.designWall, openings: [{ id: 'D1', kind: 'door' as const, offsetMm: 900, widthMm: 1800, sillHeightMm: 120 }] } };
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T00:00:00.000Z');
    const exchange = buildProjectCadExchange({ property, site, design, framing, generatedAt: '2026-07-18T01:00:00.000Z' });

    expect(exchange.schema).toBe(PROJECT_CAD_EXCHANGE_SCHEMA);
    expect(exchange.units).toBe('mm');
    expect(exchange.coordinateSystem).toBe('local-house-wall');
    expect(exchange.notForConstruction).toBe(true);
    expect(exchange.entityCounts).toMatchObject({ platforms: 2, stairs: 1, joists: framing.joists.length, connections: framing.connections.length });
    expect(exchange.layers.map((layer) => layer.id)).toEqual(expect.arrayContaining([
      'A-SITE-PROP', 'A-EXST-BLDG', 'A-EXST-WALL', 'A-EXST-OPEN', 'A-DECK-EDGE', 'A-DECK-STAIR',
      'S-DECK-JOIST', 'S-DECK-BEAM', 'S-DECK-POST', 'S-DECK-FOOTING', 'S-DECK-CONN', 'G-ANNO-ID', 'G-ANNO-NPLT',
    ]));
    expect(exchange.dxf).toContain('$INSUNITS\n70\n4');
    expect(exchange.dxf).toContain('\n2\nA-SITE-PROP\n');
    expect(exchange.dxf).toContain('\n2\nS-DECK-JOIST\n');
    expect(exchange.dxf).toContain('\n2\nS-DECK-CONN\n');
    expect(exchange.dxf).toContain('\n0\nTEXT\n');
    expect(exchange.dxf).toContain(exchange.designFingerprint);
    expect(exchange.dxf).toContain('NOT FOR CONSTRUCTION');
    expect(exchange.dxf).toContain('\n11\n4000\n');
  });

  it('preserves design identity when only export time changes', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    const site = selectHouseWall(createSiteModel(property), property, 'house', 0);
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 });
    const first = buildProjectCadExchange({ property, site, design, framing, generatedAt: '2026-07-18T01:00:00.000Z' });
    const second = buildProjectCadExchange({ property, site, design, framing, generatedAt: '2026-07-18T02:00:00.000Z' });
    expect(second.designFingerprint).toBe(first.designFingerprint);
    expect(second.dxf).toBe(first.dxf);
  });
});
