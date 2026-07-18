import type { BoundaryVertex, PointMm } from '../../domain/deckDesign';

export const ANGLE_SNAP_DEG = 15;

export interface SmartGuideReference {
  id: string;
  label: string;
  point: PointMm;
}

export interface SmartAlignmentGuide {
  axis: 'x' | 'y';
  reference: SmartGuideReference;
}

export interface SmartGuideResult {
  point: PointMm;
  guides: SmartAlignmentGuide[];
  nearest: SmartGuideReference | null;
}

export function snapPointToAngle(point: PointMm, anchor: PointMm, incrementDeg = ANGLE_SNAP_DEG): PointMm {
  const dx = point[0] - anchor[0];
  const dy = point[1] - anchor[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return point;
  const angle = Math.atan2(dy, dx);
  const increment = incrementDeg * Math.PI / 180;
  const snappedAngle = Math.round(angle / increment) * increment;
  return [Math.round(anchor[0] + Math.cos(snappedAngle) * length), Math.round(anchor[1] + Math.sin(snappedAngle) * length)];
}

export function constrainDraftPoint(point: PointMm, draft: PointMm[], enabled: boolean): PointMm {
  const previous = draft[draft.length - 1];
  return previous && enabled ? snapPointToAngle(point, previous) : point;
}

export function snapDraggedVertex(point: PointMm, vertices: BoundaryVertex[], index: number, enabled: boolean): PointMm {
  if (!enabled || vertices.length < 3) return point;
  const previous = vertices[(index - 1 + vertices.length) % vertices.length];
  const next = vertices[(index + 1) % vertices.length];
  const candidates = [
    snapPointToAngle(point, [previous.xMm, previous.yMm]),
    snapPointToAngle(point, [next.xMm, next.yMm]),
  ];
  return candidates.reduce((closest, candidate) => distance(candidate, point) < distance(closest, point) ? candidate : closest);
}

/** Snaps a moving node to nearby node axes while retaining the nearest reference for live rulers. */
export function snapPointToSmartGuides(point: PointMm, references: SmartGuideReference[], toleranceMm: number): SmartGuideResult {
  if (!references.length) return { point, guides: [], nearest: null };
  const closestX = references.reduce((closest, reference) => Math.abs(reference.point[0] - point[0]) < Math.abs(closest.point[0] - point[0]) ? reference : closest);
  const closestY = references.reduce((closest, reference) => Math.abs(reference.point[1] - point[1]) < Math.abs(closest.point[1] - point[1]) ? reference : closest);
  const alignX = Math.abs(closestX.point[0] - point[0]) <= toleranceMm;
  const alignY = Math.abs(closestY.point[1] - point[1]) <= toleranceMm;
  const snapped: PointMm = [alignX ? closestX.point[0] : point[0], alignY ? closestY.point[1] : point[1]];
  const guides: SmartAlignmentGuide[] = [
    ...(alignX ? [{ axis: 'x' as const, reference: closestX }] : []),
    ...(alignY ? [{ axis: 'y' as const, reference: closestY }] : []),
  ];
  const nearest = references.reduce((closest, reference) => distance(reference.point, snapped) < distance(closest.point, snapped) ? reference : closest);
  return { point: snapped, guides, nearest };
}

export function lineAngleDeg(start: PointMm, end: PointMm): number {
  let angle = Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI;
  angle = ((angle % 180) + 180) % 180;
  return Math.abs(angle - 180) < .05 ? 0 : angle;
}

export function interiorAngleDeg(vertices: BoundaryVertex[], index: number): number {
  if (vertices.length < 3) return 0;
  const current = vertices[index];
  const previous = vertices[(index - 1 + vertices.length) % vertices.length];
  const next = vertices[(index + 1) % vertices.length];
  const first: PointMm = [previous.xMm - current.xMm, previous.yMm - current.yMm];
  const second: PointMm = [next.xMm - current.xMm, next.yMm - current.yMm];
  const denominator = Math.hypot(...first) * Math.hypot(...second);
  if (denominator === 0) return 0;
  const smaller = Math.acos(Math.max(-1, Math.min(1, (first[0] * second[0] + first[1] * second[1]) / denominator))) * 180 / Math.PI;
  const cross = first[0] * second[1] - first[1] * second[0];
  const signedArea = vertices.reduce((sum, vertex, vertexIndex) => {
    const following = vertices[(vertexIndex + 1) % vertices.length];
    return sum + vertex.xMm * following.yMm - following.xMm * vertex.yMm;
  }, 0) / 2;
  return cross * signedArea > 0 ? 360 - smaller : smaller;
}

export function formatAngle(degrees: number): string {
  const rounded = Math.round(degrees * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}°`;
}

function distance(first: PointMm, second: PointMm): number {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}
