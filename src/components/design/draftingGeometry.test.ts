import { describe, expect, it } from 'vitest';
import { constrainDraftPoint, formatAngle, interiorAngleDeg, lineAngleDeg, snapDraggedVertex, snapPointToAngle, snapPointToSmartGuides } from './draftingGeometry';

const square = [
  { id: 'a', xMm: 0, yMm: 0 },
  { id: 'b', xMm: 4000, yMm: 0 },
  { id: 'c', xMm: 4000, yMm: 3000 },
  { id: 'd', xMm: 0, yMm: 3000 },
];

describe('drafting geometry', () => {
  it('snaps a drawn segment to the nearest natural 15 degree angle', () => {
    const point = snapPointToAngle([982, 305], [0, 0]);
    expect(lineAngleDeg([0, 0], point)).toBeCloseTo(15, 1);
    expect(Math.hypot(...point)).toBeCloseTo(Math.hypot(982, 305), 0);
  });

  it('allows angle snapping to be bypassed', () => {
    expect(constrainDraftPoint([982, 305], [[0, 0]], false)).toEqual([982, 305]);
  });

  it('snaps a moved vertex against its nearest adjoining edge', () => {
    const point = snapDraggedVertex([3900, 240], square, 1, true);
    expect(lineAngleDeg([4000, 3000], point)).toBeCloseTo(90, 1);
  });

  it('reports line bearings and both convex and concave interior angles', () => {
    expect(lineAngleDeg([0, 0], [0, 1000])).toBe(90);
    expect(interiorAngleDeg(square, 0)).toBeCloseTo(90);
    const concave = [square[0], square[1], square[2], { id: 'top-in', xMm: 2000, yMm: 3000 }, { id: 'in', xMm: 2000, yMm: 1500 }, { id: 'left-in', xMm: 0, yMm: 1500 }];
    expect(interiorAngleDeg(concave, 4)).toBeCloseTo(270);
    expect(formatAngle(89.96)).toBe('90°');
  });

  it('snaps independently to nearby horizontal and vertical node axes', () => {
    const result = snapPointToSmartGuides([2960, 80], [
      { id: 'a', label: 'Platform 1 corner 1', point: [0, 0] },
      { id: 'b', label: 'Platform 2 corner 3', point: [3000, 2000] },
    ], 100);
    expect(result.point).toEqual([3000, 0]);
    expect(result.guides.map((guide) => [guide.axis, guide.reference.id])).toEqual([['x', 'b'], ['y', 'a']]);
    expect(result.nearest?.id).toBe('b');
  });

  it('keeps the free point while still returning the nearest ruler reference', () => {
    const result = snapPointToSmartGuides([1800, 1200], [{ id: 'a', label: 'Corner A', point: [0, 0] }], -1);
    expect(result.point).toEqual([1800, 1200]);
    expect(result.guides).toEqual([]);
    expect(result.nearest?.id).toBe('a');
  });
});
