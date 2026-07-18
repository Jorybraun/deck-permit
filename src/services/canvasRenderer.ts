import type { Property, Deck, LatLng } from '../types';
import { normalizeDeckLayout } from './deckLayout';

/**
 * SVG-based 2D canvas renderer.
 *
 * Renders the lot polygon, buildable envelope, house footprint (approximate),
 * and deck footprint as SVG. Supports different view modes:
 * - 'site': lot + envelope + deck (top view, for zoning)
 * - 'framing': deck with joists, beams, posts, footings
 * - 'elevation': side view showing height, guard, stairs
 */

interface RenderOptions {
  view: 'site' | 'framing' | 'elevation';
  width: number;
  height: number;
  showLabels: boolean;
  showCompliance: boolean;
}

interface BBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Compute bounding box of all polygons.
 */
function computeBBox(polygons: LatLng[][]): BBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Project a geographic coordinate to SVG pixel space.
 * Adds padding and flips Y axis (SVG Y goes down, lat goes up).
 */
function project(
  lng: number,
  lat: number,
  bbox: BBox,
  width: number,
  height: number,
  padding: number = 40
): [number, number] {
  const bw = bbox.maxX - bbox.minX || 0.001;
  const bh = bbox.maxY - bbox.minY || 0.001;
  const scale = Math.min((width - 2 * padding) / bw, (height - 2 * padding) / bh);
  const offsetX = (width - bw * scale) / 2;
  const offsetY = (height - bh * scale) / 2;
  const px = offsetX + (lng - bbox.minX) * scale;
  const py = offsetY + (bbox.maxY - lat) * scale; // flip Y
  return [px, py];
}

function polygonToSvgPoints(
  ring: LatLng[],
  bbox: BBox,
  width: number,
  height: number,
  padding: number
): string {
  return ring
    .map(([lng, lat]) => {
      const [x, y] = project(lng, lat, bbox, width, height, padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Render the site plan view: lot + envelope + deck.
 */
export function renderSiteView(property: Property, deck: Deck | null, options: RenderOptions): string {
  const { width, height, showLabels, showCompliance } = options;

  if (!property.parcel) {
    return emptySvg(width, height, 'Enter an address to see your lot');
  }

  const primaryBuilding = property.buildings.find((building) => building.primary) || null;
  const houseFootprint = primaryBuilding?.polygon || createApproximateHouseFootprint(property.parcel.polygon, deck);

  // Collect all polygons for bounding box
  const allPolys: LatLng[][] = [property.parcel.polygon];
  if (property.buildableEnvelope) allPolys.push(property.buildableEnvelope);
  allPolys.push(...(property.buildings.length ? property.buildings.map((building) => building.polygon) : [houseFootprint]));
  if (deck) allPolys.push(...deck.footprint.polygons);

  const bbox = computeBBox(allPolys);
  const padding = 60;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#F7F8FA;border-radius:8px;">`;

  // Defs: patterns, markers
  svg += `<defs>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#2563EB" stroke-width="1" opacity="0.3"/>
    </pattern>
    <pattern id="houseHatch" patternUnits="userSpaceOnUse" width="7" height="7">
      <path d="M0 7L7 0" stroke="#9AA59E" stroke-width="0.7" opacity="0.45"/>
    </pattern>
  </defs>`;

  // Lot polygon
  const lotPoints = polygonToSvgPoints(property.parcel.polygon, bbox, width, height, padding);
  svg += `<polygon points="${lotPoints}" fill="none" stroke="#111827" stroke-width="2"/>`;

  // Lot label
  if (showLabels) {
    const [cx, cy] = project(property.parcel.center[0], property.parcel.center[1], bbox, width, height, padding);
    svg += `<text x="${cx}" y="${cy - 20}" text-anchor="middle" font-size="11" fill="#6B7280" font-family="Inter,sans-serif">LOT ${property.parcel.pid}</text>`;
    svg += `<text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="10" fill="#6B7280" font-family="Inter,sans-serif">${property.parcel.areaSqm.toFixed(0)} m²</text>`;
  }

  // Buildable envelope (dashed)
  if (property.buildableEnvelope) {
    const envPoints = polygonToSvgPoints(property.buildableEnvelope, bbox, width, height, padding);
    svg += `<polygon points="${envPoints}" fill="url(#hatch)" stroke="#2563EB" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.6"/>`;
    if (showLabels) {
      svg += `<text x="${padding}" y="${height - padding}" font-size="10" fill="#2563EB" font-family="Inter,sans-serif">Buildable envelope (setbacks applied)</text>`;
    }
  }

  // Existing house context: municipal roofline where available, otherwise an estimate.
  for (const building of property.buildings.filter((item) => !item.primary)) {
    const accessoryPoints = polygonToSvgPoints(building.polygon, bbox, width, height, padding);
    svg += `<polygon points="${accessoryPoints}" fill="#F2F4F3" stroke="#7A8780" stroke-width="1.2" stroke-dasharray="4,3"/>`;
  }
  const housePoints = polygonToSvgPoints(houseFootprint, bbox, width, height, padding);
  svg += `<polygon points="${housePoints}" fill="#E7EBE8" stroke="#435148" stroke-width="2"/>`;
  svg += `<polygon points="${housePoints}" fill="url(#houseHatch)" stroke="none"/>`;
  const houseBox = computeBBox([houseFootprint]);
  const [houseCx, houseCy] = project(
    (houseBox.minX + houseBox.maxX) / 2,
    (houseBox.minY + houseBox.maxY) / 2,
    bbox,
    width,
    height,
    padding
  );
  svg += `<text x="${houseCx}" y="${houseCy - 3}" text-anchor="middle" font-size="12" font-weight="700" fill="#25352C" font-family="Inter,sans-serif">EXISTING HOUSE</text>`;
  svg += `<text x="${houseCx}" y="${houseCy + 13}" text-anchor="middle" font-size="9" fill="#68756D" font-family="Inter,sans-serif">${primaryBuilding ? 'municipal roofline · reference only' : 'approximate footprint · verify'}</text>`;

  // Deck polygon(s)
  if (deck) {
    for (const poly of deck.footprint.polygons) {
      const deckPoints = polygonToSvgPoints(poly, bbox, width, height, padding);
      svg += `<polygon points="${deckPoints}" fill="#2563EB" fill-opacity="0.15" stroke="#2563EB" stroke-width="2.5"/>`;
    }

    const deckBox = computeBBox(deck.footprint.polygons);
    const [deckCx, deckCy] = project(
      (deckBox.minX + deckBox.maxX) / 2,
      (deckBox.minY + deckBox.maxY) / 2,
      bbox,
      width,
      height,
      padding
    );
    svg += `<text x="${deckCx}" y="${deckCy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#174F3A" font-family="Inter,sans-serif">PROPOSED DECK</text>`;

    // Stairs indicator
    if (deck.stairs.enabled) {
      const edge = deck.stairs.edge;
      const lastPoly = deck.footprint.polygons[deck.footprint.polygons.length - 1];
      // Find the midpoint of the specified edge
      const stairMarker = findEdgeMidpoint(lastPoly, edge);
      if (stairMarker) {
        const [sx, sy] = project(stairMarker[0], stairMarker[1], bbox, width, height, padding);
        svg += `<rect x="${sx - 15}" y="${sy - 8}" width="30" height="16" fill="none" stroke="#F59E0B" stroke-width="1.5" rx="2"/>`;
        svg += `<text x="${sx}" y="${sy + 3}" text-anchor="middle" font-size="8" fill="#F59E0B" font-family="Inter,sans-serif">STAIRS</text>`;
      }
    }

    // Guard indicator on open edges
    if (deck.guard.enabled) {
      svg += `<text x="${width - padding}" y="${padding + 15}" text-anchor="end" font-size="10" fill="#16A34A" font-family="Inter,sans-serif">Guard: ${deck.guard.height}mm</text>`;
    }
  }

  // Compliance markers
  if (showCompliance) {
    // These would be passed in from the compliance engine
    // For now, we render a placeholder
  }

  // North arrow
  svg += renderNorthArrow(width - 50, 50);

  // Scale bar
  svg += renderScaleBar(bbox, width, height, padding);

  svg += `</svg>`;
  return svg;
}

/**
 * Produce a visible, conservative house mass for spatial design context.
 * It is attached to the selected deck edge when a deck exists and otherwise
 * sits near the centre-rear of the parcel.
 */
function createApproximateHouseFootprint(parcel: LatLng[], deck: Deck | null): LatLng[] {
  const lot = computeBBox([parcel]);
  const lotWidth = lot.maxX - lot.minX;
  const lotDepth = lot.maxY - lot.minY;
  const houseWidth = lotWidth * 0.52;
  const houseDepth = lotDepth * 0.28;
  let cx = (lot.minX + lot.maxX) / 2;
  let cy = (lot.minY + lot.maxY) / 2 + lotDepth * 0.08;

  if (deck && deck.footprint.polygons.length > 0) {
    const deckBox = computeBBox(deck.footprint.polygons);
    const deckCx = (deckBox.minX + deckBox.maxX) / 2;
    const deckCy = (deckBox.minY + deckBox.maxY) / 2;

    if (deck.footprint.houseWall === 'south') {
      cx = deckCx;
      cy = deckBox.maxY + houseDepth / 2;
    } else if (deck.footprint.houseWall === 'north') {
      cx = deckCx;
      cy = deckBox.minY - houseDepth / 2;
    } else if (deck.footprint.houseWall === 'east') {
      cx = deckBox.minX - houseWidth / 2;
      cy = deckCy;
    } else {
      cx = deckBox.maxX + houseWidth / 2;
      cy = deckCy;
    }
  }

  return [
    [cx - houseWidth / 2, cy - houseDepth / 2],
    [cx + houseWidth / 2, cy - houseDepth / 2],
    [cx + houseWidth / 2, cy + houseDepth / 2],
    [cx - houseWidth / 2, cy + houseDepth / 2],
    [cx - houseWidth / 2, cy - houseDepth / 2],
  ];
}

/**
 * Render the framing plan view: deck with joists, beams, posts.
 */
export function renderFramingView(deck: Deck | null, property: Property, options: RenderOptions): string {
  const { width, height, showLabels } = options;

  if (!deck || !property.parcel) {
    return emptySvg(width, height, 'Design your deck first');
  }

  const allPolys = [...deck.footprint.polygons, property.parcel.polygon];
  const bbox = computeBBox(allPolys);
  const padding = 60;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#F7F8FA;border-radius:8px;">`;

  // Deck outline
  for (const poly of deck.footprint.polygons) {
    const pts = polygonToSvgPoints(poly, bbox, width, height, padding);
    svg += `<polygon points="${pts}" fill="#F7F8FA" stroke="#111827" stroke-width="2"/>`;
  }

  // Render the exact local construction coordinates used by the model and permit set.
  const mainPoly = deck.footprint.polygons[0];
  const p0 = project(mainPoly[0][0], mainPoly[0][1], bbox, width, height, padding);
  const p1 = project(mainPoly[1][0], mainPoly[1][1], bbox, width, height, padding);
  const p3 = project(mainPoly[3][0], mainPoly[3][1], bbox, width, height, padding);
  const localPoint = (stationM: number, offsetM: number): [number, number] => [
    p0[0] + (p1[0] - p0[0]) * stationM / deck.dimensions.width + (p3[0] - p0[0]) * offsetM / deck.dimensions.depth,
    p0[1] + (p1[1] - p0[1]) * stationM / deck.dimensions.width + (p3[1] - p0[1]) * offsetM / deck.dimensions.depth,
  ];
  const layout = normalizeDeckLayout(deck);
  const joistCount = Math.ceil(deck.dimensions.width * 1000 / deck.structure.joistSpacing) + 1;
  for (let index = 0; index < joistCount; index += 1) {
    const station = Math.min(deck.dimensions.width, index * deck.structure.joistSpacing / 1000);
    const start = localPoint(station, 0);
    const end = localPoint(station, deck.dimensions.depth);
    svg += `<line x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}" stroke="#9CA3AF" stroke-width="0.8"/>`;
  }
  layout.beamOffsetsFromHouseM.forEach((offset, beamIndex) => {
    const start = localPoint(0, offset);
    const end = localPoint(deck.dimensions.width, offset);
    svg += `<line x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}" stroke="#111827" stroke-width="4"/>`;
    layout.postStationsM.forEach((station, postIndex) => {
      const point = localPoint(station, offset);
      svg += `<circle cx="${point[0]}" cy="${point[1]}" r="7" fill="white" stroke="#111827" stroke-width="2"/><text x="${point[0] + 8}" y="${point[1] - 8}" font-size="7" fill="#111827">P${beamIndex + 1}.${postIndex + 1}</text>`;
    });
  });

  // Labels
  if (showLabels) {
    svg += `<text x="${(p0[0] + p1[0]) / 2}" y="${Math.min(p0[1], p1[1]) - 10}" text-anchor="middle" font-size="10" fill="#111827" font-family="Inter,sans-serif">Joists: ${deck.structure.joistSize} @ ${deck.structure.joistSpacing}mm o.c.</text>`;
    svg += `<text x="${(p0[0] + p3[0]) / 2}" y="${(p0[1] + p3[1]) / 2 + 18}" text-anchor="middle" font-size="9" fill="#111827" font-family="Inter,sans-serif">B ${layout.beamOffsetsFromHouseM.map((value) => value.toFixed(3)).join(' / ')}m · P ${layout.postStationsM.map((value) => value.toFixed(3)).join(' / ')}m</text>`;
  }

  svg += renderNorthArrow(width - 50, 50);
  svg += `</svg>`;
  return svg;
}

/**
 * Render the elevation view: side view showing height, guard, stairs.
 */
export function renderElevationView(deck: Deck | null, options: RenderOptions): string {
  const { width, height, showLabels } = options;

  if (!deck) {
    return emptySvg(width, height, 'Design your deck first');
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#F7F8FA;border-radius:8px;">`;

  const padding = 60;
  const groundY = height - padding;
  const deckY = groundY - (deck.footprint.heightAboveGrade / 4) * (height - 2 * padding);
  const deckLeft = padding;
  const deckRight = width - padding;

  // Ground
  svg += `<line x1="20" y1="${groundY}" x2="${width - 20}" y2="${groundY}" stroke="#6B7280" stroke-width="2"/>`;
  svg += `<text x="25" y="${groundY + 20}" font-size="10" fill="#6B7280" font-family="Inter,sans-serif">GRADE</text>`;

  // Deck surface
  svg += `<line x1="${deckLeft}" y1="${deckY}" x2="${deckRight}" y2="${deckY}" stroke="#2563EB" stroke-width="3"/>`;

  // Posts
  const postCount = 3;
  for (let i = 0; i < postCount; i++) {
    const px = deckLeft + ((deckRight - deckLeft) * i) / (postCount - 1);
    svg += `<line x1="${px}" y1="${deckY}" x2="${px}" y2="${groundY}" stroke="#111827" stroke-width="2"/>`;
    // Footing
    svg += `<rect x="${px - 8}" y="${groundY - 4}" width="16" height="8" fill="#9CA3AF"/>`;
  }

  // Guard (if enabled)
  if (deck.guard.enabled) {
    const guardHeightPx = (deck.guard.height / 1200) * (height - 2 * padding);
    svg += `<line x1="${deckRight}" y1="${deckY}" x2="${deckRight}" y2="${deckY - guardHeightPx}" stroke="#16A34A" stroke-width="2"/>`;
    // Guard rails
    for (let i = 1; i < 4; i++) {
      const ry = deckY - (guardHeightPx * i) / 4;
      svg += `<line x1="${deckRight - 20}" y1="${ry}" x2="${deckRight}" y2="${ry}" stroke="#16A34A" stroke-width="1"/>`;
    }
    if (showLabels) {
      svg += `<text x="${deckRight + 10}" y="${deckY - guardHeightPx / 2}" font-size="10" fill="#16A34A" font-family="Inter,sans-serif">Guard ${deck.guard.height}mm</text>`;
    }
  }

  // Stairs (if enabled)
  if (deck.stairs.enabled) {
    const stairWidth = 60;
    const stairX = deckLeft - stairWidth;
    const stairHeight = groundY - deckY;
    const riserHeight = stairHeight / deck.stairs.numRisers;
    for (let i = 0; i < deck.stairs.numRisers; i++) {
      const sy = groundY - riserHeight * i;
      const sx = stairX + (stairWidth * i) / deck.stairs.numRisers;
      svg += `<line x1="${sx}" y1="${sy}" x2="${sx + stairWidth / deck.stairs.numRisers}" y2="${sy}" stroke="#F59E0B" stroke-width="1.5"/>`;
      svg += `<line x1="${sx + stairWidth / deck.stairs.numRisers}" y1="${sy}" x2="${sx + stairWidth / deck.stairs.numRisers}" y2="${sy - riserHeight}" stroke="#F59E0B" stroke-width="1.5"/>`;
    }
    if (showLabels) {
      svg += `<text x="${stairX - 10}" y="${groundY + 20}" font-size="10" fill="#F59E0B" font-family="Inter,sans-serif">Stairs: ${deck.stairs.numRisers} risers @ ${deck.stairs.riserHeight}mm</text>`;
    }
  }

  // Height label
  if (showLabels) {
    const heightLabel = `${(deck.footprint.heightAboveGrade * 1000).toFixed(0)}mm above grade`;
    svg += `<text x="${deckLeft + 10}" y="${(deckY + groundY) / 2}" font-size="11" fill="#111827" font-family="Inter,sans-serif">${heightLabel}</text>`;
  }

  // House wall (if attached)
  if (deck.footprint.attachedToHouse) {
    svg += `<rect x="${deckRight}" y="${deckY - 80}" width="20" height="${groundY - deckY + 80}" fill="#E5E7EB" stroke="#111827" stroke-width="1"/>`;
    svg += `<text x="${deckRight + 25}" y="${deckY - 60}" font-size="10" fill="#6B7280" font-family="Inter,sans-serif">HOUSE</text>`;
  }

  svg += `</svg>`;
  return svg;
}

function renderNorthArrow(x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
    <circle cx="0" cy="0" r="18" fill="white" stroke="#111827" stroke-width="1"/>
    <polygon points="0,-12 -5,8 0,3 5,8" fill="#111827"/>
    <text x="0" y="-20" text-anchor="middle" font-size="9" fill="#111827" font-family="Inter,sans-serif">N</text>
  </g>`;
}

function renderScaleBar(bbox: BBox, width: number, height: number, padding: number): string {
  const bw = bbox.maxX - bbox.minX;
  const bh = bbox.maxY - bbox.minY;
  const scale = Math.min((width - 2 * padding) / bw, (height - 2 * padding) / bh);
  // 10 meters in degrees lat
  const tenMetersDeg = 10 / 111000;
  const tenMetersPx = tenMetersDeg * scale;
  const x = padding;
  const y = height - 25;
  return `<g>
    <line x1="${x}" y1="${y}" x2="${x + tenMetersPx}" y2="${y}" stroke="#111827" stroke-width="2"/>
    <line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="#111827" stroke-width="2"/>
    <line x1="${x + tenMetersPx}" y1="${y - 4}" x2="${x + tenMetersPx}" y2="${y + 4}" stroke="#111827" stroke-width="2"/>
    <text x="${x + tenMetersPx / 2}" y="${y - 8}" text-anchor="middle" font-size="9" fill="#111827" font-family="Inter,sans-serif">10 m</text>
  </g>`;
}

function emptySvg(width: number, height: number, message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#F7F8FA;border-radius:8px;">
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="14" fill="#6B7280" font-family="Inter,sans-serif">${message}</text>
  </svg>`;
}

function findEdgeMidpoint(ring: LatLng[], edge: 'north' | 'south' | 'east' | 'west'): LatLng | null {
  if (ring.length < 4) return null;
  // Find the edge with the most extreme latitude/longitude
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  let minLatIdx = 0, maxLatIdx = 0, minLngIdx = 0, maxLngIdx = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    if (ring[i][1] < minLat) { minLat = ring[i][1]; minLatIdx = i; }
    if (ring[i][1] > maxLat) { maxLat = ring[i][1]; maxLatIdx = i; }
    if (ring[i][0] < minLng) { minLng = ring[i][0]; minLngIdx = i; }
    if (ring[i][0] > maxLng) { maxLng = ring[i][0]; maxLngIdx = i; }
  }

  let idx: number;
  switch (edge) {
    case 'north': idx = maxLatIdx; break;
    case 'south': idx = minLatIdx; break;
    case 'east': idx = maxLngIdx; break;
    case 'west': idx = minLngIdx; break;
    default: return null;
  }

  const p1 = ring[idx];
  const p2 = ring[(idx + 1) % (ring.length - 1)];
  return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
}
