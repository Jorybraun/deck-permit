import { describe, expect, it } from 'vitest';
import type { Property } from '../../types';
import { createSiteModel, updateSiteModel } from './siteModel';
import type { LocalPropertyGeometry } from './propertyGeometry';
import { deriveReferenceSetbackGuides } from './setbackGuides';

const property = { address: null, parcel: { pid: '001' }, buildings: [], zoning: { zone: 'R2', setbacks: { front: 4.5, rear: 4.5, side: 2, exteriorSide: 3 }, maxLotCoverage: 45, maxHeight: 10.5, source: 'Town bylaw test', notes: [] }, buildableEnvelope: null, snowLoad: 1, evidence: [] } as unknown as Property;
const geometry: LocalPropertyGeometry = { parcel: [[-5000, -5000], [15000, -5000], [15000, 10000], [-5000, 10000], [-5000, -5000]], buildings: [], selectedBuildingId: 'house', selectedEdgeIndex: 0, anchorLengthMm: 10000, alignmentStatus: 'user-selected', exteriorSideSign: 1 };

describe('named-yard setback guides', () => {
  it('offsets every parcel edge toward the parcel interior using its named requirement', () => {
    const site = updateSiteModel(createSiteModel(property), { yardReference: { schema: 'parcel-yard-reference/v1', status: 'homeowner-selected', frontEdgeIndex: 0, rearEdgeIndex: 2, exteriorSideEdgeIndex: null, selectedBy: 'Owner', selectedAt: '2026-07-18T00:00:00.000Z', notes: '' } });
    const guides = deriveReferenceSetbackGuides(property, geometry, site);
    expect(guides.map((guide) => [guide.yard, guide.requiredMm])).toEqual([['front', 4500], ['interior-side', 2000], ['rear', 4500], ['interior-side', 2000]]);
    expect(guides[0]).toMatchObject({ guideStartMm: [-5000, -500], guideEndMm: [15000, -500], authority: 'recorded-zoning-reference' });
    expect(guides[1]).toMatchObject({ guideStartMm: [13000, -5000], guideEndMm: [13000, 10000] });
    expect(guides[2]).toMatchObject({ guideStartMm: [15000, 5500], guideEndMm: [-5000, 5500] });
    expect(guides[3]).toMatchObject({ guideStartMm: [-3000, 10000], guideEndMm: [-3000, -5000] });
  });

  it('uses the exterior-side requirement only when the homeowner identifies that street side', () => {
    const site = updateSiteModel(createSiteModel(property), { yardReference: { schema: 'parcel-yard-reference/v1', status: 'homeowner-selected', frontEdgeIndex: 0, rearEdgeIndex: 2, exteriorSideEdgeIndex: 1, selectedBy: 'Owner', selectedAt: '2026-07-18T00:00:00.000Z', notes: '' } });
    expect(deriveReferenceSetbackGuides(property, geometry, site)[1]).toMatchObject({ yard: 'exterior-side', requiredMm: 3000, guideStartMm: [12000, -5000] });
  });

  it('draws nothing until front and rear property lines are explicit', () => {
    expect(deriveReferenceSetbackGuides(property, geometry, createSiteModel(property))).toEqual([]);
  });
});
