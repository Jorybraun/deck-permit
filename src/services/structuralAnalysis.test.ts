import { describe, expect, it } from 'vitest';
import type { Deck, Property } from '../types';
import { analyzeStructure } from './structuralAnalysis';
import { evaluateSubmissionReadiness } from './submissionReadiness';
import { sizeStairs } from './deckSizing';

const property: Property = {
  address: null,
  parcel: null,
  zoning: null,
  buildableEnvelope: null,
  snowLoad: 1,
  buildings: [],
  evidence: [],
};

const deck: Deck = {
  dimensions: { width: 4, depth: 3 },
  area: 12,
  footprint: {
    shape: 'rectangle',
    polygons: [],
    heightAboveGrade: 0.3,
    attachedToHouse: true,
    houseWall: 'south',
  },
  stairs: { enabled: false, edge: 'south', width: 0.9, riserHeight: 150, numRisers: 2, treadRun: 280 },
  guard: { enabled: false, height: 900, openingMax: 100, material: 'wood' },
  structure: {
    joistSize: '2x8', joistSpacing: 400, joistSpecies: 'S-P-F #2, pressure-treated',
    beamSize: '2-2x10', postSize: '6x6', postSpacing: 1.8,
    footingType: 'Concrete pad footing', footingSize: 300, footingDepth: 450,
    ledgerAttachment: 'Connection design required after field verification',
    deckingMaterial: 'Cedar', deckingThickness: 25,
    lumberTreatment: 'incised',
    selection: {
      status: 'table-supported', sourceTitle: 'CWC deck guide', sourceUrl: 'https://example.com/cwc.pdf', sourceEdition: 'Revision 1',
      joistTable: 'Table 3a', beamTable: 'Table 5a', joistMaxSpanM: 3.49, beamLookupSpanM: 3,
      assumptions: ['S-P-F No.2'], exclusions: ['Footings'],
    },
  },
};

describe('structural design-basis report', () => {
  it('calculates a deterministic load path and quantities', () => {
    const report = analyzeStructure(property, deck, '2026-07-18T00:00:00.000Z');
    expect(report.designBasis.totalAreaLoadKpa).toBe(2.4);
    expect(report.quantities.joistCount).toBe(11);
    expect(report.quantities.postCount).toBe(4);
    expect(report.quantities.estimatedPostReactionKn).toBe(4.08);
    expect(report.quantities.actualPostSpacingM).toBe(1.334);
    expect(report.quantities.governingPostReactionKn).toBe(5.43);
    expect(report.quantities.totalDesignLoadKn).toBe(28.8);
    expect(report.quantities.joistMomentDemandKnM).toBe(1.08);
    expect(report.quantities.joistSpanUtilization).toBeCloseTo(3 / 3.49, 3);
    expect(report.calculations.find((calculation) => calculation.id === 'footing-bearing')?.equation).toContain('5.43 kN');
    expect(report.connectionSchedule.find((item) => item.id === 'ledger-house')).toMatchObject({ status: 'field-verification-required' });
    expect(report.professionalChecklist.find((item) => item.id === 'connections')).toMatchObject({ status: 'design-required' });
    expect(report.loadPath).toHaveLength(5);
  });

  it('keeps site and engineering facts as unresolved review gates', () => {
    const report = analyzeStructure(property, deck);
    expect(report.gates.find((gate) => gate.id === 'legal-survey')?.status).toBe('required');
    expect(report.gates.find((gate) => gate.id === 'deck-placement')?.status).toBe('required');
    expect(report.gates.find((gate) => gate.id === 'soil-frost')?.status).toBe('required');
    expect(report.gates.find((gate) => gate.id === 'structural-review')?.status).toBe('required');
    expect(report.checks.find((check) => check.id === 'ledger')?.status).toBe('blocked');
  });

  it('uses attributed field inputs for coordination but still requires professional review evidence', () => {
    const measuredProperty: Property = { ...property, existingConditions: {
      schema: 'existing-house-conditions/v1', status: 'field-input-unverified', houseWidthM: 8, houseDepthM: 6, wallHeightM: 3,
      attachmentWall: 'south', attachmentWallLengthM: 8, proposedLedgerLengthM: 4, rimBoardMaterial: 'solid-sawn', rimBoardDepthMm: 241,
      cladding: 'wood-siding', doorOpeningOffsetM: 1, doorOpeningWidthM: .9, doorThresholdHeightMm: 675, flashingFeasible: 'yes',
      measuredBy: 'Designer', measuredAt: '2026-07-18', notes: '', updatedAt: '2026-07-18T12:00:00Z',
    } };
    const report = analyzeStructure(measuredProperty, deck);
    expect(report.checks.find((check) => check.id === 'ledger')).toMatchObject({ status: 'review' });
    expect(report.gates.find((gate) => gate.id === 'house-field-check')).toMatchObject({ status: 'required' });
    expect(report.limitations.join(' ')).toContain('coordination inputs only');
    const narrowerDeck = { ...deck, dimensions: { ...deck.dimensions, width: 3 } };
    const invalidated = analyzeStructure(measuredProperty, narrowerDeck);
    expect(invalidated.checks.find((check) => check.id === 'ledger')?.status).toBe('blocked');
    expect(invalidated.checks.find((check) => check.id === 'ledger')?.basis).toContain('cannot exceed the deck width');
  });

  it('does not call a package ready while review gates remain', () => {
    const report = analyzeStructure(property, deck);
    const readiness = evaluateSubmissionReadiness(report);
    expect(readiness.status).toBe('review-package');
    expect(readiness.requiredCount).toBeGreaterThan(0);
  });

  it('models two beam lines and all supports for a freestanding deck', () => {
    const freestanding: Deck = { ...deck, footprint: { ...deck.footprint, attachedToHouse: false } };
    const report = analyzeStructure(property, freestanding);
    expect(report.quantities.beamCount).toBe(2);
    expect(report.quantities.postsPerBeam).toBe(4);
    expect(report.quantities.postCount).toBe(8);
    expect(report.quantities.ledgerReactionKn).toBe(0);
    expect(report.quantities.exteriorBeamReactionKn * 2).toBe(report.quantities.totalDesignLoadKn);
    expect(report.connectionSchedule.find((item) => item.id === 'ledger-house')?.requirement).toContain('freestanding lateral system');
  });

  it('sizes imperial two-foot deck stairs within the screening rise limit', () => {
    const stairs = sizeStairs(0.6096);
    expect(stairs.numRisers).toBe(4);
    expect(stairs.riserHeight).toBeLessThanOrEqual(200);
    expect(stairs.riserHeight).toBeGreaterThanOrEqual(125);
  });
});
