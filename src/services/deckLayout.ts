import type { Deck, DeckLayout } from '../types';

export interface DeckLayoutAssessment {
  layout: DeckLayout;
  maxPostBayM: number;
  postBayLengthsM: number[];
  stairEdgeLengthM: number;
  errors: string[];
  warnings: string[];
}

export function createDefaultDeckLayout(
  widthM: number,
  depthM: number,
  attached: boolean,
  postSpacingM: number,
  stairWidthM: number,
): DeckLayout {
  const bayCount = Math.max(1, Math.ceil(widthM / postSpacingM));
  const postStationsM = Array.from({ length: bayCount + 1 }, (_, index) => round(widthM * index / bayCount, 3));
  const edgeInset = round(Math.min(.35, Math.max(.15, depthM * .12)), 3);
  const beamOffsetsFromHouseM = attached
    ? [round(Math.max(.15, depthM - edgeInset), 3)]
    : [edgeInset, round(Math.max(edgeInset + .15, depthM - edgeInset), 3)];
  return {
    schema: 'deck-layout/v1',
    beamOffsetsFromHouseM,
    postStationsM,
    stairOffsetM: round(Math.max(0, (widthM - stairWidthM) / 2), 3),
    stairLandingDepthM: round(Math.max(.9, stairWidthM), 3),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeDeckLayout(deck: Deck): DeckLayout {
  const fallback = createDefaultDeckLayout(
    deck.dimensions.width,
    deck.dimensions.depth,
    deck.footprint.attachedToHouse,
    deck.structure.postSpacing,
    deck.stairs.width,
  );
  if (!deck.layout) return fallback;
  return {
    ...fallback,
    ...deck.layout,
    beamOffsetsFromHouseM: [...deck.layout.beamOffsetsFromHouseM],
    postStationsM: [...deck.layout.postStationsM],
  };
}

export function assessDeckLayout(deck: Deck): DeckLayoutAssessment {
  const layout = normalizeDeckLayout(deck);
  const beams = [...layout.beamOffsetsFromHouseM];
  const posts = [...layout.postStationsM];
  const errors: string[] = [];
  const warnings: string[] = [];
  const expectedBeamCount = deck.footprint.attachedToHouse ? 1 : 2;
  if (beams.length !== expectedBeamCount) errors.push(`${deck.footprint.attachedToHouse ? 'Attached' : 'Freestanding'} layout requires ${expectedBeamCount} beam line${expectedBeamCount === 1 ? '' : 's'}.`);
  if (beams.some((offset) => !Number.isFinite(offset) || offset <= 0 || offset >= deck.dimensions.depth)) errors.push('Every beam offset must be greater than zero and inside the deck depth.');
  if (beams.some((offset, index) => index > 0 && offset <= beams[index - 1])) errors.push('Beam offsets must increase outward from the house side.');
  if (posts.length < 2) errors.push('Each beam requires at least two support stations.');
  if (posts.some((station) => !Number.isFinite(station) || station < 0 || station > deck.dimensions.width)) errors.push('Post stations must fall between zero and the deck width.');
  if (posts.some((station, index) => index > 0 && station <= posts[index - 1])) errors.push('Post stations must increase from the left deck edge.');
  const postBayLengthsM = posts.slice(1).map((station, index) => round(station - posts[index], 3));
  const maxPostBayM = postBayLengthsM.length ? Math.max(...postBayLengthsM) : 0;
  if (maxPostBayM > deck.structure.postSpacing + .001) errors.push(`Maximum post bay ${maxPostBayM.toFixed(3)} m exceeds the ${deck.structure.postSpacing.toFixed(3)} m structural selection limit.`);
  if (posts[0] > .61 || deck.dimensions.width - (posts[posts.length - 1] || 0) > .61) warnings.push('Beam end overhang exceeds 0.61 m; professional beam review is required.');
  const stairEdgeLengthM = deck.stairs.edge === 'north' || deck.stairs.edge === 'south' ? deck.dimensions.width : deck.dimensions.depth;
  if (deck.stairs.enabled && (layout.stairOffsetM < 0 || layout.stairOffsetM + deck.stairs.width > stairEdgeLengthM + .001)) errors.push(`Stair width and offset exceed the ${stairEdgeLengthM.toFixed(3)} m selected deck edge.`);
  if (deck.stairs.enabled && layout.stairLandingDepthM + .001 < deck.stairs.width) errors.push('Bottom landing depth must be at least the stair width.');
  return { layout, maxPostBayM: round(maxPostBayM, 3), postBayLengthsM, stairEdgeLengthM: round(stairEdgeLengthM, 3), errors, warnings };
}

export function layoutSummary(deck: Deck): string {
  const assessment = assessDeckLayout(deck);
  return `Beams ${assessment.layout.beamOffsetsFromHouseM.map((value) => value.toFixed(3)).join(', ')} m from house side; posts at ${assessment.layout.postStationsM.map((value) => value.toFixed(3)).join(', ')} m from left edge; stair at ${assessment.layout.stairOffsetM.toFixed(3)} m on ${deck.stairs.edge.toUpperCase()} edge`;
}

function round(value: number, decimals: number): number {
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
}
