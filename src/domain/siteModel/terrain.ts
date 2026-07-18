import type { TerrainElevationResult, TerrainGradePoint, TerrainSurface, TerrainVerificationStatus } from './types';

const EXACT_POINT_TOLERANCE_MM = 25;

export type AddTerrainGradePointInput = Omit<TerrainGradePoint, 'id'> & { id?: string };

/** Creates an explicit project datum. It remains reference-only until tied to a benchmark. */
export function createTerrainSurface(elevationMm = 0): TerrainSurface {
  return {
    schema: 'terrain-surface/v1',
    datum: { id: 'DATUM-1', label: 'Project datum', elevationMm, source: 'assumed-datum', verificationStatus: 'reference' },
    gradePoints: [],
  };
}

export function addTerrainGradePoint(terrain: TerrainSurface, input: AddTerrainGradePointInput): TerrainSurface {
  const id = input.id?.trim() || nextPointId(terrain.gradePoints);
  if (terrain.gradePoints.some((point) => point.id === id)) throw new Error(`Grade point ${id} already exists.`);
  return { ...terrain, gradePoints: [...terrain.gradePoints, normalizePoint({ ...input, id })] };
}

export function updateTerrainGradePoint(terrain: TerrainSurface, pointId: string, changes: Partial<Omit<TerrainGradePoint, 'id'>>): TerrainSurface {
  if (!terrain.gradePoints.some((point) => point.id === pointId)) throw new Error(`Grade point ${pointId} was not found.`);
  return { ...terrain, gradePoints: terrain.gradePoints.map((point) => point.id === pointId ? normalizePoint({ ...point, ...changes }) : point) };
}

export function removeTerrainGradePoint(terrain: TerrainSurface, pointId: string): TerrainSurface {
  return { ...terrain, gradePoints: terrain.gradePoints.filter((point) => point.id !== pointId) };
}

/**
 * Returns traceable local grade. Exact observations win; other coordinates use inverse-distance
 * weighting from the nearest four observations and remain labelled as interpolation.
 */
export function terrainElevationAt(terrain: TerrainSurface, pointMm: readonly [number, number]): TerrainElevationResult {
  if (!terrain.gradePoints.length) return {
    elevationMm: terrain.datum.elevationMm, method: 'datum', sourcePointIds: [], nearestDistanceMm: null,
    verificationStatus: terrain.datum.verificationStatus,
  };
  const ranked = terrain.gradePoints
    .map((point) => ({ point, distanceMm: Math.hypot(point.xMm - pointMm[0], point.yMm - pointMm[1]) }))
    .sort((left, right) => left.distanceMm - right.distanceMm);
  const nearest = ranked[0];
  if (nearest.distanceMm <= EXACT_POINT_TOLERANCE_MM) return {
    elevationMm: nearest.point.elevationMm, method: 'observed', sourcePointIds: [nearest.point.id],
    nearestDistanceMm: Math.round(nearest.distanceMm), verificationStatus: nearest.point.verificationStatus,
  };
  const contributors = ranked.slice(0, 4);
  const weighted = contributors.reduce((result, item) => {
    const weight = 1 / Math.max(1, item.distanceMm) ** 2;
    return { elevation: result.elevation + item.point.elevationMm * weight, weight: result.weight + weight };
  }, { elevation: 0, weight: 0 });
  return {
    elevationMm: Math.round(weighted.elevation / weighted.weight), method: 'interpolated',
    sourcePointIds: contributors.map((item) => item.point.id), nearestDistanceMm: Math.round(nearest.distanceMm),
    verificationStatus: weakestStatus(contributors.map((item) => item.point.verificationStatus)),
  };
}

function normalizePoint(point: TerrainGradePoint): TerrainGradePoint {
  if ([point.xMm, point.yMm, point.elevationMm].some((value) => !Number.isFinite(value))) throw new Error('Grade point coordinates and elevation must be finite numbers.');
  return { ...point, label: point.label.trim() || point.id, notes: point.notes.trim() };
}

function nextPointId(points: TerrainGradePoint[]): string {
  let index = 1;
  while (points.some((point) => point.id === `GP${index}`)) index += 1;
  return `GP${index}`;
}

function weakestStatus(statuses: TerrainVerificationStatus[]): TerrainVerificationStatus {
  if (statuses.includes('reference')) return 'reference';
  if (statuses.includes('recorded')) return 'recorded';
  return 'professional-verified';
}
