import type { TerrainElevationResult, TerrainFieldRecord, TerrainFieldRecordAssessment, TerrainGradePoint, TerrainSurface, TerrainVerificationStatus } from './types';

const EXACT_POINT_TOLERANCE_MM = 25;

export type AddTerrainGradePointInput = Omit<TerrainGradePoint, 'id'> & { id?: string };

export interface RecordTerrainFieldInput {
  id: string;
  recordedBy: string;
  recordedAt: string;
  instrument: TerrainFieldRecord['instrument'];
  benchmarkDescription: string;
  sourceEvidenceIds: string[];
  notes: string;
}

/** Creates an explicit project datum. It remains reference-only until tied to a benchmark. */
export function createTerrainSurface(elevationMm = 0): TerrainSurface {
  return {
    schema: 'terrain-surface/v1',
    datum: { id: 'DATUM-1', label: 'Project datum', elevationMm, source: 'assumed-datum', verificationStatus: 'reference' },
    gradePoints: [],
    fieldRecord: null,
  };
}

/** Records the current datum and grade-point geometry as one traceable field-level worksheet. */
export function recordTerrainFieldSurvey(terrain: TerrainSurface, input: RecordTerrainFieldInput, allowedEvidenceIds: readonly string[] = []): TerrainSurface {
  if (!input.id.trim()) throw new Error('Grade worksheet requires a stable record ID.');
  if (!input.recordedBy.trim()) throw new Error('Identify who measured the local grade.');
  if (!/^\d{4}-\d{2}-\d{2}/.test(input.recordedAt)) throw new Error('Grade worksheet requires a recorded date.');
  if (!['laser-level', 'rotary-laser', 'optical-level', 'total-station'].includes(input.instrument)) throw new Error('Select the field instrument used to measure grade.');
  if (!terrain.datum.label.trim()) throw new Error('Name the project benchmark used for every grade elevation.');
  if (!input.benchmarkDescription.trim()) throw new Error('Describe where the project benchmark can be found in the field.');
  if (terrain.gradePoints.length < 3) throw new Error('Record at least three local grade points before saving the grade worksheet.');
  const coordinateKeys = new Set<string>();
  terrain.gradePoints.forEach((point) => {
    if ([point.xMm, point.yMm, point.elevationMm].some((value) => !Number.isFinite(value))) throw new Error(`${point.id} requires finite X, Y, and elevation values.`);
    const key = `${Math.round(point.xMm)}:${Math.round(point.yMm)}`;
    if (coordinateKeys.has(key)) throw new Error('Every grade point must have a distinct plan coordinate.');
    coordinateKeys.add(key);
  });
  const allowed = new Set(allowedEvidenceIds);
  if (input.sourceEvidenceIds.some((id) => !allowed.has(id))) throw new Error('Every grade-workbook evidence reference must exist in the capture record.');
  const record: TerrainFieldRecord = {
    schema: 'terrain-field-record/v1', id: input.id.trim(), status: 'homeowner-recorded-unverified', recordedBy: input.recordedBy.trim(), recordedAt: input.recordedAt, instrument: input.instrument,
    benchmark: { datumId: 'DATUM-1', label: terrain.datum.label.trim(), elevationMm: Math.round(terrain.datum.elevationMm), description: input.benchmarkDescription.trim() },
    points: terrain.gradePoints.map((point) => ({ pointId: point.id, label: point.label.trim() || point.id, xMm: Math.round(point.xMm), yMm: Math.round(point.yMm), elevationMm: Math.round(point.elevationMm), notes: point.notes.trim() })),
    sourceEvidenceIds: [...new Set(input.sourceEvidenceIds)], notes: input.notes.trim(),
  };
  return {
    ...terrain,
    datum: { ...terrain.datum, label: record.benchmark.label, elevationMm: record.benchmark.elevationMm, source: 'homeowner-measurement', verificationStatus: 'recorded' },
    gradePoints: terrain.gradePoints.map((point) => ({ ...point, label: point.label.trim() || point.id, xMm: Math.round(point.xMm), yMm: Math.round(point.yMm), elevationMm: Math.round(point.elevationMm), source: 'homeowner-measurement', verificationStatus: 'recorded', notes: point.notes.trim() })),
    fieldRecord: record,
  };
}

/** Fails closed whenever the datum or any grade point diverges from its field worksheet. */
export function assessTerrainFieldRecord(terrain: TerrainSurface): TerrainFieldRecordAssessment {
  const record = terrain.fieldRecord;
  if (!record || record.schema !== 'terrain-field-record/v1') return { status: 'missing', current: false, messages: ['No controlled local-grade field worksheet is recorded.'] };
  const messages: string[] = [];
  if (record.benchmark.datumId !== terrain.datum.id || record.benchmark.label !== terrain.datum.label || record.benchmark.elevationMm !== terrain.datum.elevationMm) messages.push('The project benchmark changed after the grade worksheet was recorded.');
  if (terrain.datum.verificationStatus !== 'recorded' && terrain.datum.verificationStatus !== 'professional-verified') messages.push('The project benchmark no longer has recorded measurement status.');
  if (record.points.length !== terrain.gradePoints.length) messages.push('The local grade-point list changed after the worksheet was recorded.');
  const currentById = new Map(terrain.gradePoints.map((point) => [point.id, point]));
  record.points.forEach((measured) => {
    const current = currentById.get(measured.pointId);
    if (!current || current.label !== measured.label || current.xMm !== measured.xMm || current.yMm !== measured.yMm || current.elevationMm !== measured.elevationMm || current.notes !== measured.notes) messages.push(`${measured.pointId} changed after the grade worksheet was recorded.`);
    else if (current.verificationStatus !== 'recorded' && current.verificationStatus !== 'professional-verified') messages.push(`${measured.pointId} no longer has recorded measurement status.`);
  });
  if (messages.length) return { status: 'stale', current: false, messages: [...new Set(messages)] };
  return { status: record.status === 'professional-verified' ? 'current-professional-verified' : 'current-homeowner-unverified', current: true, messages: [record.status === 'professional-verified' ? 'The current grade surface matches the professionally verified field record.' : 'The current grade surface matches the homeowner field worksheet; professional acceptance remains separate.'] };
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
