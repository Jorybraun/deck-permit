import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary, selectDesignObject, setPlatformFramingIntent } from '../deckDesign';
import { addTerrainGradePoint, createSiteModel, recordExistingConditionFieldSurvey, updateSiteModel } from '../siteModel';
import type { Property } from '../../types';
import { framingInputFingerprint, generateFramingDesign, isFramingStale } from './framingDesign';

const property: Property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] };

describe('FramingDesign v2 public contract', () => {
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
    expect(framing.connections.map((connection) => connection.kind)).toEqual(['ledger-to-house', 'joist-to-ledger', 'joist-to-beam', 'beam-to-post', 'post-to-footing', 'guard-to-frame']);
    expect(framing.connections.every((connection) => connection.status === 'design-required' && connection.hardware.product === null && connection.hardware.fastenerSchedule === null)).toBe(true);
    expect(framing.connections.find((connection) => connection.kind === 'joist-to-ledger')).toMatchObject({ actionScope: 'each', designActionKn: expect.any(Number) });
    expect(framing.connections.find((connection) => connection.kind === 'beam-to-post')!.designActionKn).toBeGreaterThan(0);
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
    design = addPlatform(design, { boundary: rectangularBoundary(4560, 0, 3500, 3000), elevationMm: 450 });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'platform', platformId: 'P2' }, fromEdgeId: 'P1-E2', toEdgeId: 'P2-E4', startMm: [4000, 1500], directionDeg: 0, widthMm: 900, riserCount: 3 });
    const framing = generateFramingDesign(design, createSiteModel(property), { municipality: 'Town of Sidney', snowLoadKpa: 1 });
    expect(framing.guards.filter((guard) => guard.platformId === 'P1')).toHaveLength(3);
    expect(framing.guards[0].heightMm).toBe(900);
    expect(framing.stairStringers).toHaveLength(3);
    expect(framing.stairStringers[0]).toMatchObject({ stairId: 'ST1', runMm: 560, riseMm: 450 });
    expect(framing.stairStringers[0].endMm[0] - framing.stairStringers[0].startMm[0]).toBe(560);
    expect(framing.stairOpenings).toHaveLength(2);
    expect(framing.stairTrimmers).toHaveLength(4);
    expect(framing.stairConnections).toHaveLength(2);
    expect(framing.stairConnections.map((connection) => connection.connectionType)).toEqual(['stringer-to-header', 'stringer-to-landing-edge']);
    expect(framing.connections.filter((connection) => connection.kind === 'stair-to-support')).toHaveLength(2);
    expect(framing.connections.filter((connection) => connection.kind === 'stair-to-support').every((connection) => connection.quantity === 3 && connection.designActionKn === null)).toBe(true);
    expect(framing.stairOpenings[0]).toMatchObject({ stairId: 'ST1', endpoint: 'from', clearWidthMm: 900, projectedWidthMm: 900, skewDeg: 0, headerSection: 'Engineer design' });
    expect(framing.checks.find((check) => check.id === 'stair-connections')).toMatchObject({ status: 'review' });
  });

  it('creates a grade-bearing endpoint without inventing a platform header', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'terrain', elevationMm: 0 }, fromEdgeId: 'P1-E2', startMm: [4000, 1500], directionDeg: 0, widthMm: 900 });
    const framing = generateFramingDesign(design, createSiteModel(property), { municipality: 'Town of Sidney', snowLoadKpa: 1 });

    expect(framing.stairOpenings).toHaveLength(1);
    expect(framing.stairTrimmers).toHaveLength(2);
    expect(framing.stairConnections[1]).toMatchObject({ endpoint: 'to', hostKind: 'terrain', connectionType: 'stringer-to-grade-landing', elevationMm: 0, receivingMemberIds: [] });
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
    const openingChanged = updateSiteModel(site, {}, { openings: [{ id: 'W1', kind: 'window', offsetMm: 600, widthMm: 1200, sillHeightMm: 900, heightMm: 1200, evidenceStatus: 'field-measured' }] });
    expect(isFramingStale(framing, selected, openingChanged, input)).toBe(true);
  });

  it('derives each post height from local observed grade instead of one global ground value', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 1200, houseEdgeIndex: 0 });
    design = setPlatformFramingIntent(design, 'P1', { supportStrategy: 'ledger', joistSpacingMm: 400 });
    const flatSite = measuredSite();
    const firstPass = generateFramingDesign(design, flatSite, { municipality: 'Town of Sidney', snowLoadKpa: 1 });
    const low = firstPass.posts[0].pointMm;
    const high = firstPass.posts[firstPass.posts.length - 1].pointMm;
    let terrain = addTerrainGradePoint(flatSite.terrain, { label: 'Low grade', xMm: low[0], yMm: low[1], elevationMm: 0, source: 'homeowner-measurement', verificationStatus: 'recorded', notes: '' });
    terrain = addTerrainGradePoint(terrain, { label: 'High grade', xMm: high[0], yMm: high[1], elevationMm: 300, source: 'homeowner-measurement', verificationStatus: 'recorded', notes: '' });
    const slopedSite = updateSiteModel(flatSite, { terrain });
    const framing = generateFramingDesign(design, slopedSite, { municipality: 'Town of Sidney', snowLoadKpa: 1 });
    expect(framing.posts[0].heightMm).toBe(1200);
    expect(framing.posts[framing.posts.length - 1].heightMm).toBe(900);
    expect(framing.inputFingerprint).not.toBe(firstPass.inputFingerprint);
  });

  it('does not close field verification from labels alone and requires a current worksheet plus grade observations', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    const labeledOnly = updateSiteModel(createSiteModel(property), {}, { selectionStatus: 'field-measured', lengthMm: 4000 });
    expect(generateFramingDesign(design, labeledOnly, { municipality: 'Town of Sidney', snowLoadKpa: 1 }).reviewGates.find((gate) => gate.id === 'field-geometry')).toMatchObject({ status: 'required', reason: expect.stringContaining('No controlled') });

    const surveyed = measuredSite();
    let terrain = addTerrainGradePoint(surveyed.terrain, { label: 'G1', xMm: 0, yMm: 0, elevationMm: 0, source: 'homeowner-measurement', verificationStatus: 'recorded', notes: '' });
    terrain = addTerrainGradePoint(terrain, { label: 'G2', xMm: 2000, yMm: 0, elevationMm: 20, source: 'homeowner-measurement', verificationStatus: 'recorded', notes: '' });
    terrain = addTerrainGradePoint(terrain, { label: 'G3', xMm: 4000, yMm: 0, elevationMm: 40, source: 'homeowner-measurement', verificationStatus: 'recorded', notes: '' });
    const complete = updateSiteModel(surveyed, { terrain });
    expect(generateFramingDesign(design, complete, { municipality: 'Town of Sidney', snowLoadKpa: 1 }).reviewGates.find((gate) => gate.id === 'field-geometry')).toMatchObject({ status: 'not-required', reason: expect.stringContaining('controlled field worksheet') });
  });
});

function measuredSite() {
  const provisional = updateSiteModel(createSiteModel(property), { status: 'field-input-unverified', measuredBy: 'Homeowner' }, {
    selectionStatus: 'field-measured', lengthMm: 4000, rimMaterial: 'solid-sawn', rimDepthMm: 235, cladding: 'wood-siding', flashingFeasible: 'yes',
  });
  return recordExistingConditionFieldSurvey(provisional, { id: 'FS-TEST', recordedBy: 'Homeowner', recordedAt: '2026-07-18', instrument: 'tape-measure', wallLengthMm: 4000, wallHeightMm: provisional.designWall.wallHeightMm, houseDepthMm: provisional.houseDepthMm, openings: [], sourceEvidenceIds: [], notes: 'Test field worksheet.' });
}
