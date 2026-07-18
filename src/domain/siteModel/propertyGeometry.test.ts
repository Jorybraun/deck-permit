import { describe, expect, it } from 'vitest';
import type { Property } from '../../types';
import { createSiteModel, flipHouseWallDirection, rotateHouseWallAlignment } from './siteModel';
import { projectPropertyToLocal, selectHouseWall } from './propertyGeometry';

const property: Property = {
  address: null,
  parcel: {
    pid: 'test', pidRaw: 'test', parcelName: 'Test parcel', planNumber: '', municipality: 'Test', ownerType: '', parcelClass: '', areaSqm: 800,
    polygon: [[-123.001, 49], [-122.999, 49], [-122.999, 49.001], [-123.001, 49.001], [-123.001, 49]], center: [-123, 49.0005], geometrySource: 'live',
  },
  buildings: [{ id: 'house', primary: true, areaSqm: 100, kind: 'building-footprint', sourceId: 'test', confidence: 'medium', polygon: [[-123.0002, 49.0002], [-122.9998, 49.0002], [-122.9998, 49.0003], [-123.0002, 49.0003], [-123.0002, 49.0002]] }],
  zoning: null, buildableEnvelope: null, snowLoad: 1, evidence: [], existingConditions: null,
};

describe('property-to-deck alignment', () => {
  it('shows the parcel using an honest provisional house edge before selection', () => {
    const site = createSiteModel(property);
    const geometry = projectPropertyToLocal(property, site);
    expect(geometry).not.toBeNull();
    expect(geometry).toMatchObject({ selectedBuildingId: 'house', alignmentStatus: 'provisional' });
    expect(geometry!.parcel.length).toBe(5);
    expect(geometry!.anchorLengthMm).toBeGreaterThan(20_000);
  });

  it('switches the same property context to an explicit homeowner-selected edge', () => {
    const site = selectHouseWall(createSiteModel(property), property, 'house', 0);
    const geometry = projectPropertyToLocal(property, site);
    expect(geometry).toMatchObject({ selectedBuildingId: 'house', selectedEdgeIndex: 0, alignmentStatus: 'user-selected' });
  });

  it('can mirror or rotate GIS context without changing the source property or deck geometry', () => {
    const site = createSiteModel(property);
    const original = projectPropertyToLocal(property, site)!;
    const mirrored = projectPropertyToLocal(property, flipHouseWallDirection(site))!;
    const rotated = projectPropertyToLocal(property, rotateHouseWallAlignment(site))!;
    expect(mirrored.parcel[0][0]).toBeCloseTo(original.anchorLengthMm - original.parcel[0][0], -1);
    expect(mirrored.parcel[0][1]).toBeCloseTo(original.parcel[0][1], -1);
    expect(rotated.parcel[0][0]).toBeCloseTo(original.anchorLengthMm - original.parcel[0][0], -1);
    expect(rotated.parcel[0][1]).toBeCloseTo(-original.parcel[0][1], -1);
    expect(rotated.exteriorSideSign).toBe(-1);
    expect(property.parcel!.polygon[0]).toEqual([-123.001, 49]);
  });

  it('preserves a confirmed orientation when the homeowner selects a better house edge', () => {
    const corrected = rotateHouseWallAlignment(createSiteModel(property));
    const selected = selectHouseWall(corrected, property, 'house', 0);
    expect(selected.designWall).toMatchObject({ reverseDirection: true, invertOutward: true, sourceEdgeIndex: 0 });
  });
});
