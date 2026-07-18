import { describe, expect, it } from 'vitest';
import type { Deck, Property } from '../types';
import { formatRevision, resolveDrawingIssue } from './drawingIssues';

const property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] } satisfies Property;
const deck = {
  dimensions: { width: 4, depth: 3 }, area: 12,
  footprint: { shape: 'rectangle', polygons: [], heightAboveGrade: .6, attachedToHouse: false, houseWall: 'south' },
  stairs: { enabled: false, edge: 'south', width: .9, riserHeight: 150, numRisers: 4, treadRun: 280 },
  guard: { enabled: false, height: 900, openingMax: 100, material: 'wood' },
  structure: { joistSize: '2x8', joistSpacing: 400, joistSpecies: 'S-P-F #2', beamSize: '2-2x10', postSize: '6x6', postSpacing: 1.8, footingType: 'pad', footingSize: 300, footingDepth: 450, ledgerAttachment: '', deckingMaterial: 'cedar', deckingThickness: 25, lumberTreatment: 'incised', selection: { status: 'table-supported', sourceTitle: '', sourceUrl: '', sourceEdition: '', joistTable: '', beamTable: '', joistMaxSpanM: 3.5, beamLookupSpanM: 3, assumptions: [], exclusions: [] } },
} satisfies Deck;

describe('drawing issue control', () => {
  it('formats a conventional two-digit revision identifier', () => {
    expect(formatRevision(3)).toBe('REV 03');
  });

  it('keeps issue time stable when the exact design is generated again', () => {
    const first = resolveDrawingIssue(property, deck, [], '2026-07-18T10:00:00.000Z');
    const repeated = resolveDrawingIssue(property, deck, first.history, '2026-07-19T10:00:00.000Z');
    expect(repeated.issue.issuedAt).toBe('2026-07-18T10:00:00.000Z');
    expect(repeated.history).toEqual(first.history);
  });
});
