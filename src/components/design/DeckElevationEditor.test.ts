import { describe, expect, it } from 'vitest';
import { addPlatform, createEmptyDesign, rectangularBoundary } from '../../domain/deckDesign';
import { createSiteModel } from '../../domain/siteModel';
import type { Property } from '../../types';
import { createElevationViewModel } from './DeckElevationEditor';

const emptyProperty: Property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] };

describe('DeckElevationEditor view model', () => {
  it('projects canonical platform levels and preliminary assembly depths into a side view', () => {
    const site = createSiteModel(emptyProperty, new Date('2026-07-18T00:00:00.000Z'));
    let design = addPlatform(createEmptyDesign(), { name: 'Upper', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    design = addPlatform(design, { name: 'Landing', boundary: rectangularBoundary(4000, 1000, 1800, 1200), elevationMm: 450 });

    const model = createElevationViewModel(design, site, [0, 1]);

    expect(model.platforms.map((platform) => platform.elevationMm)).toEqual([900, 450]);
    expect(model.platforms[0]).toMatchObject({ min: 0, max: 3000, joistDepthMm: 184 });
    expect(model.y(900)).toBeLessThan(model.y(450));
    expect(model.groundY - model.y(site.designWall.wallHeightMm)).toBeCloseTo(site.designWall.wallHeightMm * model.elevationScale);
    expect(model.contentHeight - model.groundY).toBeGreaterThanOrEqual(92);
    expect(model.y(site.designWall.wallHeightMm)).toBeCloseTo(62);
  });
});
