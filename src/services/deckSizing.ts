import type { BuildingFootprint, Deck, DeckLayout, DeckOutline, DeckShape, DeckSitePlacement, StructureConfig, StairConfig, GuardConfig, LatLng, Property } from '../types';
import { selectCwcFraming } from './cwcSpanTables';
import { createDefaultSitePlacement } from './sitePlacement';
import { createDefaultDeckLayout } from './deckLayout';
import { assessDeckOutline, classifyOutlineShape, createDeckOutline, normalizeDeckOutline, normalizeOutlineToOrigin } from './deckOutline';

/**
 * Parametric deck sizing engine.
 *
 * Sizes structural members based on:
 * - BCBC Part 9 prescriptive requirements
 * - Canadian Wood Council (CWC) Prescriptive Residential Exterior Wood Deck Span Guide
 * - BC Housing Illustrated Guide for Building Safe and Durable Wood Decks and Balconies
 *
 * References:
 * - CWC span tables (wet service, pressure-treated)
 * - BCBC 9.17.4.1 (column sizes)
 * - BCBC 9.23 (wood frame construction)
 * - BCBC 9.30.3.1 (decking thickness vs joist spacing)
 */

/**
 * Select structural members inside the declared CWC table scope.
 * Unsupported configurations are explicitly marked for engineering.
 */
export function sizeStructure(
  deckDepth: number, // meters (joist span direction)
  _deckWidth: number, // meters (beam direction)
  heightAboveGrade: number, // meters
  snowLoad: number,
  options: {
    treatment?: 'incised' | 'not-incised';
    shape?: DeckShape;
    attachedToHouse?: boolean;
  } = {}
): StructureConfig {
  const joistSpacing = 400;
  const postSpacing = 1.8;
  const lumberTreatment = options.treatment || 'incised';
  const result = selectCwcFraming({
    joistSpanM: deckDepth,
    joistSpacingMm: joistSpacing,
    speciesGroup: 'S-P-F',
    grade: 'No.2 or better',
    treatment: lumberTreatment,
    postSpacingM: postSpacing,
    heightAboveGradeM: heightAboveGrade,
    guardRequired: heightAboveGrade > 0.6,
    attachedSingleSpan: options.attachedToHouse ?? true,
    rectangular: (options.shape || 'rectangle') === 'rectangle',
    snowLoadKpa: snowLoad,
  });

  // Footing size — simplified: 300x300mm pad, 200mm thick
  const footingSize = 300;
  const footingDepth = heightAboveGrade <= 0.6 ? 300 : 450;

  // Decking thickness per BCBC 9.30.3.1
  const deckingThickness = joistSpacing >= 600 ? 38 : 25;

  return {
    joistSize: result.joistSize,
    joistSpacing,
    joistSpecies: `S-P-F No.2 or better, ${lumberTreatment}, wet service`,
    beamSize: result.beamSize,
    postSize: result.postSize,
    postSpacing,
    footingType: 'Concrete pad footing',
    footingSize,
    footingDepth,
    ledgerAttachment: 'Connection design required after field verification',
    deckingMaterial: 'Pressure-treated wood decking',
    deckingThickness,
    lumberTreatment,
    selection: result.selection,
  };
}

/**
 * Size stairs based on deck height.
 * Per BCBC 9.8.4: rise 125-200mm, run 255-355mm for private stairs.
 */
export function sizeStairs(heightAboveGrade: number): StairConfig {
  // Choose enough equal risers to stay at or below the 200 mm screening maximum.
  const numRisers = Math.max(1, Math.ceil((heightAboveGrade * 1000) / 200));
  const riserHeight = Math.round((heightAboveGrade * 1000) / numRisers);

  // Tread run: 280mm (comfortable, within code)
  const treadRun = 280;

  return {
    enabled: heightAboveGrade > 0.3, // stairs needed if more than ~1 step
    edge: 'south', // default — user can change
    width: 0.9, // 900mm — above 860mm minimum
    riserHeight,
    numRisers,
    treadRun,
  };
}

/**
 * Size guards based on deck height.
 * Per BCBC 9.8.8.3: 900mm if ≤1800mm above grade, 1070mm if >1800mm.
 */
export function sizeGuards(heightAboveGrade: number): GuardConfig {
  const heightMm = heightAboveGrade * 1000;
  const required = heightMm > 1800 ? 1070 : 900;

  return {
    enabled: heightMm > 600,
    height: required,
    openingMax: 100, // 100mm sphere rule
    material: 'Pressure-treated wood guardrail',
  };
}

/**
 * Generate a deck footprint polygon on the parcel.
 * The deck is placed along the house wall, inset from the property lines.
 */
export function generateDeckFootprint(
  shape: DeckShape,
  parcel: Property['parcel'],
  depth: number,
  width: number,
  _heightAboveGrade: number,
  attachedToHouse: boolean,
  houseWall: 'north' | 'south' | 'east' | 'west',
  building?: BuildingFootprint | null,
  sitePlacement?: DeckSitePlacement,
  outline?: DeckOutline,
): { polygons: LatLng[][]; area: number } {
  if (!parcel) return { polygons: [], area: 0 };

  const center = parcel.center;
  // Convert meters to degrees
  const latDegPerM = 1 / 111000;
  const lngDegPerM = 1 / (111000 * Math.cos((center[1] * Math.PI) / 180));

  const buildingBounds = building ? boundsOf(building.polygon) : null;
  const gap = attachedToHouse ? 0 : Math.max(0, sitePlacement?.outwardGapM ?? 1);
  let [cx, cy] = center;
  if (buildingBounds) {
    const houseCx = (buildingBounds.minLng + buildingBounds.maxLng) / 2;
    const houseCy = (buildingBounds.minLat + buildingBounds.maxLat) / 2;
    const wallLengthM = houseWall === 'north' || houseWall === 'south'
      ? (buildingBounds.maxLng - buildingBounds.minLng) / lngDegPerM
      : (buildingBounds.maxLat - buildingBounds.minLat) / latDegPerM;
    const alongWallOffsetM = (sitePlacement?.wallStartOffsetM ?? Math.max(0, (wallLengthM - width) / 2)) + width / 2 - wallLengthM / 2;
    if (houseWall === 'south') {
      cx = houseCx + alongWallOffsetM * lngDegPerM;
      cy = buildingBounds.minLat - (depth / 2 + gap) * latDegPerM;
    } else if (houseWall === 'north') {
      cx = houseCx + alongWallOffsetM * lngDegPerM;
      cy = buildingBounds.maxLat + (depth / 2 + gap) * latDegPerM;
    } else if (houseWall === 'east') {
      cx = buildingBounds.maxLng + (depth / 2 + gap) * lngDegPerM;
      cy = houseCy + alongWallOffsetM * latDegPerM;
    } else {
      cx = buildingBounds.minLng - (depth / 2 + gap) * lngDegPerM;
      cy = houseCy + alongWallOffsetM * latDegPerM;
    }
  }

  const toCoordinate = ([u, v]: [number, number]): LatLng => {
    if (houseWall === 'east' || houseWall === 'west') {
      return [cx + v * lngDegPerM, cy + u * latDegPerM];
    }
    return [cx + u * lngDegPerM, cy + v * latDegPerM];
  };

  if (outline?.closed && outline.vertices.length >= 3) {
    const assessment = assessDeckOutline(outline);
    const localPolygon = assessment.outline.vertices.map((vertex): [number, number] => [
      vertex.xMm / 1000 - width / 2,
      vertex.yMm / 1000 - depth / 2,
    ]);
    localPolygon.push(localPolygon[0]);
    return { polygons: [localPolygon.map(toCoordinate)], area: assessment.areaSqM };
  }

  if (shape === 'rectangle') {
    const polygon = localRectangle(width, depth).map(toCoordinate);
    return { polygons: [polygon], area: depth * width };
  }

  if (shape === 'l-shape') {
    const localPolygon: [number, number][] = [
      [-width / 2, -depth / 2],
      [-width / 2 + width * 0.6, -depth / 2],
      [-width / 2 + width * 0.6, 0],
      [width / 2, 0],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
      [-width / 2, -depth / 2],
    ];
    const polygon = localPolygon.map(toCoordinate);
    const area = width * depth * 0.7; // approximate
    return { polygons: [polygon], area };
  }

  // wraparound: two rectangles along two walls
  const polygon1 = localRectangle(width, depth * 0.3, 0, -depth * 0.35).map(toCoordinate);
  const polygon2 = localRectangle(width * 0.3, depth, width * 0.35, 0).map(toCoordinate);
  const area = width * depth * 0.44; // approximate
  return { polygons: [polygon1, polygon2], area };
}

/**
 * Create a complete deck from parameters.
 */
export function createDeck(
  shape: DeckShape,
  parcel: Property['parcel'],
  depth: number,
  width: number,
  heightAboveGrade: number,
  attachedToHouse: boolean,
  houseWall: 'north' | 'south' | 'east' | 'west',
  snowLoad: number,
  building?: BuildingFootprint | null,
  sitePlacement?: DeckSitePlacement,
  layout?: DeckLayout,
  outline?: DeckOutline,
): Deck {
  const placement = sitePlacement || createDefaultSitePlacement({ parcel, buildings: building ? [building] : [], existingConditions: null }, width, attachedToHouse, houseWall);
  const deckOutline = outline || createDeckOutline(shape, width, depth);
  const { polygons, area } = generateDeckFootprint(
    shape, parcel, depth, width, heightAboveGrade, attachedToHouse, houseWall, building, placement, deckOutline
  );

  const structure = sizeStructure(depth, width, heightAboveGrade, snowLoad, { shape, attachedToHouse });
  const stairs = sizeStairs(heightAboveGrade);
  const guard = sizeGuards(heightAboveGrade);
  const deckLayout = layout || createDefaultDeckLayout(width, depth, attachedToHouse, structure.postSpacing, stairs.width);

  return {
    dimensions: { width, depth },
    footprint: {
      shape,
      outline: deckOutline,
      polygons,
      heightAboveGrade,
      attachedToHouse,
      houseWall,
    },
    sitePlacement: placement,
    layout: deckLayout,
    stairs,
    guard,
    structure,
    area,
  };
}

/** Rebuild geometry and table selections without discarding the user's finish and detail choices. */
export function rebuildDeck(
  current: Deck,
  property: Property,
  changes: Partial<{
    shape: DeckShape;
    width: number;
    depth: number;
    heightAboveGrade: number;
    attachedToHouse: boolean;
    houseWall: 'north' | 'south' | 'east' | 'west';
    sitePlacement: DeckSitePlacement;
    layout: DeckLayout;
    outline: DeckOutline;
  }>,
): Deck {
  if (!property.parcel) throw new Error('A parcel is required to rebuild the deck geometry.');
  const explicitOutline = changes.outline ? normalizeOutlineToOrigin(changes.outline) : null;
  const outlineAssessment = explicitOutline ? assessDeckOutline(explicitOutline) : null;
  if (outlineAssessment?.errors.length) throw new Error(outlineAssessment.errors.join(' '));
  const shape = explicitOutline ? classifyOutlineShape(explicitOutline) : changes.shape ?? current.footprint.shape;
  const width = outlineAssessment ? outlineAssessment.widthMm / 1000 : changes.width ?? current.dimensions.width;
  const depth = outlineAssessment ? outlineAssessment.depthMm / 1000 : changes.depth ?? current.dimensions.depth;
  const height = changes.heightAboveGrade ?? current.footprint.heightAboveGrade;
  const attached = changes.attachedToHouse ?? current.footprint.attachedToHouse;
  const wall = changes.houseWall ?? current.footprint.houseWall;
  const wallChanged = wall !== current.footprint.houseWall;
  const basePlacement = wallChanged
    ? createDefaultSitePlacement(property, width, attached, wall)
    : current.sitePlacement || createDefaultSitePlacement(property, width, attached, wall);
  const placement = changes.sitePlacement || {
    ...basePlacement,
    outwardGapM: attached ? 0 : Math.max(basePlacement.outwardGapM, 1),
    updatedAt: new Date().toISOString(),
  };
  const geometryChanged = Boolean(explicitOutline) || width !== current.dimensions.width || depth !== current.dimensions.depth || shape !== current.footprint.shape || attached !== current.footprint.attachedToHouse;
  const outline = explicitOutline || (geometryChanged
    ? createDeckOutline(shape, width, depth)
    : normalizeDeckOutline(current));
  const retainedLayout = changes.layout || (geometryChanged
    ? createDefaultDeckLayout(width, depth, attached, current.structure.postSpacing, current.stairs.width)
    : current.layout);
  const next = createDeck(shape, property.parcel, depth, width, height, attached, wall, property.snowLoad, property.buildings.find((building) => building.primary), placement, retainedLayout, outline);

  next.structure = {
    ...sizeStructure(depth, width, height, property.snowLoad, {
      treatment: current.structure.lumberTreatment,
      shape,
      attachedToHouse: attached,
    }),
    deckingMaterial: current.structure.deckingMaterial,
    deckingThickness: current.structure.deckingThickness,
    ledgerAttachment: current.structure.ledgerAttachment,
  };
  next.guard = { ...next.guard, ...current.guard };
  next.stairs = {
    ...next.stairs,
    enabled: current.stairs.enabled,
    edge: current.stairs.edge,
    width: current.stairs.width,
    treadRun: current.stairs.treadRun,
  };
  return next;
}

function localRectangle(width: number, depth: number, cx = 0, cy = 0): [number, number][] {
  return [
    [cx - width / 2, cy - depth / 2],
    [cx + width / 2, cy - depth / 2],
    [cx + width / 2, cy + depth / 2],
    [cx - width / 2, cy + depth / 2],
    [cx - width / 2, cy - depth / 2],
  ];
}

function boundsOf(polygon: LatLng[]) {
  return polygon.reduce((bounds, [lng, lat]) => ({
    minLng: Math.min(bounds.minLng, lng),
    maxLng: Math.max(bounds.maxLng, lng),
    minLat: Math.min(bounds.minLat, lat),
    maxLat: Math.max(bounds.maxLat, lat),
  }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });
}
