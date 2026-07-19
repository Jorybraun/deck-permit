import { describe, expect, it } from 'vitest';
import { emptyProperty } from '../../state/homeownerProjectStore';
import { assessSiteModel, createSiteModel, updateSiteModel } from './siteModel';

describe('design-wall opening evidence', () => {
  it('keeps photo-observed rear windows provisional until field measured', () => {
    const base = createSiteModel(emptyProperty, new Date('2026-07-18T00:00:00.000Z'));
    const site = updateSiteModel(base, {}, { openings: [{ id: 'W1', kind: 'window', offsetMm: 600, widthMm: 1200, sillHeightMm: 900, heightMm: 1200, evidenceStatus: 'photo-observed' }] });
    expect(assessSiteModel(site).warnings).toContain('window W1 is photo-observed; confirm its offset, width, sill, and head height in the field.');
  });

  it('rejects a measured opening whose head exceeds the wall', () => {
    const base = createSiteModel(emptyProperty, new Date('2026-07-18T00:00:00.000Z'));
    const site = updateSiteModel(base, {}, { openings: [{ id: 'W1', kind: 'window', offsetMm: 600, widthMm: 1200, sillHeightMm: 2500, heightMm: 1200, evidenceStatus: 'field-measured' }] });
    expect(assessSiteModel(site).errors).toContain('window W1 must fit inside the recorded wall height.');
  });
});
