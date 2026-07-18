import { describe, expect, it } from 'vitest';
import { addPlatform, createEmptyDesign, rectangularBoundary, setPlatformFramingIntent } from '../domain/deckDesign';
import { generateFramingDesign } from '../domain/framingDesign';
import { createSiteModel, updateSiteModel } from '../domain/siteModel';
import type { Property } from '../types';
import { buildCanonicalReviewIssue } from './canonicalReviewIssue';

const property: Property = {
  address: { fullAddress: '2423 Lovell Ave, Sidney, BC', civicNumber: '2423', streetName: 'Lovell', streetType: 'Ave', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: '', coordinates: [-123.4, 48.6], score: 99 },
  parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [], existingConditions: null,
};

describe('canonical professional review issue', () => {
  it('binds the model, framing, drawings, checks, and revision to one fingerprint', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
    design = setPlatformFramingIntent(design, 'P1', { supportStrategy: 'ledger' });
    const site = updateSiteModel(createSiteModel(property), { status: 'field-input-unverified', measuredBy: 'Homeowner' }, { selectionStatus: 'field-measured', lengthMm: 4000 });
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T12:00:00.000Z');

    const issue = buildCanonicalReviewIssue({ property, site, design, framing, revision: 4, issuedAt: '2026-07-18T12:05:00.000Z' });

    expect(issue.manifest).toMatchObject({ revision: 4, generatedAt: '2026-07-18T12:05:00.000Z', designFingerprint: expect.stringMatching(/^DP-[A-F0-9]{8}$/), sheetIds: ['cover', 'site', 'framing', 'elevations', 'sections', 'details', 'calculations'] });
    expect(issue.reviewPackage.manifest).toEqual(issue.manifest);
    expect(issue.reviewPackage.planset).toHaveLength(7);
    expect(issue.reviewPackage.planset.every((sheet) => sheet.revision === 4 && sheet.designFingerprint === issue.manifest.designFingerprint)).toBe(true);
    expect(issue.reviewPackage.deck.canonical).toMatchObject({ schema: 'permitly-canonical-review-snapshot/v1', units: 'mm', design: { schema: 'deck-design/v1' }, framing: { schema: 'framing-design/v1' } });
    expect(issue.reviewPackage.report.checks.length).toBeGreaterThan(0);
  });
});
