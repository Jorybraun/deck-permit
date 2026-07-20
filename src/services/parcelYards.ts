import type { LatLng } from '../types';
import type { SiteModel } from '../domain/siteModel';

/**
 * Yard-orientation geometry helpers, shared by the auto road-guess (App) and the
 * tap-to-set-frontage interaction (PropertyStage). All classification is derived from a
 * SINGLE parcel ring — the one actually drawn — so front and rear are always genuine
 * opposite edges, and setbacks land on the right sides regardless of how the parcel
 * geometry was fetched.
 */

/** Open a possibly-closed coordinate ring (drop the duplicate closing vertex). */
export function openParcelRing(ring: LatLng[]): LatLng[] {
  return ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
}

function midpoint(ring: LatLng[], index: number): LatLng {
  const a = ring[index];
  const b = ring[(index + 1) % ring.length];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Index of the parcel edge that a target point lies on (nearest by perpendicular distance
 * to the edge segment, not midpoint-to-midpoint). This matches a physical line correctly
 * even when this ring's vertices are decomposed differently from the source of the point.
 */
export function nearestEdgeIndex(ring: LatLng[], target: { lng: number; lat: number } | null): number | null {
  if (!target || ring.length < 3) return null;
  const kx = Math.cos((target.lat * Math.PI) / 180); // shrink longitude so distances are metric-ish
  const px = target.lng * kx, py = target.lat;
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const d = pointToSegment(px, py, a[0] * kx, a[1], b[0] * kx, b[1]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function pointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The rear edge for a given front: the substantial edge that runs PARALLEL to the front
 * (the opposite side of the lot), tie-broken by distance. Using parallelism — not just the
 * farthest midpoint — keeps the rear on the true opposite side even on long, narrow lots
 * where an adjacent corner can be farther away than the parallel back line.
 */
export function oppositeEdgeIndex(ring: LatLng[], frontIndex: number, lat: number): number | null {
  if (ring.length < 3 || frontIndex < 0 || frontIndex >= ring.length) return null;
  const metresPerLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const vec = (i: number): [number, number] => { const a = ring[i], b = ring[(i + 1) % ring.length]; return [(b[0] - a[0]) * metresPerLng, (b[1] - a[1]) * 110540]; };
  const midM = (i: number): [number, number] => { const a = ring[i], b = ring[(i + 1) % ring.length]; return [((a[0] + b[0]) / 2) * metresPerLng, ((a[1] + b[1]) / 2) * 110540]; };
  const len = (v: [number, number]) => Math.hypot(v[0], v[1]);
  const fv = vec(frontIndex); const fLen = len(fv); const fu: [number, number] = [fv[0] / (fLen || 1), fv[1] / (fLen || 1)];
  const fm = midM(frontIndex);
  const minLen = Math.max(3, fLen * 0.35);
  const dist = (i: number) => Math.hypot(midM(i)[0] - fm[0], midM(i)[1] - fm[1]);
  let best: number | null = null; let bestScore = -Infinity;
  // Pass 1: parallel, substantial edges — prefer most parallel, then farthest.
  for (let i = 0; i < ring.length; i++) {
    if (i === frontIndex) continue;
    const ev = vec(i); const el = len(ev); if (el < minLen) continue;
    const parallelism = Math.abs((fu[0] * ev[0] + fu[1] * ev[1]) / el); // 1 = parallel
    if (parallelism < 0.6) continue;
    const s = parallelism * 1000 + dist(i);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  // Fallbacks: farthest substantial edge, then farthest edge of any size.
  if (best === null) { for (let i = 0; i < ring.length; i++) { if (i === frontIndex || len(vec(i)) < minLen) continue; const d = dist(i); if (d > bestScore) { bestScore = d; best = i; } } }
  if (best === null) { bestScore = -Infinity; for (let i = 0; i < ring.length; i++) { if (i === frontIndex) continue; const d = dist(i); if (d > bestScore) { bestScore = d; best = i; } } }
  return best;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Which way the front yard faces (outward from the lot centroid), in plain words. */
export function frontFacingCompass(ring: LatLng[], frontIndex: number): string | null {
  if (ring.length < 3 || frontIndex < 0 || frontIndex >= ring.length) return null;
  const centroid: LatLng = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const [mLng, mLat] = midpoint(ring, frontIndex);
  // Vector from centroid to the front edge midpoint = the outward (street-facing) direction.
  const dLng = mLng - centroid[0];
  const dLat = mLat - centroid[1];
  if (dLng === 0 && dLat === 0) return null;
  // Compass bearing: 0° = north (+lat), 90° = east (+lng).
  let bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return COMPASS[Math.round(bearing / 45) % 8];
}

/**
 * Build a yard reference from a chosen front edge: rear = opposite edge, sides derived,
 * and a note recording which way the front faces so the app "knows" the orientation.
 * Used by both the road-derived guess and a homeowner tap.
 */
export function yardReferenceFromFront(existing: SiteModel['yardReference'], ring: LatLng[], frontIndex: number, lat: number, selectedBy: string, selectedAt: string, roadName?: string | null): SiteModel['yardReference'] {
  const rearEdgeIndex = oppositeEdgeIndex(ring, frontIndex, lat);
  const facing = frontFacingCompass(ring, frontIndex);
  const exteriorSideEdgeIndex = existing.exteriorSideEdgeIndex === frontIndex || existing.exteriorSideEdgeIndex === rearEdgeIndex ? null : existing.exteriorSideEdgeIndex;
  const facingNote = facing ? `Front faces ${facing}${roadName ? ` (${roadName})` : ''}.` : '';
  const keptNote = (existing.notes || '').replace(/Front faces [^.]*\.\s*/i, '').trim();
  return {
    ...existing,
    status: 'homeowner-selected',
    frontEdgeIndex: frontIndex,
    rearEdgeIndex,
    exteriorSideEdgeIndex,
    selectedBy,
    selectedAt,
    notes: [facingNote, keptNote].filter(Boolean).join(' '),
  };
}
