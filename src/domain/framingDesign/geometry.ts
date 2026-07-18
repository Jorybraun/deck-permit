import type { ClosedBoundary, DeckPlatform, PointMm } from '../deckDesign';

export interface BoundaryBounds { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number }

export function boundaryBounds(boundary: ClosedBoundary): BoundaryBounds {
  const xs = boundary.vertices.map((vertex) => vertex.xMm); const ys = boundary.vertices.map((vertex) => vertex.yMm);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

export function isAxisAlignedRectangle(boundary: ClosedBoundary): boolean {
  if (boundary.vertices.length !== 4) return false;
  const bounds = boundaryBounds(boundary);
  if (bounds.width < 300 || bounds.height < 300) return false;
  const corners = new Set(boundary.vertices.map((vertex) => `${vertex.xMm},${vertex.yMm}`));
  return [[bounds.minX, bounds.minY], [bounds.maxX, bounds.minY], [bounds.maxX, bounds.maxY], [bounds.minX, bounds.maxY]].every(([x, y]) => corners.has(`${x},${y}`));
}

/** Clips an infinite axis-aligned line to every interior segment of a simple polygon. */
export function clipAxisLine(boundary: ClosedBoundary, axis: 'x' | 'y', coordinate: number): Array<readonly [PointMm, PointMm]> {
  const intersections: number[] = [];
  boundary.vertices.forEach((start, index) => {
    const end = boundary.vertices[(index + 1) % boundary.vertices.length];
    const first = axis === 'y' ? start.xMm : start.yMm;
    const second = axis === 'y' ? end.xMm : end.yMm;
    if (!((first <= coordinate && second > coordinate) || (second <= coordinate && first > coordinate))) return;
    const ratio = (coordinate - first) / (second - first);
    intersections.push(axis === 'y' ? start.yMm + ratio * (end.yMm - start.yMm) : start.xMm + ratio * (end.xMm - start.xMm));
  });
  intersections.sort((left, right) => left - right);
  const segments: Array<readonly [PointMm, PointMm]> = [];
  for (let index = 0; index + 1 < intersections.length; index += 2) {
    const first = Math.round(intersections[index]); const second = Math.round(intersections[index + 1]);
    if (second - first < 50) continue;
    segments.push(axis === 'y' ? [[Math.round(coordinate), first], [Math.round(coordinate), second]] : [[first, Math.round(coordinate)], [second, Math.round(coordinate)]]);
  }
  return segments;
}

export function platformEdgePoints(platform: DeckPlatform, edgeId: string): readonly [PointMm, PointMm] | null {
  const index = platform.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0) return null;
  const start = platform.boundary.vertices[index]; const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
  return [[start.xMm, start.yMm], [end.xMm, end.yMm]];
}

export function lineLength(start: PointMm, end: PointMm): number { return Math.round(Math.hypot(end[0] - start[0], end[1] - start[1])); }

export function stationsAlong(start: PointMm, end: PointMm, maximumSpacingMm: number): PointMm[] {
  const length = lineLength(start, end);
  const bays = Math.max(1, Math.ceil(length / maximumSpacingMm));
  return Array.from({ length: bays + 1 }, (_, index) => [
    Math.round(start[0] + (end[0] - start[0]) * index / bays),
    Math.round(start[1] + (end[1] - start[1]) * index / bays),
  ] as PointMm);
}

export function isHorizontal(start: PointMm, end: PointMm): boolean { return Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]); }
