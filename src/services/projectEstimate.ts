import type { DeckDesign, DeckPlatform } from '../domain/deckDesign';

export interface ProjectEstimateLine {
  id: 'decking' | 'framing' | 'supports' | 'guards' | 'stairs' | 'hardware';
  label: string;
  lowCad: number;
  highCad: number;
  basis: string;
}

export interface ProjectEstimate {
  currency: 'CAD';
  areaSqM: number;
  materialLowCad: number;
  materialHighCad: number;
  installedLowCad: number;
  installedHighCad: number;
  lines: ProjectEstimateLine[];
  confidence: 'concept';
  pricedAt: '2026-07';
  pricingMode: 'regional-allowance-not-live';
  installedBasis: string;
  sources: Array<{ label: string; url: string }>;
}

export const PROJECT_ESTIMATE_SOURCES = [
  { label: 'Home Depot Canada · pressure-treated lumber', url: 'https://www.homedepot.ca/en/home/categories/building-materials/lumber-and-composites/pressure-treated-lumber.html' },
  { label: 'Home Depot Canada · composite deck boards', url: 'https://www.homedepot.ca/en/home/categories/building-materials/decking/deck-boards/f/composite/wbc-6z7' },
  { label: 'Home Depot Canada · deck railing kits', url: 'https://www.homedepot.ca/en/home/categories/building-materials/decking/deck-railings/deck-railing-kits.html' },
] as const;

/**
 * Geometry-aware concept allowance for the homeowner canvas.
 * This is intentionally separate from structural quantities, supplier takeoffs, and contractor quotes.
 */
export function estimateProject(design: DeckDesign): ProjectEstimate {
  const areaSqM = design.platforms.reduce((sum, platform) => sum + platformAreaSqM(platform), 0);
  const decking = design.platforms.reduce((range, platform) => {
    const area = platformAreaSqM(platform) * 1.1;
    const rate = deckingRate(platform.finish.decking);
    return [range[0] + area * rate[0], range[1] + area * rate[1]] as const;
  }, [0, 0] as readonly [number, number]);
  const framing: readonly [number, number] = [areaSqM * 90, areaSqM * 155];
  const estimatedSupports = design.platforms.reduce((count, platform) => count + Math.max(2, Math.ceil(platformAreaSqM(platform) / 7.5)), 0);
  const supports: readonly [number, number] = [estimatedSupports * 210, estimatedSupports * 430];
  const guardLengthM = design.platforms.reduce((sum, platform) => sum + guardedEdgeLengthM(platform), 0);
  const guards = design.platforms.reduce((range, platform) => {
    const length = guardedEdgeLengthM(platform);
    const rate = guardRate(platform.finish.guardSystem);
    return [range[0] + length * rate[0], range[1] + length * rate[1]] as const;
  }, [0, 0] as readonly [number, number]);
  const stairTreads = design.stairs.reduce((sum, stair) => sum + Math.max(1, stair.riserCount - 1), 0);
  const stairs: readonly [number, number] = design.stairs.reduce((range, stair) => {
    const handrailFactor = stair.handrailSides === 'both' ? 2 : stair.handrailSides === 'none' ? 0 : 1;
    return [range[0] + 500 + stair.riserCount * 120 + handrailFactor * 220, range[1] + 900 + stair.riserCount * 240 + handrailFactor * 480] as const;
  }, [0, 0] as readonly [number, number]);
  const hardware: readonly [number, number] = [areaSqM * 28 + design.stairs.length * 180, areaSqM * 52 + design.stairs.length * 420];
  const lines: ProjectEstimateLine[] = [
    line('decking', 'Decking & trim', decking, `${areaSqM.toFixed(1)} m² + 10% waste · ${deckingRateBasis(design)}`),
    line('framing', 'Framing lumber', framing, `$90–155/m² deck area · replaced by generated member takeoff`),
    line('supports', 'Posts & footings', supports, `${estimatedSupports} provisional locations · $210–430 each`),
    line('guards', 'Guards / railing', guards, `${guardLengthM.toFixed(1)} m · ${guardRateBasis(design)}`),
    line('stairs', 'Stair assemblies', stairs, `${design.stairs.length} run${design.stairs.length === 1 ? '' : 's'} · ${stairTreads} tread${stairTreads === 1 ? '' : 's'} · base + riser + rail allowance`),
    line('hardware', 'Connectors & fasteners', hardware, `$28–52/m² + $180–420 per stair`),
  ];
  const materialLowCad = roundHundred(lines.reduce((sum, item) => sum + item.lowCad, 0));
  const materialHighCad = roundHundred(lines.reduce((sum, item) => sum + item.highCad, 0));
  return {
    currency: 'CAD', areaSqM: round(areaSqM, 1), materialLowCad, materialHighCad,
    installedLowCad: roundHundred(materialLowCad * 1.7 + (areaSqM ? 1800 : 0)),
    installedHighCad: roundHundred(materialHighCad * 2.5 + (areaSqM ? 5500 : 0)),
    lines, confidence: 'concept', pricedAt: '2026-07', pricingMode: 'regional-allowance-not-live',
    installedBasis: 'Materials × 1.7–2.5, plus a $1,800–5,500 small-project/site allowance; not a contractor quote.',
    sources: PROJECT_ESTIMATE_SOURCES.map((source) => ({ ...source })),
  };
}

function line(id: ProjectEstimateLine['id'], label: string, values: readonly [number, number], basis: string): ProjectEstimateLine {
  return { id, label, lowCad: roundHundred(values[0]), highCad: roundHundred(values[1]), basis };
}

function platformAreaSqM(platform: DeckPlatform): number {
  const vertices = platform.boundary.vertices;
  const twiceArea = vertices.reduce((sum, vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + vertex.xMm * next.yMm - next.xMm * vertex.yMm;
  }, 0);
  return Math.abs(twiceArea) / 2_000_000;
}

function guardedEdgeLengthM(platform: DeckPlatform): number {
  return platform.edges.reduce((sum, edge, index) => {
    if (edge.role === 'house' || edge.role === 'shared' || edge.role === 'stair') return sum;
    if (edge.role !== 'guard' && platform.elevationMm <= 600) return sum;
    const start = platform.boundary.vertices[index]; const end = platform.boundary.vertices[(index + 1) % platform.boundary.vertices.length];
    return sum + Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm) / 1000;
  }, 0);
}

function deckingRate(material: string): readonly [number, number] {
  const normalized = material.toLowerCase();
  if (normalized.includes('waterproof') || normalized.includes('vinyl')) return [190, 320];
  if (normalized.includes('composite')) return [145, 265];
  if (normalized.includes('cedar')) return [115, 205];
  return [55, 95];
}

function guardRate(material: string): readonly [number, number] {
  const normalized = material.toLowerCase();
  if (normalized.includes('glass')) return [600, 950];
  if (normalized.includes('aluminum') || normalized.includes('metal')) return [330, 590];
  return [135, 245];
}

function deckingRateBasis(design: DeckDesign): string {
  const bases = new Set(design.platforms.map((platform) => { const [low, high] = deckingRate(platform.finish.decking); return `${platform.finish.decking} $${low}–${high}/m²`; }));
  return [...bases].join('; ') || 'finish not selected';
}

function guardRateBasis(design: DeckDesign): string {
  const bases = new Set(design.platforms.map((platform) => { const [low, high] = guardRate(platform.finish.guardSystem); return `${platform.finish.guardSystem} $${low}–${high}/m`; }));
  return [...bases].join('; ') || 'guard system not selected';
}

function roundHundred(value: number): number { return Math.round(Math.max(0, value) / 100) * 100; }
function round(value: number, decimals: number): number { const power = 10 ** decimals; return Math.round(value * power) / power; }
