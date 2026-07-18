import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary } from '../deckDesign';
import { generateFramingDesign } from '../framingDesign';
import { addTerrainGradePoint, createSiteModel } from '../siteModel';
import type { Property } from '../../types';
import { createOrthographicProjection, OrthographicProjectionError, projectionAxisForView } from './orthographicProjection';

const property: Property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] };

describe('orthographic projection v1 public contract', () => {
  it('projects linked platforms, stairs, structure, guards, and grade on one coordinate system', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Upper deck', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 1230 });
    design = addPlatform(design, { name: 'Landing', purpose: 'landing', boundary: rectangularBoundary(0, 3560, 2000, 1200), elevationMm: 450 });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'platform', platformId: 'P2' }, startMm: [1000, 3000], endMm: [1000, 3560], directionDeg: 90, riserCount: 5 });
    let site = createSiteModel(property, new Date('2026-07-18T00:00:00.000Z'));
    site = { ...site, terrain: addTerrainGradePoint(site.terrain, { id: 'GP1', label: 'Yard', xMm: 1000, yMm: 4760, elevationMm: -120, source: 'homeowner-measurement', verificationStatus: 'recorded', notes: '' }) };
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T00:00:00.000Z');
    const view = createOrthographicProjection({ design, site, framing, axis: [0, 1] });

    expect(view.schema).toBe('orthographic-projection/v1');
    expect(view.house).toMatchObject({ maximumProjectionMm: 0, topElevationMm: site.designWall.wallHeightMm });
    expect(view.platforms.map((platform) => [platform.name, platform.minimumProjectionMm, platform.maximumProjectionMm, platform.surfaceElevationMm])).toEqual([
      ['Upper deck', 0, 3000, 1230], ['Landing', 3560, 4760, 450],
    ]);
    expect(view.stairs[0]).toMatchObject({ startProjectionMm: 3000, endProjectionMm: 3560, startElevationMm: 1230, endElevationMm: 450, destinationLabel: 'LANDING' });
    expect(view.posts.length).toBeGreaterThan(0);
    expect(view.footings).toHaveLength(view.posts.length);
    expect(view.guards.length).toBeGreaterThan(0);
    expect(view.gradePoints).toContainEqual({ id: 'GP1', projectionMm: 4760, elevationMm: -120, observed: true });
    expect(view.gradePoints[0].projectionMm).toBe(view.minimumProjectionMm);
  });

  it('keeps height previews and arbitrary edge axes in the same public model', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    const site = createSiteModel(property);
    const axis = projectionAxisForView('edge:P1:1', design);
    const view = createOrthographicProjection({ design, site, axis, elevationOverrides: { P1: 1800 } });
    expect(axis).toEqual([0, 1]);
    expect(view.platforms[0].surfaceElevationMm).toBe(1800);
    expect(() => createOrthographicProjection({ design, site, axis: [0, 0] })).toThrowError(OrthographicProjectionError);
  });
});
