import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import type { Deck, Property } from '../types';
import { escapeXml, generatePermitPackage, issuePermitPackage } from './planSetGenerator';

const property = {
  address: { fullAddress: '12 A&B <Street>', civicNumber: '12', streetName: 'A&B', streetType: 'St', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: '', coordinates: [-123, 48], score: 100 },
  parcel: { pid: '000-000-001', pidRaw: '1', parcelName: '', planNumber: '1', municipality: 'Town of Sidney', ownerType: '', parcelClass: '', areaSqm: 465, polygon: [[-123,48],[-122.999,48],[-122.999,48.001],[-123,48.001],[-123,48]], center: [-122.9995,48.0005], geometrySource: 'live' },
  zoning: { zone: 'R2', setbacks: { front: 4.5, rear: 4.5, side: 2, exteriorSide: 3 }, maxLotCoverage: 45, maxHeight: 10.5, source: 'Bylaw 2275', notes: [] },
  buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [],
} satisfies Property;

const deck = {
  dimensions: { width: 4, depth: 3 }, area: 12,
  footprint: { shape: 'rectangle', polygons: [[[-123,48],[-122.9999,48],[-122.9999,47.9999],[-123,47.9999],[-123,48]]], heightAboveGrade: 0.6, attachedToHouse: true, houseWall: 'south' },
  stairs: { enabled: true, edge: 'south', width: .9, riserHeight: 150, numRisers: 4, treadRun: 280 },
  guard: { enabled: false, height: 900, openingMax: 100, material: 'wood' },
  structure: { joistSize: '2x8', joistSpacing: 400, joistSpecies: 'S-P-F #2', beamSize: '2-2x10', postSize: '6x6', postSpacing: 1.8, footingType: 'pad', footingSize: 300, footingDepth: 450, ledgerAttachment: 'Field-designed connection', deckingMaterial: 'cedar', deckingThickness: 25, lumberTreatment: 'incised', selection: { status: 'table-supported', sourceTitle: 'CWC deck guide', sourceUrl: 'https://example.com/cwc.pdf', sourceEdition: 'Revision 1', joistTable: 'Table 3a', beamTable: 'Table 5a', joistMaxSpanM: 3.49, beamLookupSpanM: 3, assumptions: ['S-P-F No.2'], exclusions: ['Footings'] } },
} satisfies Deck;

describe('permit package generator', () => {
  it('produces seven coordinated 11x17 sheets including connection details and calculations', () => {
    const result = generatePermitPackage(property, deck);
    expect(result.sheets).toHaveLength(7);
    expect(result.sheets.map((sheet) => sheet.id)).toContain('details');
    expect(result.sheets.map((sheet) => sheet.id)).toContain('calculations');
    expect(result.sheets.every((sheet) => sheet.svg.includes('viewBox="0 0 1700 1100"'))).toBe(true);
  });

  it('carries model dimensions, structure, review status, and load basis into sheets', () => {
    const result = generatePermitPackage(property, deck);
    const allSheets = result.sheets.map((sheet) => sheet.svg).join(' ');
    expect(allSheets).toContain('4000 mm');
    expect(allSheets).toContain('3000 mm');
    expect(allSheets).toContain('2x8');
    expect(allSheets).toContain('2.40 kPa');
    expect(allSheets).toContain('Beam coordinates');
    expect(allSheets).toContain('P1.1');
    expect(allSheets).toContain('2.650 m');
    expect(allSheets).toContain('NOT FOR CONSTRUCTION');
    expect(result.readiness.status).toBe('review-package');
    expect(result.manifest.designFingerprint).toMatch(/^DP-[A-F0-9]{8}$/);
    expect(allSheets).toContain(result.manifest.designFingerprint);
  });

  it('escapes address and user-controlled material text in SVG', () => {
    const result = generatePermitPackage(property, deck);
    expect(result.sheets[0].svg).toContain('12 A&amp;B &lt;Street&gt;');
    expect(escapeXml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('emits every drawing sheet as strict standalone SVG XML', () => {
    const result = generatePermitPackage(property, deck);
    for (const sheet of result.sheets) {
      const errors: string[] = [];
      const parsed = new DOMParser({ onError: (level, message) => { if (level !== 'warning') errors.push(message); } }).parseFromString(sheet.svg, 'image/svg+xml');
      expect(parsed.documentElement?.nodeName, sheet.title).toBe('svg');
      expect(errors, sheet.title).toEqual([]);
    }
  });

  it('carries revision-bound existing house and ledger inputs into the drawings', () => {
    const measuredProperty: Property = { ...property, existingConditions: {
      schema: 'existing-house-conditions/v1', status: 'field-input-unverified', houseWidthM: 8, houseDepthM: 6, wallHeightM: 3,
      attachmentWall: 'south', attachmentWallLengthM: 8, proposedLedgerLengthM: 4, rimBoardMaterial: 'solid-sawn', rimBoardDepthMm: 241,
      cladding: 'wood-siding', doorOpeningOffsetM: 1.2, doorOpeningWidthM: .9, doorThresholdHeightMm: 675, flashingFeasible: 'yes',
      measuredBy: 'Field Designer', measuredAt: '2026-07-18', notes: '', updatedAt: '2026-07-18T12:00:00Z',
    } };
    const result = generatePermitPackage(measuredProperty, deck);
    const drawings = result.sheets.map((sheet) => sheet.svg).join(' ');
    expect(drawings).toContain('Field Designer');
    expect(drawings).toContain('solid-sawn 241 mm');
    expect(drawings).toContain('threshold 675 mm');
    expect(drawings).toContain('EVIDENCE REQUIRED');
  });

  it('puts controlled issue metadata and unsigned professional sign-off fields on every sheet', () => {
    const result = generatePermitPackage(property, deck);
    for (const sheet of result.sheets) {
      expect(sheet.number).toMatch(/^[AS]\d\.\d$/);
      expect(sheet.revision).toBe(1);
      expect(sheet.designFingerprint).toBe(result.manifest.designFingerprint);
      expect(sheet.svg).toContain('REV 01');
      expect(sheet.svg).toContain('PROFESSIONAL SEAL / SIGNATURE');
      expect(sheet.svg).toContain('BLANK UNTIL APPLIED');
      expect(sheet.svg).toContain('NOT VALIDATED BY THIS SOFTWARE');
    }
    expect(result.sheets[0].svg).toContain('DRAWING ISSUE REGISTER');
  });

  it('carries governing loads, connection criteria, and professional checklist into the drawings', () => {
    const result = generatePermitPackage(property, deck);
    const details = result.sheets.find((sheet) => sheet.id === 'details')?.svg || '';
    const calculations = result.sheets.find((sheet) => sheet.id === 'calculations')?.svg || '';
    expect(result.report.quantities.governingPostReactionKn).toBeGreaterThan(result.report.quantities.estimatedPostReactionKn);
    expect(result.report.calculations).toHaveLength(6);
    expect(result.report.connectionSchedule.length).toBeGreaterThanOrEqual(10);
    expect(result.report.professionalChecklist).toHaveLength(9);
    expect(details).toContain('GOVERNING POST REACTION');
    expect(details).toContain('CONNECTION &amp; ENVELOPE SCHEDULE');
    expect(details).toContain('DESIGN REQUIRED');
    expect(calculations).toContain('TRACEABLE PRELIMINARY CALCULATIONS');
    expect(calculations).toContain('PROFESSIONAL REVIEW CHECKLIST');
  });

  it('reuses an unchanged issue and advances a changed design revision', () => {
    const first = issuePermitPackage(property, deck, []);
    const repeated = issuePermitPackage(property, deck, first.issueHistory);
    expect(repeated.issue.id).toBe(first.issue.id);
    expect(repeated.issueHistory).toHaveLength(1);

    const changedDeck: Deck = { ...deck, dimensions: { ...deck.dimensions, width: 4.5 }, area: 13.5 };
    const changed = issuePermitPackage(property, changedDeck, repeated.issueHistory);
    expect(changed.issue.revision).toBe(2);
    expect(changed.issue.supersedesDesignFingerprint).toBe(first.issue.designFingerprint);
    expect(changed.permitPackage.sheets.every((sheet) => sheet.revision === 2)).toBe(true);
    expect(changed.permitPackage.sheets[0].svg).toContain(first.issue.designFingerprint);
    expect(changed.permitPackage.sheets[0].svg).toContain(changed.issue.designFingerprint);
  });
});
