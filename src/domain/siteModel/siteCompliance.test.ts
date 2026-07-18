import { describe, expect, it } from 'vitest';
import { addPlatform, createEmptyDesign, rectangularBoundary } from '../deckDesign';
import type { Property } from '../../types';
import { createSiteModel, updateSiteModel } from './siteModel';
import type { LocalPropertyGeometry } from './propertyGeometry';
import { assessSiteCompliance, polygonUnionAreaMm2 } from './siteCompliance';

const property = { address: null, parcel: { pid: '001', areaSqm: 300 }, buildings: [], zoning: { zone: 'R2', setbacks: { front: 4.5, rear: 4.5, side: 2, exteriorSide: 3 }, maxLotCoverage: 45, maxHeight: 10.5, source: 'test', notes: [] }, buildableEnvelope: null, snowLoad: 1, evidence: [] } as unknown as Property;
const geometry: LocalPropertyGeometry = { parcel: [[-5000, -5000], [15000, -5000], [15000, 10000], [-5000, 10000], [-5000, -5000]], buildings: [{ id: 'house', primary: true, confidence: 'medium', polygon: [[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]] }], selectedBuildingId: 'house', selectedEdgeIndex: 0, anchorLengthMm: 10000, alignmentStatus: 'user-selected', exteriorSideSign: 1 };

describe('site zoning and coverage screen', () => {
  it('names parcel edges from an explicit front line and checks written setbacks', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    const site = updateSiteModel(createSiteModel(property), { yardReference: { schema: 'parcel-yard-reference/v1', status: 'homeowner-selected', frontEdgeIndex: 0, rearEdgeIndex: 2, exteriorSideEdgeIndex: null, selectedBy: 'Owner', selectedAt: '2026-07-18T00:00:00.000Z', notes: '' } });
    const result = assessSiteCompliance(property, geometry, site, design);
    expect(result.setbackStatus).toBe('reference-pass');
    expect(result.setbackChecks.map((check) => [check.yard, check.requiredMm, check.referenceDistanceMm])).toEqual([['front', 4500, 5000], ['interior-side', 2000, 11000], ['rear', 4500, 7000], ['interior-side', 2000, 5000]]);
    expect(result.coverage).toMatchObject({ existingBuildingFootprintSqM: 4, proposedPlatformFootprintSqM: 12, combinedReferenceFootprintSqM: 15, referenceCoveragePercent: 5, status: 'reference-within-limit' });
  });

  it('refuses to name yards when street frontage has not been selected', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    expect(assessSiteCompliance(property, geometry, createSiteModel(property), design)).toMatchObject({ setbackStatus: 'orientation-required', setbackChecks: [] });
  });

  it('calculates union footprint area without double-counting stacked or overlapping platforms', () => {
    expect(polygonUnionAreaMm2([[[0, 0], [4000, 0], [4000, 3000], [0, 3000]], [[2000, 1000], [6000, 1000], [6000, 4000], [2000, 4000]]])).toBe(20_000_000);
  });
});
