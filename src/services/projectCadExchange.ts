import type { CadCaptionEntity, CadCircleEntity, CadLayerDefinition, CadLineEntity } from '../domain/cad/makerCadKernel';
import { exportLayeredDxf } from '../domain/cad/makerCadKernel';
import type { DeckDesign, DeckStair, PointMm } from '../domain/deckDesign';
import type { FramingDesign } from '../domain/framingDesign';
import { projectPropertyToLocal, type SiteModel } from '../domain/siteModel';
import type { Property } from '../types';
import { canonicalPlanFingerprint } from './canonicalPlanSet';

export const PROJECT_CAD_EXCHANGE_SCHEMA = 'permitly-project-cad-exchange/v1' as const;

export const PROJECT_CAD_LAYERS: CadLayerDefinition[] = [
  { id: 'A-SITE-PROP', color: 3, lineType: 'DASHED' },
  { id: 'A-EXST-BLDG', color: 8 },
  { id: 'A-EXST-WALL', color: 7 },
  { id: 'A-EXST-OPEN', color: 4 },
  { id: 'A-DECK-EDGE', color: 30 },
  { id: 'A-DECK-STAIR', color: 30 },
  { id: 'A-DECK-GUARD', color: 6 },
  { id: 'C-GRADE-POINT', color: 2 },
  { id: 'S-DECK-JOIST', color: 3 },
  { id: 'S-DECK-BEAM', color: 5 },
  { id: 'S-DECK-LEDGER', color: 1 },
  { id: 'S-DECK-POST', color: 5 },
  { id: 'S-DECK-FOOTING', color: 2, lineType: 'DASHED' },
  { id: 'S-DECK-HEADER', color: 1 },
  { id: 'S-DECK-STRINGER', color: 30 },
  { id: 'S-DECK-CONN', color: 10 },
  { id: 'G-ANNO-ID', color: 8, fontSize: 95 },
  { id: 'G-ANNO-NPLT', color: 1, fontSize: 135 },
];

export interface ProjectCadExchange {
  schema: typeof PROJECT_CAD_EXCHANGE_SCHEMA;
  units: 'mm';
  coordinateSystem: 'local-house-wall';
  designFingerprint: string;
  generatedAt: string;
  notForConstruction: true;
  layers: Array<{ id: string; entityCount: number }>;
  entityCounts: {
    platforms: number;
    stairs: number;
    joists: number;
    beams: number;
    ledgers: number;
    posts: number;
    footings: number;
    guards: number;
    connections: number;
  };
  warnings: string[];
  dxf: string;
}

interface ProjectCadExchangeInput {
  property: Property;
  site: SiteModel;
  design: DeckDesign;
  framing: FramingDesign;
  generatedAt?: string;
}

/** Compiles one professional handoff model from the same canonical project graph as the permit sheets. */
export function buildProjectCadExchange(input: ProjectCadExchangeInput): ProjectCadExchange {
  const { property, site, design, framing } = input;
  const fingerprint = canonicalPlanFingerprint(input);
  const lines: CadLineEntity[] = [];
  const circles: CadCircleEntity[] = [];
  const captions: CadCaptionEntity[] = [];
  const localProperty = projectPropertyToLocal(property, site);

  if (localProperty) {
    addPolygon(lines, 'PARCEL', 'A-SITE-PROP', localProperty.parcel);
    localProperty.buildings.forEach((building) => addPolygon(lines, `BLDG-${building.id}`, 'A-EXST-BLDG', building.polygon));
  }

  lines.push({ id: 'HOUSE-WALL', layer: 'A-EXST-WALL', start: [0, 0], end: [site.designWall.lengthMm, 0] });
  captions.push(label('HOUSE-WALL', `SELECTED HOUSE WALL ${site.designWall.lengthMm} mm`, midpoint([0, 0], [site.designWall.lengthMm, 0]), site.designWall.lengthMm));
  site.designWall.openings.forEach((opening) => {
    const start: PointMm = [opening.offsetMm, 0];
    const end: PointMm = [opening.offsetMm + opening.widthMm, 0];
    lines.push({ id: `OPEN-${opening.id}`, layer: 'A-EXST-OPEN', start, end });
    const sourceRef = opening.sourceAiObservationRefs?.length ? ` AI-REF ${opening.sourceAiObservationRefs.join(',')}` : '';
    captions.push(label(`OPEN-${opening.id}`, `${opening.id} ${opening.kind.toUpperCase()} ${opening.widthMm}W ${opening.heightMm ?? (opening.kind === 'door' ? 2100 : 1200)}H SILL ${opening.sillHeightMm} ${(opening.evidenceStatus || 'field-measured').toUpperCase()}${sourceRef}`, midpoint(start, end), opening.widthMm));
  });
  site.terrain.gradePoints.forEach((point) => {
    circles.push({ id: `GRADE-${point.id}`, layer: 'C-GRADE-POINT', center: [point.xMm, point.yMm], radiusMm: 100 });
    captions.push(label(`GRADE-${point.id}`, `${point.id} EL ${point.elevationMm}`, [point.xMm + 140, point.yMm + 140], 1200));
  });

  design.platforms.forEach((platform) => {
    addPolygon(lines, platform.id, 'A-DECK-EDGE', platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm]));
    captions.push(label(platform.id, `${platform.id} ${platform.name.toUpperCase()} EL ${platform.elevationMm}`, centroid(platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm])), 1900));
  });
  design.stairs.forEach((stair) => addStairGeometry(stair, lines, captions));

  framing.joists.forEach((member) => {
    lines.push({ id: member.id, layer: 'S-DECK-JOIST', start: member.startMm, end: member.endMm });
    captions.push(label(member.id, `${member.id} ${member.section}`, midpoint(member.startMm, member.endMm), Math.min(1400, member.spanMm)));
  });
  framing.beams.forEach((member) => {
    lines.push({ id: member.id, layer: 'S-DECK-BEAM', start: member.startMm, end: member.endMm });
    captions.push(label(member.id, `${member.id} ${member.section}`, midpoint(member.startMm, member.endMm), Math.min(1800, member.lengthMm)));
  });
  framing.ledgers.forEach((member) => {
    lines.push({ id: member.id, layer: 'S-DECK-LEDGER', start: member.startMm, end: member.endMm });
    captions.push(label(member.id, `${member.id} ${member.section}`, midpoint(member.startMm, member.endMm), Math.min(1800, member.lengthMm)));
  });
  framing.posts.forEach((member) => {
    circles.push({ id: member.id, layer: 'S-DECK-POST', center: member.pointMm, radiusMm: 70 });
    captions.push(label(member.id, `${member.id} ${member.section}`, [member.pointMm[0] + 110, member.pointMm[1] + 110], 1100));
  });
  framing.footings.forEach((member) => {
    addRectangle(lines, member.id, 'S-DECK-FOOTING', member.centerMm, member.widthMm, member.lengthMm);
    captions.push(label(member.id, `${member.id} ${member.widthMm}x${member.lengthMm}`, [member.centerMm[0] + 120, member.centerMm[1] - 140], 1250));
  });
  framing.guards.forEach((member) => lines.push({ id: member.id, layer: 'A-DECK-GUARD', start: member.startMm, end: member.endMm }));
  framing.stairStringers.forEach((member) => lines.push({ id: member.id, layer: 'S-DECK-STRINGER', start: member.startMm, end: member.endMm }));
  framing.stairOpenings.forEach((member) => {
    lines.push({ id: member.id, layer: 'S-DECK-HEADER', start: member.headerStartMm, end: member.headerEndMm });
    captions.push(label(member.id, `${member.id} HEADER`, member.centerMm, 1300));
  });
  framing.stairTrimmers.forEach((member) => lines.push({ id: member.id, layer: 'S-DECK-HEADER', start: member.startMm, end: member.endMm }));
  framing.connections.forEach((connection) => {
    circles.push({ id: connection.id, layer: 'S-DECK-CONN', center: connection.pointMm, radiusMm: 105 });
    captions.push(label(connection.id, `${connection.id} ${connection.kind.toUpperCase()}`, [connection.pointMm[0] + 150, connection.pointMm[1] + 150], 1500));
  });

  captions.push({
    id: 'ISSUE-CONTROL', layer: 'G-ANNO-NPLT',
    text: `PERMITLY ${fingerprint} | PROFESSIONAL REVIEW | NOT FOR CONSTRUCTION`,
    point: [0, -1200], anchorWidthMm: Math.max(6000, site.designWall.lengthMm),
  });

  const activeLayerCounts = new Map<string, number>();
  [...lines, ...circles, ...captions].forEach((entry) => activeLayerCounts.set(entry.layer, (activeLayerCounts.get(entry.layer) || 0) + 1));
  const warnings = [
    ...(!localProperty ? ['Municipal parcel and building geometry are unavailable in this exchange.'] : []),
    ...(site.designWall.selectionStatus !== 'field-measured' ? ['House-wall geometry remains unverified field input.'] : []),
    ...(framing.connections.length ? ['Connection hardware and capacities remain unresolved professional design work.'] : []),
    'Model-space geometry is a coordinated professional-review handoff, not an authenticated construction document.',
  ];
  return {
    schema: PROJECT_CAD_EXCHANGE_SCHEMA,
    units: 'mm',
    coordinateSystem: 'local-house-wall',
    designFingerprint: fingerprint,
    generatedAt: input.generatedAt || new Date().toISOString(),
    notForConstruction: true,
    layers: PROJECT_CAD_LAYERS.filter((layer) => activeLayerCounts.has(layer.id)).map((layer) => ({ id: layer.id, entityCount: activeLayerCounts.get(layer.id) || 0 })),
    entityCounts: {
      platforms: design.platforms.length,
      stairs: design.stairs.length,
      joists: framing.joists.length,
      beams: framing.beams.length,
      ledgers: framing.ledgers.length,
      posts: framing.posts.length,
      footings: framing.footings.length,
      guards: framing.guards.length,
      connections: framing.connections.length,
    },
    warnings,
    dxf: exportLayeredDxf({ layers: PROJECT_CAD_LAYERS, lines, circles, captions }),
  };
}

export function downloadProjectCadExchange(input: ProjectCadExchangeInput): ProjectCadExchange {
  const exchange = buildProjectCadExchange(input);
  const civic = input.property.address?.civicNumber || 'project';
  downloadCadExchangeArtifact(exchange, `permitly-deck-model-${civic}`);
  return exchange;
}

export function downloadCadExchangeArtifact(exchange: ProjectCadExchange, fileStem = 'permitly-deck-model'): void {
  const blob = new Blob([exchange.dxf], { type: 'application/dxf' });
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = `${fileStem}-${exchange.designFingerprint.toLowerCase()}.dxf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function addPolygon(lines: CadLineEntity[], id: string, layer: string, rawPoints: PointMm[]): void {
  const points = openRing(rawPoints);
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    if (end && !samePoint(start, end)) lines.push({ id: `${id}-E${index + 1}`, layer, start, end });
  });
}

function addRectangle(lines: CadLineEntity[], id: string, layer: string, center: PointMm, width: number, length: number): void {
  const halfW = width / 2; const halfL = length / 2;
  addPolygon(lines, id, layer, [
    [center[0] - halfW, center[1] - halfL], [center[0] + halfW, center[1] - halfL],
    [center[0] + halfW, center[1] + halfL], [center[0] - halfW, center[1] + halfL],
  ]);
}

function addStairGeometry(stair: DeckStair, lines: CadLineEntity[], captions: CadCaptionEntity[]): void {
  const dx = stair.endMm[0] - stair.startMm[0]; const dy = stair.endMm[1] - stair.startMm[1];
  const length = Math.hypot(dx, dy);
  const angle = stair.directionDeg * Math.PI / 180;
  const ux = length > 1 ? dx / length : Math.cos(angle); const uy = length > 1 ? dy / length : Math.sin(angle);
  const nx = -uy; const ny = ux; const halfWidth = stair.widthMm / 2;
  const corner = (point: PointMm, side: -1 | 1): PointMm => [point[0] + nx * halfWidth * side, point[1] + ny * halfWidth * side];
  addPolygon(lines, stair.id, 'A-DECK-STAIR', [corner(stair.startMm, -1), corner(stair.startMm, 1), corner(stair.endMm, 1), corner(stair.endMm, -1)]);
  const treadCount = Math.max(1, stair.riserCount - 1);
  for (let index = 1; index <= treadCount; index += 1) {
    const fraction = index / stair.riserCount;
    const center: PointMm = [stair.startMm[0] + ux * length * fraction, stair.startMm[1] + uy * length * fraction];
    lines.push({ id: `${stair.id}-T${index}`, layer: 'A-DECK-STAIR', start: corner(center, -1), end: corner(center, 1) });
  }
  captions.push(label(stair.id, `${stair.id} ${stair.riserCount}R ${stair.widthMm}W`, midpoint(stair.startMm, stair.endMm), Math.max(1000, Math.min(1800, length))));
}

function label(id: string, text: string, point: PointMm, anchorWidthMm: number): CadCaptionEntity {
  return { id: `LABEL-${id}`, layer: 'G-ANNO-ID', text, point, anchorWidthMm };
}

function openRing(points: PointMm[]): PointMm[] {
  return points.length > 1 && samePoint(points[0], points[points.length - 1]) ? points.slice(0, -1) : points;
}

function samePoint(first: PointMm, second: PointMm): boolean { return first[0] === second[0] && first[1] === second[1]; }
function midpoint(first: PointMm, second: PointMm): PointMm { return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]; }
function centroid(points: PointMm[]): PointMm { return points.length ? [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length] : [0, 0]; }
