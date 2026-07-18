import makerjs from 'makerjs';
import type { Deck, DeckOutline, DeckOutlineVertex, DeckShape } from '../types';

const MIN_EDGE_MM = 100;
const MIN_AREA_SQ_M = .5;

export interface DeckOutlineAssessment {
  outline: DeckOutline;
  areaSqM: number;
  widthMm: number;
  depthMm: number;
  errors: string[];
  warnings: string[];
}

export function createDeckOutline(shape: DeckShape, widthM: number, depthM: number, now = new Date().toISOString()): DeckOutline {
  const width = Math.round(widthM * 1000);
  const depth = Math.round(depthM * 1000);
  let points: Array<[number, number]>;
  if (shape === 'l-shape') {
    points = [[0, 0], [width * .6, 0], [width * .6, depth * .5], [width, depth * .5], [width, depth], [0, depth]];
  } else if (shape === 'wraparound') {
    points = [[0, 0], [width, 0], [width, depth], [width * .7, depth], [width * .7, depth * .3], [0, depth * .3]];
  } else {
    points = [[0, 0], [width, 0], [width, depth], [0, depth]];
  }
  return createOutlineFromPoints(points, true, now);
}

export function createOutlineFromPoints(points: Array<[number, number]>, closed: boolean, now = new Date().toISOString()): DeckOutline {
  return {
    schema: 'deck-outline/v1',
    units: 'mm',
    vertices: points.map(([xMm, yMm], index) => ({ id: `V${index + 1}`, xMm: round(xMm), yMm: round(yMm) })),
    closed,
    updatedAt: now,
  };
}

export function normalizeDeckOutline(deck: Deck): DeckOutline {
  return deck.footprint.outline || createDeckOutline(deck.footprint.shape, deck.dimensions.width, deck.dimensions.depth);
}

export function normalizeOutlineToOrigin(outline: DeckOutline): DeckOutline {
  if (!outline.vertices.length) return outline;
  const minX = Math.min(...outline.vertices.map((vertex) => vertex.xMm));
  const minY = Math.min(...outline.vertices.map((vertex) => vertex.yMm));
  return {
    ...outline,
    vertices: outline.vertices.map((vertex) => ({ ...vertex, xMm: round(vertex.xMm - minX), yMm: round(vertex.yMm - minY) })),
    updatedAt: new Date().toISOString(),
  };
}

export function assessDeckOutline(input: DeckOutline): DeckOutlineAssessment {
  const outline = normalizeOutlineToOrigin(input);
  const errors: string[] = [];
  const warnings: string[] = [];
  const vertices = outline.vertices;
  const widthMm = vertices.length ? Math.max(...vertices.map((vertex) => vertex.xMm)) : 0;
  const depthMm = vertices.length ? Math.max(...vertices.map((vertex) => vertex.yMm)) : 0;
  const areaSqM = Math.abs(signedAreaMm2(vertices)) / 1_000_000;

  if (!outline.closed) errors.push('Close the deck outline before generating framing.');
  if (vertices.length < 3) errors.push('The deck outline requires at least three corners.');
  if (new Set(vertices.map((vertex) => `${vertex.xMm}:${vertex.yMm}`)).size !== vertices.length) errors.push('The deck outline contains duplicate corners.');
  if (vertices.length >= 3 && areaSqM < MIN_AREA_SQ_M) errors.push(`Deck area must be at least ${MIN_AREA_SQ_M.toFixed(1)} m².`);

  const paths = outlinePaths(outline);
  const edges = Object.values(paths);
  edges.forEach((path, index) => {
    const length = makerjs.measure.pathLength(path);
    if (length < MIN_EDGE_MM) errors.push(`Edge ${index + 1} is shorter than ${MIN_EDGE_MM} mm.`);
  });
  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      if (areAdjacentEdges(first, second, edges.length)) continue;
      const intersection = makerjs.path.intersection(edges[first], edges[second]);
      if (intersection?.intersectionPoints.length) errors.push(`Edges ${first + 1} and ${second + 1} cross.`);
    }
  }

  if (vertices.some((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return outline.closed && next && vertex.xMm !== next.xMm && vertex.yMm !== next.yMm;
  })) warnings.push('Angled edges require professional framing layout; the initial automatic solver supports orthogonal outlines.');

  return { outline, areaSqM: roundTo(areaSqM, 3), widthMm, depthMm, errors: unique(errors), warnings };
}

export function outlineToMakerModel(outline: DeckOutline): MakerJs.IModel {
  return { units: makerjs.unitType.Millimeter, layer: 'DECK-OUTLINE', paths: outlinePaths(outline) };
}

export function exportDeckOutlineDxf(deck: Deck): string {
  const outline = normalizeDeckOutline(deck);
  const deckModel = outlineToMakerModel(outline);
  const width = Math.max(deck.dimensions.width * 1000, ...outline.vertices.map((vertex) => vertex.xMm), 1000);
  const houseWall: MakerJs.IPathLine = new makerjs.paths.Line([-1000, 0], [width + 1000, 0]);
  houseWall.layer = 'EXISTING-HOUSE';
  const model: MakerJs.IModel = {
    units: makerjs.unitType.Millimeter,
    models: { deck: deckModel },
    paths: { houseWall },
  };
  return makerjs.exporter.toDXF(model, { units: makerjs.unitType.Millimeter });
}

export function classifyOutlineShape(outline: DeckOutline): DeckShape {
  const assessment = assessDeckOutline(outline);
  if (!assessment.errors.length && outline.vertices.length === 4) {
    const xs = new Set(outline.vertices.map((vertex) => vertex.xMm));
    const ys = new Set(outline.vertices.map((vertex) => vertex.yMm));
    if (xs.size === 2 && ys.size === 2) return 'rectangle';
  }
  return 'custom';
}

function outlinePaths(outline: DeckOutline): MakerJs.IPathMap {
  const paths: MakerJs.IPathMap = {};
  const edgeCount = outline.closed ? outline.vertices.length : Math.max(0, outline.vertices.length - 1);
  for (let index = 0; index < edgeCount; index += 1) {
    const start = outline.vertices[index];
    const end = outline.vertices[(index + 1) % outline.vertices.length];
    const path: MakerJs.IPathLine = new makerjs.paths.Line([start.xMm, start.yMm], [end.xMm, end.yMm]);
    path.layer = 'DECK-OUTLINE';
    paths[`E${index + 1}`] = path;
  }
  return paths;
}

function signedAreaMm2(vertices: DeckOutlineVertex[]): number {
  if (vertices.length < 3) return 0;
  return vertices.reduce((sum, vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + vertex.xMm * next.yMm - next.xMm * vertex.yMm;
  }, 0) / 2;
}

function areAdjacentEdges(first: number, second: number, edgeCount: number): boolean {
  return second === first + 1 || (first === 0 && second === edgeCount - 1);
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
function round(value: number): number { return Math.round(value); }
function roundTo(value: number, decimals: number): number { const power = 10 ** decimals; return Math.round(value * power) / power; }
