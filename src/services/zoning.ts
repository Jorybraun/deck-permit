import type { ZoningInfo, Parcel } from '../types';

/**
 * Sidney BC zoning lookup.
 *
 * Source: Town of Sidney Zoning Bylaw No. 2275, consolidated July 21, 2025.
 * The parcel's zone code is supplied by the Town's public GIS property layer.
 */

interface SidneyZone {
  zone: string;
  description: string;
  setbacks: { front: number; rear: number; side: number; exteriorSide: number };
  maxLotCoverage: number;
  maxHeight: number;
}

// Current neighbourhood-residential regulations in Bylaw 2275, sections 5.2.1–5.2.2.
const SIDNEY_ZONES: Record<string, SidneyZone> = {
  R1: {
    zone: 'R1',
    description: 'Neighbourhood Residential',
    setbacks: { front: 4.5, rear: 3.0, side: 2.0, exteriorSide: 3.0 },
    maxLotCoverage: 50,
    maxHeight: 10.5,
  },
  R2: {
    zone: 'R2',
    description: 'Neighbourhood Residential',
    setbacks: { front: 4.5, rear: 4.5, side: 2.0, exteriorSide: 3.0 },
    maxLotCoverage: 45,
    maxHeight: 10.5,
  },
  R1ESA: {
    zone: 'R1-ESA',
    description: 'Neighbourhood Residential — Environmentally Sensitive Area',
    setbacks: { front: 3.0, rear: 5.5, side: 2.0, exteriorSide: 3.0 },
    maxLotCoverage: 35,
    maxHeight: 10.5,
  },
  R2ESA: {
    zone: 'R2-ESA',
    description: 'Neighbourhood Residential — Environmentally Sensitive Area',
    // Base row is lots ≤1000 m²; lookupZoning overrides for larger lots.
    setbacks: { front: 4.5, rear: 5.5, side: 2.0, exteriorSide: 3.0 },
    maxLotCoverage: 30,
    maxHeight: 10.5,
  },
  R3: {
    zone: 'R3',
    description: 'Neighbourhood Residential',
    setbacks: { front: 3.0, rear: 3.0, side: 1.5, exteriorSide: 3.0 },
    maxLotCoverage: 50,
    maxHeight: 10.5,
  },
  R4: {
    zone: 'R4',
    description: 'Summergate Village Residential',
    setbacks: { front: 3.0, rear: 1.5, side: 1.5, exteriorSide: 3.0 },
    maxLotCoverage: 40,
    maxHeight: 7.0,
  },
};

/**
 * Look up zoning for a parcel in Sidney, BC.
 */
export function lookupZoning(parcel: Parcel): ZoningInfo {
  const zoneCode = normalizeZone(parcel.zoningCode);
  const zone = SIDNEY_ZONES[zoneCode];
  if (!zone) {
    throw new Error(`The parcel zone “${parcel.zoningCode || 'unknown'}” is not yet supported by the deck rules engine.`);
  }

  // Some zones have lot-area-dependent setbacks (Bylaw 2275, §5.2.1–5.2.2).
  let setbacks = zone.setbacks;
  let maxLotCoverage = zone.maxLotCoverage;
  if (zoneCode === 'R1' && parcel.areaSqm <= 400) {
    setbacks = { front: 3.0, rear: 3.0, side: 1.2, exteriorSide: 3.0 };
  } else if (zoneCode === 'R2ESA' && parcel.areaSqm > 1000) {
    setbacks = { front: 4.5, rear: 7.5, side: 3.0, exteriorSide: 4.5 };
    maxLotCoverage = 20;
  }

  const isEsa = zoneCode.endsWith('ESA');
  return {
    zone: zone.zone,
    setbacks,
    maxLotCoverage,
    maxHeight: zone.maxHeight,
    source: 'Town of Sidney Zoning Bylaw No. 2275 (consolidated July 21, 2025), Sections 5.2.1–5.2.2',
    notes: [
      `${zone.zone}: ${zone.description}; zone code retrieved from Town GIS.`,
      'The displayed 10.5 m height limit is the lower-pitch limit; roofs steeper than 3:12 may be permitted up to 12.0 m.',
      'Street frontage and yard classification must be confirmed before relying on the setback envelope.',
      'Uncovered stairs and landings may have limited setback projections under Section 5.1.6; the design checker does not apply that exception automatically.',
      ...(isEsa ? ['NATURAL BOUNDARY: on lots abutting the sea/water, no structure may be built within 15 m of the natural boundary (§5.2.3.b) — this governs a waterfront deck over the yard setbacks. Seawalls/retaining walls are exempt.'] : []),
    ],
  };
}

function normalizeZone(value?: string): string {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Snow load lookup for BC locations.
 * Victoria area: 1.0 kPa (minimum per BCBC 9.4.2.2(2))
 * Source: BC Housing Illustrated Guide, Table of design snow loads.
 */
export function lookupSnowLoad(lat: number, lng: number): number {
  // Victoria/Sidney area: 1.0 kPa minimum
  // This is a simplification — proper implementation would use NBC climate data
  if (lat > 48.0 && lat < 49.0 && lng > -124.0 && lng < -123.0) {
    return 1.0; // Victoria/Sidney
  }
  return 1.9; // Default to BC minimum occupancy load
}
