import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary, setPlatformFramingIntent } from '../domain/deckDesign';
import { generateFramingDesign } from '../domain/framingDesign';
import { createSiteModel, selectHouseWall, updateSiteModel } from '../domain/siteModel';
import type { Property } from '../types';
import { buildCanonicalCalculationPdf, buildCanonicalCalculationReport, CANONICAL_CALCULATION_REPORT_SCHEMA } from './canonicalCalculationReport';

const property: Property = {
  address: { fullAddress: '2433 Lovell Ave, Sidney, BC', civicNumber: '2433', streetName: 'Lovell', streetType: 'Ave', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: '', coordinates: [-123.399, 48.659], score: 100 },
  parcel: { pid: '000-111-222', pidRaw: '000111222', parcelName: 'Test parcel', planNumber: 'VIP123', municipality: 'Town of Sidney', ownerType: '', parcelClass: '', areaSqm: 720, polygon: [[-123.400, 48.658], [-123.398, 48.658], [-123.398, 48.660], [-123.400, 48.660], [-123.400, 48.658]], center: [-123.399, 48.659], geometrySource: 'live' },
  buildings: [{ id: 'house', primary: true, areaSqm: 100, kind: 'building-footprint', sourceId: 'sidney-gis', confidence: 'medium', polygon: [[-123.3995, 48.6590], [-123.3988, 48.6590], [-123.3988, 48.6593], [-123.3995, 48.6593], [-123.3995, 48.6590]] }],
  zoning: null, buildableEnvelope: null, snowLoad: 1, evidence: [], existingConditions: null,
};

function project() {
  let design = addPlatform(createEmptyDesign(), { name: 'Upper deck', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
  design = setPlatformFramingIntent(design, 'P1', { supportStrategy: 'ledger', joistSpacingMm: 400 });
  design = addPlatform(design, { name: 'Landing', purpose: 'landing', boundary: rectangularBoundary(4560, 0, 1800, 1800), elevationMm: 450 });
  design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'platform', platformId: 'P2' }, fromEdgeId: 'P1-E2', toEdgeId: 'P2-E4', startMm: [4000, 900], endMm: [4560, 900], directionDeg: 0, widthMm: 900, riserCount: 3 });
  const selected = selectHouseWall(createSiteModel(property), property, 'house', 0);
  const site = updateSiteModel(selected, { status: 'field-input-unverified', measuredBy: 'Homeowner' }, { selectionStatus: 'field-measured', lengthMm: 4000, rimMaterial: 'solid-sawn', rimDepthMm: 235, cladding: 'wood-siding', flashingFeasible: 'yes' });
  const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T00:00:00.000Z');
  return { design, site, framing };
}

describe('canonical structural calculation report', () => {
  it('records member demands, bearing screens, stair geometry, connections, and review gates against one fingerprint', () => {
    const { design, site, framing } = project();
    const report = buildCanonicalCalculationReport({ property, site, design, framing, revision: 3, generatedAt: '2026-07-18T01:00:00.000Z' });
    expect(report.schema).toBe(CANONICAL_CALCULATION_REPORT_SCHEMA);
    expect(report.designFingerprint).toMatch(/^DP-[A-F0-9]{8}$/);
    expect(report).toMatchObject({ revision: 3, notForConstruction: true, issuePurpose: 'professional-review' });
    expect(report.platformSystems).toHaveLength(2);
    expect(report.joistGroups.length).toBeGreaterThan(0);
    expect(report.joistGroups[0]).toMatchObject({ lineLoadKnM: expect.any(Number), momentDemandKnM: expect.any(Number), shearDemandKn: expect.any(Number) });
    expect(report.joistGroups[0].momentDemandKnM).toBeGreaterThan(0);
    expect(report.beams.length).toBe(framing.beams.length);
    expect(report.postFootingChecks).toHaveLength(framing.footings.length);
    expect(report.postFootingChecks.every((item) => item.requiredBearingAreaSqM > 0 && item.providedBearingAreaSqM > 0 && item.footingDepth === 'unresolved')).toBe(true);
    expect(report.stairs[0]).toMatchObject({ id: 'ST1', riserCount: 3, stringerCount: 3, status: 'review-required' });
    expect(report.connections).toHaveLength(framing.connections.length);
    expect(report.connections.every((connection) => connection.status === 'design-required')).toBe(true);
    expect(report.reviewGates.some((gate) => gate.status === 'required')).toBe(true);
    expect(report.limitations.join(' ')).toContain('not authenticated engineering');
  });

  it('renders a searchable multi-page PDF booklet', async () => {
    const { design, site, framing } = project();
    const report = buildCanonicalCalculationReport({ property, site, design, framing, revision: 3, generatedAt: '2026-07-18T01:00:00.000Z' });
    const blob = await buildCanonicalCalculationPdf(report);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(5_000);
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain('%PDF-');
    expect(new TextDecoder('latin1').decode(bytes)).toContain('/Type /Page');
  });
});
