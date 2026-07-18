import { describe, expect, it } from 'vitest';
import { addTerrainGradePoint, createTerrainSurface, removeTerrainGradePoint, terrainElevationAt, updateTerrainGradePoint } from './terrain';

const point = (xMm: number, yMm: number, elevationMm: number) => ({
  label: 'Measured grade', xMm, yMm, elevationMm,
  source: 'homeowner-measurement' as const, verificationStatus: 'recorded' as const, notes: '',
});

describe('TerrainSurface public contract', () => {
  it('falls back to an explicit reference datum when no observations exist', () => {
    expect(terrainElevationAt(createTerrainSurface(125), [4000, 2000])).toEqual({
      elevationMm: 125, method: 'datum', sourcePointIds: [], nearestDistanceMm: null, verificationStatus: 'reference',
    });
  });

  it('owns add, update, and remove operations with stable grade point ids', () => {
    let terrain = addTerrainGradePoint(createTerrainSurface(), point(0, 0, 100));
    expect(terrain.gradePoints[0]).toMatchObject({ id: 'GP1', elevationMm: 100 });
    terrain = updateTerrainGradePoint(terrain, 'GP1', { elevationMm: 175, notes: 'Laser level' });
    expect(terrain.gradePoints[0]).toMatchObject({ elevationMm: 175, notes: 'Laser level' });
    expect(removeTerrainGradePoint(terrain, 'GP1').gradePoints).toEqual([]);
  });

  it('returns exact observed elevations and traceable interpolation between observations', () => {
    let terrain = addTerrainGradePoint(createTerrainSurface(), point(0, 0, 0));
    terrain = addTerrainGradePoint(terrain, point(2000, 0, 200));
    expect(terrainElevationAt(terrain, [0, 0])).toMatchObject({ elevationMm: 0, method: 'observed', sourcePointIds: ['GP1'] });
    expect(terrainElevationAt(terrain, [1000, 0])).toMatchObject({ elevationMm: 100, method: 'interpolated', sourcePointIds: ['GP1', 'GP2'] });
  });
});
