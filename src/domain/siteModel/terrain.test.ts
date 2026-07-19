import { describe, expect, it } from 'vitest';
import { addTerrainGradePoint, assessTerrainFieldRecord, createTerrainSurface, recordTerrainFieldSurvey, removeTerrainGradePoint, terrainElevationAt, updateTerrainGradePoint } from './terrain';

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

  it('records a controlled benchmark and grade worksheet and detects later edits', () => {
    let terrain = addTerrainGradePoint(createTerrainSurface(), point(0, 0, 0));
    terrain = addTerrainGradePoint(terrain, point(2000, 0, 100));
    terrain = addTerrainGradePoint(terrain, point(0, 2000, -50));
    const recorded = recordTerrainFieldSurvey(terrain, { id: 'GR-1', recordedBy: 'Homeowner', recordedAt: '2026-07-18', instrument: 'laser-level', benchmarkDescription: 'Mark on concrete foundation beside rear door.', sourceEvidenceIds: [], notes: 'Closed level loop.' });
    expect(recorded.fieldRecord).toMatchObject({ id: 'GR-1', status: 'homeowner-recorded-unverified', points: [{ pointId: 'GP1' }, { pointId: 'GP2' }, { pointId: 'GP3' }] });
    expect(recorded.datum).toMatchObject({ source: 'homeowner-measurement', verificationStatus: 'recorded' });
    expect(recorded.gradePoints.every((gradePoint) => gradePoint.verificationStatus === 'recorded')).toBe(true);
    expect(assessTerrainFieldRecord(recorded)).toMatchObject({ status: 'current-homeowner-unverified', current: true });
    expect(assessTerrainFieldRecord(updateTerrainGradePoint(recorded, 'GP2', { elevationMm: 125 }))).toMatchObject({ status: 'stale', current: false, messages: expect.arrayContaining([expect.stringContaining('GP2 changed')]) });
  });

  it('rejects an incomplete or duplicate grade worksheet', () => {
    let terrain = addTerrainGradePoint(createTerrainSurface(), point(0, 0, 0));
    terrain = addTerrainGradePoint(terrain, point(2000, 0, 100));
    const input = { id: 'GR-1', recordedBy: 'Homeowner', recordedAt: '2026-07-18', instrument: 'laser-level' as const, benchmarkDescription: 'Foundation mark.', sourceEvidenceIds: [], notes: '' };
    expect(() => recordTerrainFieldSurvey(terrain, input)).toThrow(/at least three/);
    terrain = addTerrainGradePoint(terrain, point(2000, 0, 200));
    expect(() => recordTerrainFieldSurvey(terrain, input)).toThrow(/distinct plan coordinate/);
  });
});
