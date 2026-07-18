import makerjs from 'makerjs';
import type { BoundaryAssessment, ClosedBoundary, PointMm } from '../deckDesign/types';

const MIN_EDGE_MM = 100;
const MIN_AREA_SQ_M = .5;

/**
 * CAD adapter v1.
 * Owns low-level Maker.js geometry validation and DXF serialization.
 * It does not own architectural meaning, state, UI, storage, or code policy.
 */
export function assessClosedBoundary(boundary: ClosedBoundary): BoundaryAssessment {
  const vertices = boundary.vertices;
  const errors: string[] = [];
  const warnings: string[] = [];
  const coordinates = vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm]);
  const extents = boundaryExtents(boundary);
  const areaSqM = Math.abs(signedAreaMm2(coordinates)) / 1_000_000;

  if (vertices.length < 3) errors.push('A platform requires at least three boundary vertices.');
  if (new Set(vertices.map((vertex) => `${vertex.xMm}:${vertex.yMm}`)).size !== vertices.length) errors.push('Boundary vertices must be unique.');
  if (areaSqM < MIN_AREA_SQ_M) errors.push(`Platform area must be at least ${MIN_AREA_SQ_M.toFixed(1)} m².`);

  const paths = boundaryPaths(boundary);
  const edges = Object.values(paths);
  edges.forEach((edge, index) => {
    if (makerjs.measure.pathLength(edge) < MIN_EDGE_MM) errors.push(`Boundary edge ${index + 1} is shorter than ${MIN_EDGE_MM} mm.`);
  });
  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      if (adjacent(first, second, edges.length)) continue;
      const intersection = makerjs.path.intersection(edges[first], edges[second]);
      if (intersection?.intersectionPoints.length) errors.push(`Boundary edges ${first + 1} and ${second + 1} cross.`);
    }
  }

  if (coordinates.some((point, index) => {
    const next = coordinates[(index + 1) % coordinates.length];
    return next && point[0] !== next[0] && point[1] !== next[1];
  })) warnings.push('Angled platform edges require a framing solution that supports non-orthogonal geometry.');

  return {
    areaSqM: round(areaSqM, 3),
    widthMm: extents.maxXmm - extents.minXmm,
    depthMm: extents.maxYmm - extents.minYmm,
    ...extents,
    errors: unique(errors),
    warnings,
  };
}

export function boundariesOverlap(first: ClosedBoundary, second: ClosedBoundary): boolean {
  const firstPaths = Object.values(boundaryPaths(first));
  const secondPaths = Object.values(boundaryPaths(second));
  if (firstPaths.some((a) => secondPaths.some((b) => makerjs.path.intersection(a, b)?.intersectionPoints.length))) return true;
  const firstModel = boundaryModel(first);
  const secondModel = boundaryModel(second);
  const a = first.vertices[0];
  const b = second.vertices[0];
  return Boolean(a && makerjs.measure.isPointInsideModel([a.xMm, a.yMm], secondModel))
    || Boolean(b && makerjs.measure.isPointInsideModel([b.xMm, b.yMm], firstModel));
}

export function exportBoundariesDxf(boundaries: Array<{ id: string; boundary: ClosedBoundary; layer: string }>, referenceLines: Array<{ id: string; start: PointMm; end: PointMm; layer: string }> = []): string {
  const models = Object.fromEntries(boundaries.map((entry) => [entry.id, { ...boundaryModel(entry.boundary), layer: entry.layer }]));
  const paths = Object.fromEntries(referenceLines.map((entry) => {
    const path: MakerJs.IPathLine = new makerjs.paths.Line([...entry.start], [...entry.end]);
    path.layer = entry.layer;
    return [entry.id, path];
  }));
  return makerjs.exporter.toDXF({ units: makerjs.unitType.Millimeter, models, paths }, { units: makerjs.unitType.Millimeter });
}

export function boundaryExtents(boundary: ClosedBoundary): { minXmm: number; minYmm: number; maxXmm: number; maxYmm: number } {
  if (!boundary.vertices.length) return { minXmm: 0, minYmm: 0, maxXmm: 0, maxYmm: 0 };
  return boundary.vertices.reduce((value, vertex) => ({
    minXmm: Math.min(value.minXmm, vertex.xMm),
    minYmm: Math.min(value.minYmm, vertex.yMm),
    maxXmm: Math.max(value.maxXmm, vertex.xMm),
    maxYmm: Math.max(value.maxYmm, vertex.yMm),
  }), { minXmm: Infinity, minYmm: Infinity, maxXmm: -Infinity, maxYmm: -Infinity });
}

function boundaryModel(boundary: ClosedBoundary): MakerJs.IModel {
  return { units: makerjs.unitType.Millimeter, paths: boundaryPaths(boundary) };
}

function boundaryPaths(boundary: ClosedBoundary): MakerJs.IPathMap {
  const paths: MakerJs.IPathMap = {};
  boundary.vertices.forEach((start, index) => {
    const end = boundary.vertices[(index + 1) % boundary.vertices.length];
    if (!end) return;
    paths[`E${index + 1}`] = new makerjs.paths.Line([start.xMm, start.yMm], [end.xMm, end.yMm]);
  });
  return paths;
}

function signedAreaMm2(points: PointMm[]): number {
  if (points.length < 3) return 0;
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function adjacent(first: number, second: number, count: number): boolean {
  return second === first + 1 || (first === 0 && second === count - 1);
}

function round(value: number, decimals: number): number { const power = 10 ** decimals; return Math.round(value * power) / power; }
function unique(values: string[]): string[] { return [...new Set(values)]; }
