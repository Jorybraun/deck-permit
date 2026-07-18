import type { Deck, Property, ComplianceIssue, LatLng } from '../types';
import { assessSitePlacement } from './sitePlacement';
import { assessDeckLayout } from './deckLayout';

/**
 * Compliance engine for BC deck permits.
 *
 * Checks against:
 * - BC Building Code 2024, Division B, Part 9
 *   - Section 9.4: Structural Requirements (loads, deflection)
 *   - Section 9.8: Stairs, Ramps, Landings, Handrails and Guards
 *   - Section 9.12: Excavation (foundation depth)
 *   - Section 9.15: Footings and Foundations
 *   - Section 9.17: Columns
 * - Town of Sidney Zoning Bylaw No. 2275 (setbacks, lot coverage)
 *
 * References:
 * - BCBC 2024: https://www2.gov.bc.ca/gov/content/industry/construction-industry/building-codes-standards/bc-codes/2024-bc-codes
 * - Sidney deck guide: https://www.sidney.ca/wp-content/uploads/Residential-Deck-Construction.pdf
 * - BC Housing deck guide: https://www.bchousing.org/sites/default/files/rcg-documents/2022-04/IG-Building-Safe-Durable-Decks-Balconies.pdf
 */

export function runComplianceCheck(deck: Deck, property: Property): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  issues.push(...checkSitePlacement(deck, property));
  issues.push(...checkDeckLayout(deck));
  issues.push(...checkSetbacks(deck, property));
  issues.push(...checkLotCoverage(deck, property));
  issues.push(...checkGuards(deck));
  issues.push(...checkStairs(deck));
  issues.push(...checkStructure(deck));
  issues.push(...checkFootings(deck, property));
  issues.push(...checkLedger(deck));
  issues.push(...checkEngineerRequired(deck, property));

  return issues;
}

function checkDeckLayout(deck: Deck): ComplianceIssue[] {
  if (!deck.dimensions || !deck.footprint || !deck.structure || !deck.stairs) return [];
  const assessment = assessDeckLayout(deck);
  return assessment.errors.map((message, index) => ({
    id: `deck-layout-${index}`,
    severity: 'error' as const,
    category: 'structure' as const,
    message,
    codeRef: 'Parametric framing and stair layout coordination',
    fix: 'Correct beam offsets, post stations, or stair/landing coordinates in the Structure step.',
    resolved: false,
  }));
}

function checkSitePlacement(deck: Deck, property: Property): ComplianceIssue[] {
  // Legacy/imported snapshots may predate the parametric dimensions record.
  if (!deck.dimensions || !deck.footprint) return [];
  const assessment = assessSitePlacement(property, deck);
  return assessment.errors.map((message, index) => ({
    id: `site-placement-${index}`,
    severity: 'error' as const,
    category: 'setback' as const,
    message,
    codeRef: 'Site coordination — dimensioned house-wall placement',
    fix: 'Correct the attachment-wall offsets and record who measured them and when.',
    resolved: false,
  }));
}

/**
 * Setback compliance — check deck footprint against zoning setbacks.
 * The envelope is a GIS screening aid until street frontage and legal yards are confirmed.
 */
function checkSetbacks(deck: Deck, property: Property): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const checkedPoints = new Set<string>();
  if (!property.buildableEnvelope || !property.zoning) return issues;

  // Check each deck polygon point against the buildable envelope
  for (const polygon of deck.footprint.polygons) {
    for (const point of polygon) {
      const pointKey = `${point[0]}:${point[1]}`;
      if (checkedPoints.has(pointKey)) continue;
      checkedPoints.add(pointKey);
      if (!pointInPolygon(point[0], point[1], property.buildableEnvelope)) {
        issues.push({
          id: `setback-${point[0]}-${point[1]}`,
          severity: 'warning',
          category: 'setback',
          message: 'Deck extends beyond the provisional GIS setback envelope.',
          codeRef: 'Sidney Zoning Bylaw No. 2275 — verify yard orientation',
          fix: 'Confirm legal boundaries and front/rear/side yards, then revise the deck location or apply the verified setback interpretation.',
          resolved: false,
          canvasMarker: { type: 'point', position: point },
        });
      }
    }
  }

  return issues;
}

function checkLotCoverage(deck: Deck, property: Property): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  if (!property.parcel || !property.zoning) return issues;

  const lotArea = property.parcel.areaSqm;
  const rooflineArea = property.buildings.reduce((total, building) => total + building.areaSqm, 0);
  const coveragePercent = (((rooflineArea + deck.area) / lotArea) * 100);

  if (coveragePercent > property.zoning.maxLotCoverage) {
    issues.push({
      id: 'lot-coverage',
      severity: 'warning',
      category: 'zoning',
      message: `GIS rooflines plus the deck estimate ${coveragePercent.toFixed(1)}% coverage, above the ${property.zoning.maxLotCoverage}% maximum.`,
      codeRef: 'Sidney Zoning Bylaw No. 2275 — estimated screening check',
      fix: 'Have a qualified designer calculate zoning-defined lot coverage from verified building dimensions and confirm it with Town planning staff.',
      resolved: false,
    });
  }

  return issues;
}

/**
 * Guard compliance per BCBC 9.8.8.
 */
function checkGuards(deck: Deck): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const heightMm = deck.footprint.heightAboveGrade * 1000;

  // Guards required when deck > 600mm above grade (BCBC 9.8.8.1)
  if (heightMm > 600 && !deck.guard.enabled) {
    issues.push({
      id: 'guard-required',
      severity: 'error',
      category: 'guard',
      message: 'Guards are required — your deck is more than 600 mm above grade.',
      codeRef: 'BCBC 9.8.8.1',
      fix: 'Enable guards on all open sides.',
      resolved: false,
    });
  }

  if (deck.guard.enabled) {
    // Height check per BCBC 9.8.8.3
    const requiredHeight = heightMm > 1800 ? 1070 : 900;
    if (deck.guard.height < requiredHeight) {
      issues.push({
        id: 'guard-height',
        severity: 'error',
        category: 'guard',
        message: `Guard height is ${deck.guard.height} mm — minimum is ${requiredHeight} mm for your deck height.`,
        codeRef: 'BCBC 9.8.8.3',
        fix: `Raise guard to ${requiredHeight} mm.`,
        resolved: false,
      });
    }

    // Opening size check per BCBC 9.8.8.5 (100mm sphere rule)
    if (deck.guard.openingMax > 100) {
      issues.push({
        id: 'guard-opening',
        severity: 'error',
        category: 'guard',
        message: `Guard openings exceed 100 mm — no opening may allow passage of a 100 mm sphere.`,
        codeRef: 'BCBC 9.8.8.5',
        fix: 'Reduce spacing between balusters/pickets to 100 mm or less.',
        resolved: false,
      });
    }
  }

  return issues;
}

/**
 * Stair compliance per BCBC 9.8.4.
 */
function checkStairs(deck: Deck): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  if (!deck.stairs.enabled) return issues;

  const { riserHeight, treadRun, width } = deck.stairs;

  // Rise: 125-200mm for private stairs (BCBC 9.8.4.1, Table 9.8.4.1)
  if (riserHeight < 125 || riserHeight > 200) {
    issues.push({
      id: 'stair-rise',
      severity: 'error',
      category: 'stair',
      message: `Stair rise is ${riserHeight} mm — must be 125–200 mm for private stairs.`,
      codeRef: 'BCBC 9.8.4.1',
      fix: riserHeight < 125 ? 'Increase riser height to at least 125 mm.' : 'Decrease riser height to at most 200 mm (add a step).',
      resolved: false,
      canvasMarker: { type: 'line', edge: deck.stairs.edge },
    });
  }

  // Run: 255-355mm for private stairs (BCBC 9.8.4.2, Table 9.8.4.2)
  if (treadRun < 255 || treadRun > 355) {
    issues.push({
      id: 'stair-run',
      severity: 'error',
      category: 'stair',
      message: `Stair run is ${treadRun} mm — must be 255–355 mm for private stairs.`,
      codeRef: 'BCBC 9.8.4.2',
      fix: treadRun < 255 ? 'Increase tread depth to at least 255 mm.' : 'Decrease tread depth to at most 355 mm.',
      resolved: false,
      canvasMarker: { type: 'line', edge: deck.stairs.edge },
    });
  }

  // Width: minimum 860mm (BCBC 9.8.2.1)
  if (width < 0.86) {
    issues.push({
      id: 'stair-width',
      severity: 'error',
      category: 'stair',
      message: `Stair width is ${Math.round(width * 1000)} mm — minimum is 860 mm.`,
      codeRef: 'BCBC 9.8.2.1',
      fix: 'Widen stairs to at least 860 mm.',
      resolved: false,
      canvasMarker: { type: 'line', edge: deck.stairs.edge },
    });
  }

  return issues;
}

/**
 * Structural compliance per BCBC 9.4, 9.17, 9.23.
 */
function checkStructure(deck: Deck): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  if (deck.structure.selection.status !== 'table-supported') {
    issues.push({
      id: 'framing-engineering-required',
      severity: 'warning',
      category: 'structure',
      message: `The framing configuration is outside the encoded CWC table scope: ${deck.structure.selection.reason || 'the table selection was modified'}.`,
      codeRef: `${deck.structure.selection.sourceTitle} — ${deck.structure.selection.joistTable}/${deck.structure.selection.beamTable}`,
      fix: 'Use the generated review package for project-specific engineering design and replace the preliminary member schedule with the accepted design.',
      resolved: false,
    });
  }

  // Joist spacing max 600mm (BCBC 9.23.1.1 / BC Housing guide)
  if (deck.structure.joistSpacing > 600) {
    issues.push({
      id: 'joist-spacing',
      severity: 'error',
      category: 'structure',
      message: `Joist spacing is ${deck.structure.joistSpacing} mm — maximum is 600 mm for Part 9.`,
      codeRef: 'BCBC 9.23.1.1',
      fix: 'Reduce joist spacing to 600 mm or less (typically 400 mm or 600 mm).',
      resolved: false,
    });
  }

  // Post size: minimum 140x140mm rectangular (BCBC 9.17.4.1)
  const postSizeMatch = deck.structure.postSize.match(/(\d+)x(\d+)/);
  if (postSizeMatch) {
    const nominalInches = Math.min(parseInt(postSizeMatch[1]), parseInt(postSizeMatch[2]));
    const postDim = nominalInches >= 6 ? 140 : nominalInches >= 4 ? 89 : nominalInches * 25.4;
    if (postDim < 140 && deck.footprint.heightAboveGrade > 0.6) {
      issues.push({
        id: 'post-size',
        severity: 'warning',
        category: 'structure',
        message: `Post size is ${deck.structure.postSize} — BCBC minimum is 140×140 mm for decks over 600 mm high.`,
        codeRef: 'BCBC 9.17.4.1',
        fix: 'Use 6×6 (140×140 mm) or larger posts.',
        resolved: false,
      });
    }
  }

  // Decking thickness vs joist spacing (BC Housing guide)
  if (deck.structure.joistSpacing >= 600 && deck.structure.deckingThickness < 38) {
    issues.push({
      id: 'decking-thickness',
      severity: 'warning',
      category: 'structure',
      message: `Decking is ${deck.structure.deckingThickness} mm thick — needs 38 mm at 600 mm joist spacing.`,
      codeRef: 'BCBC 9.30.3.1',
      fix: 'Use 38 mm (2× nominal) decking, or reduce joist spacing to 400 mm.',
      resolved: false,
    });
  }

  return issues;
}

/**
 * Footing/foundation compliance per BCBC 9.12, 9.15.
 */
function checkFootings(deck: Deck, _property: Property): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  // BC low-deck exemption (BCBC 9.12.2.2(7)):
  // Exempt from depth rules if: ≤1 storey, ≤55 m², joists ≤600mm above ground, no roof, not attached
  const exemptEligible =
    deck.area <= 55 &&
    deck.footprint.heightAboveGrade <= 0.6 &&
    !deck.footprint.attachedToHouse;

  if (!exemptEligible && deck.structure.footingDepth < 450) {
    issues.push({
      id: 'footing-depth',
      severity: 'warning',
      category: 'footing',
      message: `Footing depth is ${deck.structure.footingDepth} mm — may need to extend below frost depth unless exempt.`,
      codeRef: 'BCBC 9.12.2.2',
      fix: 'Extend footings below local frost depth, or qualify for the low-deck exemption (≤55 m², ≤600 mm high, detached, no roof).',
      resolved: false,
    });
  }

  // Footing size check — simplified
  if (deck.structure.footingSize < 300) {
    issues.push({
      id: 'footing-size',
      severity: 'warning',
      category: 'footing',
      message: `Footing is ${deck.structure.footingSize} mm square — bearing capacity has not been verified for site soil and post reactions.`,
      codeRef: 'BCBC 9.15.3',
      fix: 'Size footings from calculated reactions, allowable soil bearing, frost protection, and local inspection requirements.',
      resolved: false,
    });
  }

  return issues;
}

/**
 * Ledger attachment check.
 */
function checkLedger(deck: Deck): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  if (!deck.footprint.attachedToHouse) return issues;

  if (!deck.structure.ledgerAttachment || deck.structure.ledgerAttachment === 'none') {
    issues.push({
      id: 'ledger-missing',
      severity: 'error',
      category: 'ledger',
      message: 'Ledger attachment is required for an attached deck, but the existing wall substrate and connection are not specified.',
      codeRef: 'BCBC 9.23.6.2',
      fix: 'Field-verify the existing framing and have the fastener type, spacing, edge distances, flashing, and lateral connection reviewed for the actual wall assembly.',
      resolved: false,
    });
  }

  return issues;
}

/**
 * Check if engineer stamp is required.
 */
function checkEngineerRequired(deck: Deck, _property: Property): ComplianceIssue[] {
  const outsideSimplePrescriptiveScope = deck.area > 55 || deck.footprint.heightAboveGrade > 3 || deck.structure.joistSpacing > 600;
  return [{
    id: 'qualified-structural-review',
    severity: 'warning',
    category: 'structure',
    message: outsideSimplePrescriptiveScope
      ? 'The model is outside one or more simple prescriptive assumptions; registered-professional design may be required.'
      : 'Structural spans, connections, guards, lateral restraint, footings, and site conditions still require qualified review.',
    codeRef: 'BCBC 2024 Division C 2.2.7; confirm scope with Sidney Building Officials',
    fix: 'Provide the generated design-basis report and drawings to a qualified designer or structural engineer and record accepted revisions.',
    resolved: false,
  }];
}

function pointInPolygon(x: number, y: number, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
