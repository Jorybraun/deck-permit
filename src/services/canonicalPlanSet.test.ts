import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary } from '../domain/deckDesign';
import { generateFramingDesign } from '../domain/framingDesign';
import { createSiteModel, selectHouseWall } from '../domain/siteModel';
import type { Property } from '../types';
import { canonicalPlanFingerprint, generateCanonicalPlanSet } from './canonicalPlanSet';

const property: Property = {
  address: { fullAddress: '2433 Lovell Ave, Sidney, BC', civicNumber: '2433', streetName: 'Lovell', streetType: 'Ave', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: '', coordinates: [-123.399, 48.659], score: 100 },
  parcel: { pid: '000-111-222', pidRaw: '000111222', parcelName: 'Test parcel', planNumber: 'VIP123', municipality: 'Town of Sidney', ownerType: '', parcelClass: '', areaSqm: 720, polygon: [[-123.400, 48.658], [-123.398, 48.658], [-123.398, 48.660], [-123.400, 48.660], [-123.400, 48.658]], center: [-123.399, 48.659], geometrySource: 'live' },
  buildings: [{ id: 'house', primary: true, areaSqm: 100, kind: 'building-footprint', sourceId: 'sidney-gis', confidence: 'medium', polygon: [[-123.3995, 48.6590], [-123.3988, 48.6590], [-123.3988, 48.6593], [-123.3995, 48.6593], [-123.3995, 48.6590]] }],
  zoning: null, buildableEnvelope: null, snowLoad: 1,
  evidence: [{ id: 'parcel', label: 'Town parcel layer', url: 'https://example.test/parcel', authority: 'municipal', retrievedAt: '2026-07-18T00:00:00.000Z', status: 'reference' }], existingConditions: null,
};

describe('canonical ten-sheet review set', () => {
  it('derives coordinated, parseable 11×17 sheets from the current design and framing graph', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Upper deck', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
    design = addPlatform(design, { name: 'Lower deck', boundary: rectangularBoundary(4710, 0, 3500, 3000), elevationMm: 450 });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'platform', platformId: 'P2' }, fromEdgeId: 'P1-E2', toEdgeId: 'P2-E4', startMm: [4000, 1500], endMm: [4710, 1500], directionDeg: 0, riserCount: 3, treadDepthMm: 355 });
    const selectedSite = selectHouseWall(createSiteModel(property), property, 'house', 0);
    const site = { ...selectedSite, measuredBy: 'Homeowner', designWall: { ...selectedSite.designWall, openings: [{ id: 'D1', kind: 'door' as const, offsetMm: 900, widthMm: 1800, sillHeightMm: 120 }] } };
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T00:00:00.000Z');
    const planSet = generateCanonicalPlanSet({ property, site, design, framing, issuedAt: '2026-07-18T00:00:00.000Z' });

    expect(planSet.fingerprint).not.toBe(`DP-${framing.inputFingerprint.slice(-8).toUpperCase()}`);
    expect(planSet.sheets).toHaveLength(10);
    expect(planSet.sheets.map((sheet) => sheet.number)).toEqual(['A0.0', 'C1.0', 'A1.0', 'A2.0', 'S1.0', 'S2.0', 'A3.0', 'S3.0', 'A4.0', 'S4.0']);
    expect(planSet.sheets.every((sheet) => sheet.designFingerprint === planSet.fingerprint)).toBe(true);
    for (const sheet of planSet.sheets) {
      const errors: string[] = [];
      const xml = new DOMParser({ onError: (_level, message) => errors.push(message) }).parseFromString(sheet.svg, 'image/svg+xml');
      expect(errors, sheet.number).toEqual([]);
      expect(xml.documentElement!.tagName).toBe('svg');
      expect(xml.documentElement!.getAttribute('width')).toBe('1700');
      expect(sheet.svg).toContain(planSet.fingerprint);
      expect(sheet.svg).toContain('PROFESSIONAL REVIEW');
      expect(sheet.svg).toContain('NOT FOR CONSTRUCTION');
      expect(sheet.svg).toContain('BLANK UNTIL APPLIED');
    }
    expect(planSet.sheets.find((sheet) => sheet.number === 'A1.0')?.svg).toContain('SELECTED HOUSE WALL');
    const existingSheet = planSet.sheets.find((sheet) => sheet.number === 'C1.0')?.svg || '';
    expect(existingSheet).toContain('EXISTING HOUSE WALL AND OPENING RECORD');
    expect(existingSheet).toContain('D1 · 1800 W · SILL 120');
    expect(existingSheet).toContain('MEASUREMENT / DATUM PROVENANCE');
    expect(existingSheet).toContain('EXISTING-CONDITION EVIDENCE REGISTER');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A2.0')?.svg).toContain('DECK, LANDING, STAIR AND GUARD PLAN');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A2.0')?.svg).toContain('STAIR 1 · 900 WIDE · 3R');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S1.0')?.svg).toContain('FOOTING / POST COORDINATE SCHEDULE');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S1.0')?.svg).toContain('FOUNDATION DESIGN GATE');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S2.0')?.svg).toContain('Stair framing');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S2.0')?.svg).toContain('ST1-FROM-HDR');
    const elevationSheet = planSet.sheets.find((sheet) => sheet.number === 'A3.0')?.svg || '';
    expect(elevationSheet).toContain('E1 · HOUSE → YARD BUILDING SECTION / ELEVATION');
    expect(elevationSheet).toContain('E2 · SELECTED HOUSE WALL ELEVATION');
    expect(elevationSheet).toContain('UPPER DECK · TOP EL. 900');
    expect(elevationSheet).toContain('LOWER DECK · TOP EL. 450');
    expect(elevationSheet).toContain('STAIR 1 · 3R @ 150 · B → LOWER DECK');
    expect(elevationSheet).toContain('data-platform-id="P1"');
    expect(elevationSheet).toContain('P1-B1-P1-F');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('3 STRINGERS');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('TOP: ST1-FROM-CONN');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S4.0')?.svg).toContain('PROFESSIONAL REVIEW GATES');

    const movedDoorSite = { ...site, designWall: { ...site.designWall, openings: [{ ...site.designWall.openings[0], offsetMm: 1200 }] } };
    expect(canonicalPlanFingerprint({ property, site: movedDoorSite, design, framing })).not.toBe(planSet.fingerprint);
    expect(canonicalPlanFingerprint({ property: { ...property, parcel: { ...property.parcel!, pid: '999-888-777' } }, site, design, framing })).not.toBe(planSet.fingerprint);
    expect(canonicalPlanFingerprint({ property, site: { ...site, updatedAt: '2099-01-01T00:00:00.000Z' }, design, framing: { ...framing, generatedAt: '2099-01-01T00:00:00.000Z' } })).toBe(planSet.fingerprint);
  });
});
