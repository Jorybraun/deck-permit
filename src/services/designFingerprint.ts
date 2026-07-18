import type { Deck, Property } from '../types';

export const DESIGN_FINGERPRINT_SCHEMA = 'deck-permit-design/v5' as const;

/** Stable, non-secret revision identifier used to prevent stale review evidence. */
export function computeDesignFingerprint(property: Property, deck: Deck): string {
  const existingConditions = property.existingConditions
    ? Object.fromEntries(Object.entries(property.existingConditions).filter(([key]) => key !== 'updatedAt'))
    : null;
  const sitePlacement = deck.sitePlacement
    ? Object.fromEntries(Object.entries(deck.sitePlacement).filter(([key]) => key !== 'updatedAt'))
    : null;
  const layout = deck.layout
    ? Object.fromEntries(Object.entries(deck.layout).filter(([key]) => key !== 'updatedAt'))
    : null;
  const payload = JSON.stringify({
    schema: DESIGN_FINGERPRINT_SCHEMA,
    pid: property.parcel?.pid || '',
    address: property.address?.fullAddress || '',
    existingConditions,
    dimensions: deck.dimensions,
    footprint: {
      shape: deck.footprint.shape,
      outline: deck.footprint.outline ? {
        ...deck.footprint.outline,
        updatedAt: undefined,
      } : null,
      heightAboveGrade: deck.footprint.heightAboveGrade,
      attachedToHouse: deck.footprint.attachedToHouse,
      houseWall: deck.footprint.houseWall,
      polygons: deck.footprint.polygons,
    },
    sitePlacement,
    layout,
    stairs: deck.stairs,
    guard: deck.guard,
    structure: {
      joistSize: deck.structure.joistSize,
      joistSpacing: deck.structure.joistSpacing,
      joistSpecies: deck.structure.joistSpecies,
      beamSize: deck.structure.beamSize,
      postSize: deck.structure.postSize,
      postSpacing: deck.structure.postSpacing,
      footingType: deck.structure.footingType,
      footingSize: deck.structure.footingSize,
      footingDepth: deck.structure.footingDepth,
      ledgerAttachment: deck.structure.ledgerAttachment,
      lumberTreatment: deck.structure.lumberTreatment,
      deckingMaterial: deck.structure.deckingMaterial,
      deckingThickness: deck.structure.deckingThickness,
    },
  });
  return `DP-${fnv1a(payload)}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
