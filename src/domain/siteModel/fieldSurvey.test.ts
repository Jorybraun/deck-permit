import { describe, expect, it } from 'vitest';
import { emptyProperty } from '../../state/homeownerProjectStore';
import { assessExistingConditionFieldSurvey, recordExistingConditionFieldSurvey, type RecordExistingConditionFieldSurveyInput } from './fieldSurvey';
import { createSiteModel } from './siteModel';

function input(): RecordExistingConditionFieldSurveyInput {
  return { id: 'FS-1', recordedBy: 'Homeowner', recordedAt: '2026-07-18', instrument: 'laser-distance-meter', wallLengthMm: 8000, wallHeightMm: 3200, houseDepthMm: 9000, openings: [{ openingId: 'D1', kind: 'door', offsetMm: 1200, widthMm: 900, sillHeightMm: 850, heightMm: 2100 }], sourceEvidenceIds: [], notes: 'Datum is grade at wall start.' };
}

describe('existing-condition field worksheet', () => {
  it('admits a complete wall and opening worksheet into canonical geometry', () => {
    const base = createSiteModel(emptyProperty, new Date('2026-07-18T00:00:00.000Z'));
    const site = { ...base, designWall: { ...base.designWall, openings: [{ id: 'D1', kind: 'door' as const, offsetMm: 600, widthMm: 900, sillHeightMm: 750, heightMm: 2100, evidenceStatus: 'photo-observed' as const }] } };
    const recorded = recordExistingConditionFieldSurvey(site, input());
    expect(recorded).toMatchObject({ referenceSource: 'field-measurement', houseDepthMm: 9000, measuredBy: 'Homeowner', measuredAt: '2026-07-18', fieldSurvey: { id: 'FS-1', status: 'homeowner-recorded-unverified', wallLengthMm: 8000 } });
    expect(recorded.designWall).toMatchObject({ selectionStatus: 'field-measured', lengthMm: 8000, wallHeightMm: 3200, openings: [{ id: 'D1', offsetMm: 1200, sillHeightMm: 850, evidenceStatus: 'field-measured' }] });
    expect(assessExistingConditionFieldSurvey(recorded)).toMatchObject({ status: 'current-homeowner-unverified', current: true });
  });

  it('fails closed when geometry or datum changes after recording', () => {
    const base = createSiteModel(emptyProperty);
    const site = { ...base, designWall: { ...base.designWall, openings: [{ id: 'D1', kind: 'door' as const, offsetMm: 600, widthMm: 900, sillHeightMm: 750, heightMm: 2100, evidenceStatus: 'photo-observed' as const }] } };
    const recorded = recordExistingConditionFieldSurvey(site, input());
    expect(assessExistingConditionFieldSurvey({ ...recorded, designWall: { ...recorded.designWall, lengthMm: 8100 } })).toMatchObject({ status: 'stale', current: false, messages: expect.arrayContaining([expect.stringContaining('length changed')]) });
    expect(assessExistingConditionFieldSurvey({ ...recorded, terrain: { ...recorded.terrain, datum: { ...recorded.terrain.datum, elevationMm: 100 } } })).toMatchObject({ status: 'stale', current: false, messages: expect.arrayContaining([expect.stringContaining('vertical datum changed')]) });
  });

  it('requires every opening and rejects dimensions outside the measured wall', () => {
    const base = createSiteModel(emptyProperty);
    const site = { ...base, designWall: { ...base.designWall, openings: [{ id: 'D1', kind: 'door' as const, offsetMm: 600, widthMm: 900, sillHeightMm: 750, heightMm: 2100 }, { id: 'W1', kind: 'window' as const, offsetMm: 2400, widthMm: 1200, sillHeightMm: 1000, heightMm: 1200 }] } };
    expect(() => recordExistingConditionFieldSurvey(site, input())).toThrow(/missing opening measurement W1/);
    expect(() => recordExistingConditionFieldSurvey({ ...site, designWall: { ...site.designWall, openings: site.designWall.openings.slice(0, 1) } }, { ...input(), openings: [{ ...input().openings[0], offsetMm: 7600 }] })).toThrow(/extends beyond/);
  });

  it('does not accept a field-measured label without a controlled worksheet', () => {
    const base = createSiteModel(emptyProperty);
    const site = { ...base, designWall: { ...base.designWall, selectionStatus: 'field-measured' as const } };
    expect(assessExistingConditionFieldSurvey(site)).toEqual({ status: 'missing', current: false, messages: ['No controlled existing-condition field worksheet is recorded.'] });
  });
});
