import type { OrthographicProjection, OrthographicStair } from '../domain/architecturalViews';

export interface OrthographicElevationSvgOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  directionNote: string;
}

/** Renders a canonical orthographic projection without re-deriving project geometry. */
export function renderOrthographicElevationSvg(model: OrthographicProjection, options: OrthographicElevationSvgOptions): string {
  const { x, y, width, height, title, directionNote } = options;
  const left = x + 48;
  const right = x + width - 35;
  const top = y + 52;
  const bottom = y + height - 42;
  const horizontalRange = Math.max(1000, model.maximumProjectionMm - model.minimumProjectionMm);
  const verticalRange = Math.max(1000, model.maximumElevationMm - model.minimumElevationMm);
  const scale = Math.min((right - left) / horizontalRange, (bottom - top) / verticalRange);
  const drawingWidth = horizontalRange * scale;
  const drawingHeight = verticalRange * scale;
  const originX = left + Math.max(0, (right - left - drawingWidth) / 2);
  const originY = bottom - Math.max(0, (bottom - top - drawingHeight) / 2);
  const px = (projectionMm: number) => originX + (projectionMm - model.minimumProjectionMm) * scale;
  const py = (elevationMm: number) => originY - (elevationMm - model.minimumElevationMm) * scale;
  const paperScale = Math.max(1, Math.round((1 / (scale * .254)) / 5) * 5);
  const houseX1 = px(model.house.minimumProjectionMm);
  const houseX2 = px(model.house.maximumProjectionMm);
  const houseWidth = Math.max(8, houseX2 - houseX1);
  const gradePoints = [...model.gradePoints].sort((first, second) => first.projectionMm - second.projectionMm);
  const gradeLine = gradePoints.length > 1
    ? `<polyline points="${gradePoints.map((point) => `${px(point.projectionMm)},${py(point.elevationMm)}`).join(' ')}" class="elevation-grade"/>`
    : gradePoints.map((point) => `<circle cx="${px(point.projectionMm)}" cy="${py(point.elevationMm)}" r="4" class="grade-point"/>`).join('');
  const openings = model.house.openings.map((opening) => `<g><rect x="${px(opening.minimumProjectionMm)}" y="${py(opening.headElevationMm)}" width="${Math.max(6, px(opening.maximumProjectionMm) - px(opening.minimumProjectionMm))}" height="${Math.max(4, py(opening.sillElevationMm) - py(opening.headElevationMm))}" class="elevation-opening"/><text class="elevation-tag" x="${(px(opening.minimumProjectionMm) + px(opening.maximumProjectionMm)) / 2}" y="${py(opening.headElevationMm) - 5}" text-anchor="middle">${opening.kind.toUpperCase()} ${esc(opening.id)}</text></g>`).join('');
  const projectedFootings = groupProjected(model.footings, (footing) => `${Math.round(footing.projectionMm / 25)}:${Math.round(footing.gradeElevationMm / 25)}`);
  const footings = projectedFootings.map(({ item: footing, count }) => {
    const footingWidth = Math.max(12, Math.min(46, footing.widthMm * scale));
    return `<g><rect x="${px(footing.projectionMm) - footingWidth / 2}" y="${py(footing.gradeElevationMm)}" width="${footingWidth}" height="9" class="elevation-footing"/><text class="elevation-id" x="${px(footing.projectionMm)}" y="${py(footing.gradeElevationMm) + 20}" text-anchor="middle">${esc(footing.id)}${count > 1 ? ` · ×${count} IN PROJECTION` : ''}</text></g>`;
  }).join('');
  const projectedPosts = groupProjected(model.posts, (post) => `${post.platformId}:${Math.round(post.projectionMm / 25)}:${Math.round(post.bottomElevationMm / 25)}:${Math.round(post.topElevationMm / 25)}`);
  const posts = projectedPosts.map(({ item: post, count }) => `<g><line x1="${px(post.projectionMm)}" y1="${py(post.topElevationMm)}" x2="${px(post.projectionMm)}" y2="${py(post.bottomElevationMm)}" class="elevation-post"/><text class="elevation-id" x="${px(post.projectionMm) + 6}" y="${(py(post.topElevationMm) + py(post.bottomElevationMm)) / 2}" transform="rotate(-90 ${px(post.projectionMm) + 6} ${(py(post.topElevationMm) + py(post.bottomElevationMm)) / 2})" text-anchor="middle">${esc(post.id)} · ${esc(post.section)}${count > 1 ? ` · ×${count}` : ''}</text></g>`).join('');
  const platforms = model.platforms.map((platform) => {
    const x1 = px(platform.minimumProjectionMm);
    const x2 = px(platform.maximumProjectionMm);
    const surfaceY = py(platform.surfaceElevationMm);
    const deckDepth = Math.max(3, platform.deckingThicknessMm * scale);
    const joistDepth = Math.max(8, platform.joistDepthMm * scale);
    const beamDepth = Math.max(6, platform.beamDepthMm * scale);
    const gradeY = py(platform.localGradeElevationMm);
    return `<g data-platform-id="${esc(platform.id)}"><rect x="${x1}" y="${surfaceY}" width="${Math.max(5, x2 - x1)}" height="${deckDepth}" class="elevation-decking"/><rect x="${x1}" y="${surfaceY + deckDepth}" width="${Math.max(5, x2 - x1)}" height="${joistDepth}" class="elevation-joist"/><line x1="${x1}" y1="${surfaceY + deckDepth + joistDepth + beamDepth / 2}" x2="${x2}" y2="${surfaceY + deckDepth + joistDepth + beamDepth / 2}" class="elevation-beam"/><text class="elevation-platform-label" x="${(x1 + x2) / 2}" y="${surfaceY - 11}" text-anchor="middle">${esc(platform.name.toUpperCase())} · TOP EL. ${platform.surfaceElevationMm}</text><text class="elevation-id" x="${(x1 + x2) / 2}" y="${surfaceY + deckDepth + joistDepth / 2 + 3}" text-anchor="middle">${esc(platform.joistLabel)}</text>${verticalDimension(x1 - 18, surfaceY, gradeY, `${platform.surfaceElevationMm - platform.localGradeElevationMm}`)}</g>`;
  }).join('');
  const guards = model.guards.map((guard) => {
    const x1 = px(guard.minimumProjectionMm);
    const x2 = px(guard.maximumProjectionMm);
    const base = py(guard.baseElevationMm);
    const rail = py(guard.topElevationMm);
    if (Math.abs(x2 - x1) < 5) return `<g><line x1="${x1}" y1="${base}" x2="${x1}" y2="${rail}" class="elevation-guard"/><circle cx="${x1}" cy="${rail}" r="3" class="guard-cap"/></g>`;
    return `<g><line x1="${x1}" y1="${base}" x2="${x1}" y2="${rail}" class="elevation-guard"/><line x1="${x2}" y1="${base}" x2="${x2}" y2="${rail}" class="elevation-guard"/><line x1="${x1}" y1="${rail}" x2="${x2}" y2="${rail}" class="elevation-guard"/><text class="elevation-id" x="${(x1 + x2) / 2}" y="${rail - 5}" text-anchor="middle">${esc(guard.system.toUpperCase())} · ${guard.topElevationMm - guard.baseElevationMm}</text></g>`;
  }).join('');
  const stairs = model.stairs.map((stair) => stairSvg(stair, px, py)).join('');
  const observed = gradePoints.filter((point) => point.observed).map((point) => `<g><circle cx="${px(point.projectionMm)}" cy="${py(point.elevationMm)}" r="3.5" class="grade-point"/><text class="elevation-id" x="${px(point.projectionMm) + 6}" y="${py(point.elevationMm) - 5}">${esc(point.id)} · EL. ${point.elevationMm}</text></g>`).join('');
  return `<g class="orthographic-elevation"><rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel"/><text class="view-title" x="${x + 18}" y="${y + 25}">${esc(title)}</text><text class="tiny" x="${x + width - 18}" y="${y + 25}" text-anchor="end">${esc(directionNote)} · APPROX. 1:${paperScale}</text><rect x="${houseX1}" y="${py(model.house.topElevationMm)}" width="${houseWidth}" height="${py(model.house.baseElevationMm) - py(model.house.topElevationMm)}" class="elevation-house"/><text class="elevation-house-label" x="${houseX1 + houseWidth / 2}" y="${py(model.house.topElevationMm) + 17}" text-anchor="middle">EXISTING HOUSE / SELECTED WALL</text>${openings}${gradeLine}${footings}${posts}${platforms}${guards}${stairs}${observed}<line x1="${originX}" y1="${originY}" x2="${originX + Math.min(1000 * scale, right - originX)}" y2="${originY}" class="scale-bar"/><text class="elevation-id" x="${originX}" y="${originY + 13}">1000 mm MODEL SCALE · WRITTEN ELEVATIONS GOVERN</text></g>`;
}

function stairSvg(stair: OrthographicStair, px: (value: number) => number, py: (value: number) => number): string {
  const x1 = px(stair.startProjectionMm);
  const x2 = px(stair.endProjectionMm);
  const y1 = py(stair.startElevationMm);
  const y2 = py(stair.endElevationMm);
  const horizontal = Math.abs(x2 - x1);
  if (horizontal < 8) return `<g data-stair-id="${esc(stair.id)}"><line x1="${x1 - 5}" y1="${y1}" x2="${x2 - 5}" y2="${y2}" class="elevation-stair"/><line x1="${x1 + 5}" y1="${y1}" x2="${x2 + 5}" y2="${y2}" class="elevation-stair"/><text class="elevation-tag" x="${x1 + 10}" y="${(y1 + y2) / 2}">${esc(stair.name.toUpperCase())} · END VIEW · ${stair.widthMm} WIDE</text></g>`;
  const risers = Math.max(1, stair.riserCount);
  const treadCount = Math.max(1, risers - 1);
  const points: Array<[number, number]> = [[x1, y1]];
  for (let index = 1; index <= risers; index += 1) {
    const fractionY = index / risers;
    const previousX = x1 + (x2 - x1) * Math.min(index - 1, treadCount) / treadCount;
    const nextX = x1 + (x2 - x1) * Math.min(index, treadCount) / treadCount;
    const nextY = y1 + (y2 - y1) * fractionY;
    points.push([previousX, nextY], [nextX, nextY]);
  }
  const railOffset = stair.handrailSides === 'none' ? 0 : 900;
  const rail = stair.handrailSides === 'none' ? '' : `<line x1="${x1}" y1="${py(stair.startElevationMm + railOffset)}" x2="${x2}" y2="${py(stair.endElevationMm + railOffset)}" class="elevation-guard"/>`;
  return `<g data-stair-id="${esc(stair.id)}"><polyline points="${points.map((point) => point.join(',')).join(' ')}" class="elevation-stair"/>${rail}<circle cx="${x1}" cy="${y1}" r="5" class="stair-endpoint"/><circle cx="${x2}" cy="${y2}" r="5" class="stair-endpoint"/><text class="elevation-tag" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle">${esc(stair.name.toUpperCase())} · ${stair.riserCount}R @ ${stair.riserHeightMm} · B → ${esc(stair.destinationLabel)}</text></g>`;
}

function verticalDimension(x: number, y1: number, y2: number, label: string): string {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="dimension"/><line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" class="dimension"/><line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" class="dimension"/><text class="dimension-text" x="${x - 5}" y="${(y1 + y2) / 2}" text-anchor="middle" transform="rotate(-90 ${x - 5} ${(y1 + y2) / 2})">${esc(label)} mm</text>`;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] || character);
}

function groupProjected<T>(items: readonly T[], keyFor: (item: T) => string): Array<{ item: T; count: number }> {
  const groups = new Map<string, { item: T; count: number }>();
  items.forEach((item) => {
    const key = keyFor(item);
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { item, count: 1 });
  });
  return [...groups.values()];
}
