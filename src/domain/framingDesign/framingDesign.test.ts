import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary, selectDesignObject, setPlatformFramingIntent } from '../deckDesign';
import { createSiteModel, updateSiteModel } from '../siteModel';
import type { Property } from '../../types';
import { framingInputFingerprint, generateFramingDesign, isFramingStale } from './framingDesign';

const property: Property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [], existingConditions: null };

describe('FramingDesign v1 public contract', () => {
  it('generates explicit ledger, joist, beam, post, and footing members for a supported platform', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
    design = setPlatformFramingIntent(design, 'P1', { supportStrategy: 'ledger', joistSpacingMm: 400 });
    const site = measuredSite();
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1, treatment: 'not-incised' }, '2026-07-18T00:00:00.000Z');
    expect(framing.codeProfile.id).toBe('bcbc-2024');
    expect(framing.platformSystems[0]).toMatchObject({ platformId: 'P1', joistAxis: 'y', supportStrategy: 'ledger', rectangular: true });
    expect(framing.ledgers).toHaveLength(1);
    expect(framing.beams).toHaveLength(1);
    expect(framing.joists.length).toBeGreaterThan(8);
    expect(framing.posts.length).toBeGreaterThanOrEqual(3);
    expect(framing.footings).toHaveLength(framing.posts.length);
    expect(framing.joists.every((joist) => joist.section.includes('2×8') && joist.status === 'table-screened')).toBe(true);
    expect(framing.status).toBe('review-required');
  });

  it('still lays out irregular platforms but requires structural engineering instead of claiming table support', () => {
    const boundary = { schema: 'closed-boundary/v1' as const, vertices: [
      { id: 'v1', xMm: 0, yMm: 0 }, { id: 'v2', xMm: 5000, yMm: 0 }, { id: 'v3', xMm: 5000, yMm: 2000 },
      { id: 'v4', xMm: 3000, yMm: 2000 }, { id: 'v5', xMm: 3000, yMm: 4000 }, { id: 'v6', xMm: 0, yMm: 4000 },
    ] };
    const design = addPlatform(createEmptyDesign(), { boundary, elevationMm: 750 });
    const framing = generateFramingDesign(design, createSiteModel(property), { municipality: 'City of Vancouver', snowLoadKpa: 1.9 });
    expect(framing.codeProfile.id).toBe('vbbl-2025');
    expect(framing.platformSystems[0]).toMatchObject({ rectangular: false, status: 'engineering-required' });
    expect(framing.joists.length).toBeGreaterThan(0);
    expect(framing.beams.length).toBeGreaterThan(0);
    expect(framing.status).toBe('engineering-required');
    expect(framing.reviewGates.find((gate) => gate.id === 'structural-design')?.status).toBe('required');
  });

  it('derives guards and stair stringers from elevations and vertical connections', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    design = addPlatform(design, { boundary: rectangularBoundary(5000, 0, 3500, 3000), elevationMm: 450 });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'platform', platformId: 'P2' }, fromEdgeId: 'P1-E2', toEdgeId: 'P2-E4', startMm: [4000, 1500], directionDeg: 0, widthMm: 900, riserCount: 3 });
    const framing = generateFramingDesign(design, createSiteModel(property), { municipality: 'Town of Sidney', snowLoadKpa: 1 });
    expect(framing.guards.filter((guard) => guard.platformId === 'P1')).toHaveLength(3);
    expect(framing.guards[0].heightMm).toBe(900);
    expect(framing.stairStringers).toHaveLength(3);
    expect(framing.stairStringers[0]).toMatchObject({ stairId: 'ST1', runMm: 560, riseMm: 450 });
  });

  it('fingerprints structural inputs while ignoring canvas selection and timestamps', () => {
    const design = addPlatform(createEmptyDesign('a'), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    const site = createSiteModel(property);
    const input = { municipality: 'Town of Sidney', snowLoadKpa: 1 };
    const framing = generateFramingDesign(design, site, input);
    const selected = selectDesignObject(design, 'P1', 'later');
    expect(framingInputFingerprint(selected, site, input)).toBe(framing.inputFingerprint);
    expect(isFramingStale(framing, selected, site, input)).toBe(false);
    const changed = { ...selected, platforms: selected.platforms.map((platform) => ({ ...platform, elevationMm: 1200 })) };
    expect(isFramingStale(framing, changed, site, input)).toBe(true);
  });
});

function measuredSite() {
  return updateSiteModel(createSiteModel(property), { status: 'field-input-unverified', measuredBy: 'Homeowner' }, {
    selectionStatus: 'field-measured', lengthMm: 4000, rimMaterial: 'solid-sawn', rimDepthMm: 235, cladding: 'wood-siding', flashingFeasible: 'yes',
  });
}
