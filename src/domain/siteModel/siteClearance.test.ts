import { describe, expect, it } from 'vitest';
import { addPlatform, createEmptyDesign, rectangularBoundary } from '../deckDesign';
import type { LocalPropertyGeometry } from './propertyGeometry';
import { calculateSiteClearances } from './siteClearance';

const geometry: LocalPropertyGeometry = { parcel: [[-5000, -5000], [15000, -5000], [15000, 10000], [-5000, 10000], [-5000, -5000]], buildings: [], selectedBuildingId: 'house', selectedEdgeIndex: 0, anchorLengthMm: 10000, alignmentStatus: 'user-selected', exteriorSideSign: 1 };

describe('site clearance dimensions', () => {
  it('reports written offsets from an irregular deck to every reference parcel edge', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    const result = calculateSiteClearances(geometry, design);
    expect(result).toMatchObject({ status: 'reference-only', minimumDistanceMm: 5000, allDeckVerticesInsideReferenceParcel: true });
    expect(result.dimensions.map((item) => item.distanceMm)).toEqual([5000, 11000, 7000, 5000]);
  });

  it('fails visibly when a proposed platform crosses the municipal parcel reference', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(14000, 0, 3000, 3000), elevationMm: 600 });
    expect(calculateSiteClearances(geometry, design)).toMatchObject({ status: 'outside-or-crossing', minimumDistanceMm: 0, allDeckVerticesInsideReferenceParcel: false });
  });

  it('does not invent clearances without parcel geometry', () => {
    expect(calculateSiteClearances(null, createEmptyDesign())).toMatchObject({ status: 'unavailable', minimumDistanceMm: null, dimensions: [] });
  });
});
