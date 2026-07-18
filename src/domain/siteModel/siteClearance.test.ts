import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary, suggestPointToPointStair } from '../deckDesign';
import type { FramingDesign } from '../framingDesign';
import type { LocalPropertyGeometry } from './propertyGeometry';
import { calculateSiteClearances } from './siteClearance';

const geometry: LocalPropertyGeometry = { parcel: [[-5000, -5000], [15000, -5000], [15000, 10000], [-5000, 10000], [-5000, -5000]], buildings: [], selectedBuildingId: 'house', selectedEdgeIndex: 0, anchorLengthMm: 10000, alignmentStatus: 'user-selected', exteriorSideSign: 1 };

describe('site clearance dimensions', () => {
  it('reports written offsets from an irregular deck to every reference parcel edge', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    const result = calculateSiteClearances(geometry, design);
    expect(result).toMatchObject({ status: 'reference-only', minimumDistanceMm: 5000, allProposedWorkVerticesInsideReferenceParcel: true });
    expect(result.dimensions.map((item) => item.distanceMm)).toEqual([5000, 11000, 7000, 5000]);
  });

  it('fails visibly when a proposed platform crosses the municipal parcel reference', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(14000, 0, 3000, 3000), elevationMm: 600 });
    expect(calculateSiteClearances(geometry, design)).toMatchObject({ status: 'outside-or-crossing', minimumDistanceMm: 0, allProposedWorkVerticesInsideReferenceParcel: false });
  });

  it('lets a stair or grade landing govern a property-line offset', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'terrain', elevationMm: 0 }, [4000, 1500], [4600, 1500]));
    const result = calculateSiteClearances(geometry, design);
    expect(result.dimensions[1]).toMatchObject({ componentId: 'ST1-GRADE-LANDING', componentKind: 'grade-landing', distanceMm: 9500 });
  });

  it('includes generated footing pad extents in the permit clearance screen', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    const framing = { footings: [{ id: 'P1-F1', postId: 'P1-P1', platformId: 'P1', centerMm: [14900, 1000], widthMm: 400, lengthMm: 400 }] } as unknown as FramingDesign;
    const result = calculateSiteClearances(geometry, design, framing);
    expect(result).toMatchObject({ status: 'outside-or-crossing', minimumDistanceMm: 0, allProposedWorkVerticesInsideReferenceParcel: false });
    expect(result.dimensions[1]).toMatchObject({ componentId: 'P1-F1', componentKind: 'footing', distanceMm: 0 });
  });

  it('does not invent clearances without parcel geometry', () => {
    expect(calculateSiteClearances(null, createEmptyDesign())).toMatchObject({ status: 'unavailable', minimumDistanceMm: null, dimensions: [] });
  });
});
