import { describe, expect, it } from 'vitest';
import type { Deck, Property } from '../types';
import { assessExistingConditions, createExistingConditionsDraft, deriveHouseReference } from './existingConditions';

const property = {
  parcel: { center: [-123, 48] },
  buildings: [{ primary: true, polygon: [[-123,48],[-122.9999,48],[-122.9999,48.00005],[-123,48.00005],[-123,48]] }],
} as Property;
const deck = { dimensions: { width: 4, depth: 3 }, footprint: { houseWall: 'south', heightAboveGrade: 0.6 } } as Deck;

describe('existing-condition boundary', () => {
  it('derives editable reference dimensions without claiming field authority', () => {
    const reference = deriveHouseReference(property);
    expect(reference.source).toBe('municipal-roofline');
    expect(reference.widthM).toBeGreaterThan(7);
    expect(reference.depthM).toBeGreaterThan(5);
    expect(createExistingConditionsDraft(property, deck, new Date('2026-07-18T12:00:00Z')).status).toBe('field-input-unverified');
  });

  it('requires attribution and rejects impossible ledger and opening geometry', () => {
    const draft = createExistingConditionsDraft(property, deck, new Date('2026-07-18T12:00:00Z'));
    draft.proposedLedgerLengthM = 9;
    draft.doorOpeningOffsetM = draft.attachmentWallLengthM;
    const result = assessExistingConditions(draft, deck, new Date('2026-07-18T12:00:00Z'));
    expect(result.errors).toContain('Identify who recorded the field measurements.');
    expect(result.errors).toContain('Proposed ledger length cannot exceed the deck width.');
    expect(result.errors).toContain('Door opening must fit within the measured attachment wall.');
  });

  it('keeps unknown substrate and flashing as explicit review warnings', () => {
    const draft = createExistingConditionsDraft(property, deck, new Date('2026-07-18T12:00:00Z'));
    draft.measuredBy = 'Owner field input';
    const result = assessExistingConditions(draft, deck, new Date('2026-07-18T12:00:00Z'));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(3);
  });
});
