import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { addPlatform, createEmptyDesign, rectangularBoundary, setPlatformFramingIntent } from '../domain/deckDesign';
import { generateFramingDesign } from '../domain/framingDesign';
import { createSiteModel, updateSiteModel } from '../domain/siteModel';
import type { ProfessionalReviewCycle, Property } from '../types';
import { buildCanonicalReviewIssue } from './canonicalReviewIssue';
import { buildProfessionalWorkPackages, PROFESSIONAL_WORK_RESOLUTION_SCHEMA, type ProfessionalWorkResolution } from './professionalWorkResolution';

const property: Property = {
  address: { fullAddress: '2423 Lovell Ave, Sidney, BC', civicNumber: '2423', streetName: 'Lovell', streetType: 'Ave', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: '', coordinates: [-123.4, 48.6], score: 99 },
  parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [],
};

describe('canonical professional review issue', () => {
  it('binds the model, framing, drawings, checks, and revision to one fingerprint', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
    design = setPlatformFramingIntent(design, 'P1', { supportStrategy: 'ledger' });
    const site = updateSiteModel(createSiteModel(property), { status: 'field-input-unverified', measuredBy: 'Homeowner' }, { selectionStatus: 'field-measured', lengthMm: 4000 });
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T12:00:00.000Z');

    const issue = buildCanonicalReviewIssue({ property, site, design, framing, revision: 4, issuedAt: '2026-07-18T12:05:00.000Z' });

    expect(issue.manifest).toMatchObject({ revision: 4, generatedAt: '2026-07-18T12:05:00.000Z', designFingerprint: expect.stringMatching(/^DP-[A-F0-9]{8}$/) });
    expect(issue.manifest.sheetIds).toEqual(expect.arrayContaining(['cover', 'existing-conditions', 'capture-schedule', 'site', 'deck-plan', 'foundations', 'foundation-schedule', 'framing', 'connection-schedule', 'elevations', 'sections', 'details', 'assembly-schedule', 'calculations', 'review-schedule']));
    expect(issue.reviewPackage.manifest).toEqual(issue.manifest);
    expect(issue.reviewPackage.reviewScope).toEqual({ discipline: 'structural', responsibleProfessional: 'engineer', acceptanceRequires: ['sealed-pdf', 'egbc-directory-confirmation', 'permit-to-practice', 'complete-work-package-resolutions'] });
    const reviewPageCount = Math.max(1, Math.ceil((framing.platformSystems.length + framing.checks.length + framing.reviewGates.length + framing.openingCoordination.profile.rules.length + framing.openingCoordination.profile.sources.length) / 8));
    expect(issue.reviewPackage.planset).toHaveLength(12 + Math.max(1, Math.ceil(framing.connections.length / 12)) + Math.max(1, Math.ceil(framing.footings.length / 15)) + reviewPageCount);
    expect(issue.reviewPackage.planset.every((sheet) => sheet.revision === 4 && sheet.designFingerprint === issue.manifest.designFingerprint)).toBe(true);
    expect(issue.reviewPackage.deck.canonical).toMatchObject({ schema: 'permitly-canonical-review-snapshot/v1', units: 'mm', design: { schema: 'deck-design/v1' }, framing: { schema: 'framing-design/v2' } });
    expect(issue.reviewPackage.cadExchange).toMatchObject({ schema: 'permitly-project-cad-exchange/v1', units: 'mm', designFingerprint: issue.manifest.designFingerprint, notForConstruction: true });
    expect(issue.reviewPackage.cadExchange?.dxf).toContain(issue.manifest.designFingerprint);
    expect(issue.reviewPackage.calculationReport).toMatchObject({ schema: 'permitly-canonical-calculation-report/v2', designFingerprint: issue.manifest.designFingerprint, revision: 4, notForConstruction: true });
    expect(issue.reviewPackage.planset.some((sheet) => sheet.svg.includes('AC-03-door-landing-transition') && sheet.svg.includes('PROJECT REVIEW ASSUMPTION'))).toBe(true);
    expect(issue.reviewPackage.calculationReport?.connections.length).toBe(framing.connections.length);
    expect(issue.reviewPackage.report.checks.length).toBeGreaterThan(0);
  });

  it('adds only a complete accepted exact-revision professional resolution record to the drawings', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
    design = setPlatformFramingIntent(design, 'P1', { supportStrategy: 'ledger' });
    const site = updateSiteModel(createSiteModel(property), { status: 'field-input-unverified', measuredBy: 'Homeowner' }, { selectionStatus: 'field-measured', lengthMm: 4000 });
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T12:00:00.000Z');
    const base = buildCanonicalReviewIssue({ property, site, design, framing, revision: 4, issuedAt: '2026-07-18T12:05:00.000Z' });
    const report = base.reviewPackage.calculationReport!;
    const workPackages = buildProfessionalWorkPackages(report);
    const structuralResolutions: ProfessionalWorkResolution[] = workPackages.map((workPackage, index) => ({
      schema: PROFESSIONAL_WORK_RESOLUTION_SCHEMA,
      id: `resolution-${String(index + 1).padStart(3, '0')}`,
      designFingerprint: report.designFingerprint,
      workPackageId: workPackage.id,
      kind: workPackage.kind,
      disposition: 'specified',
      specification: `Selected assembly for ${workPackage.id}`,
      capacityBasis: `Sealed calculation section ${index + 1}`,
      documentReference: `SK-${String(index + 1).padStart(2, '0')} / Calc ${index + 1}`,
      notes: 'Coordinate with the sealed drawing and product data.',
      recordedAt: '2026-07-18T12:15:00.000Z',
    }));
    const acceptedCycle: ProfessionalReviewCycle = {
      id: 'cycle-accepted-001', exchangeProjectId: 'review-001', sourceDesignFingerprint: report.designFingerprint,
      decision: 'accepted', issuerName: 'A. Engineer', issuerRole: 'engineer', professionalDiscipline: 'structural', licenseNumber: 'EGBC-12345', firmName: 'Deck Structure Engineering Ltd.', permitToPracticeNumber: '1000123',
      importedAt: '2026-07-18T12:20:00.000Z', evidenceId: 'sealed-review-evidence-001', redlines: [], resolutions: [], structuralResolutions,
    };

    const coordinated = buildCanonicalReviewIssue({ property, site, design, framing, reviewCycles: [acceptedCycle], revision: 4, issuedAt: '2026-07-18T12:05:00.000Z' });
    const resolutionSheets = coordinated.reviewPackage.planset.filter((sheet) => sheet.id === 'professional-resolutions' || sheet.id.startsWith('professional-resolutions-'));
    expect(resolutionSheets).toHaveLength(Math.max(1, Math.ceil(workPackages.length / 6)));
    expect(resolutionSheets.map((sheet) => sheet.number)).toEqual(resolutionSheets.map((_, index) => `R1.${index}`));
    expect(resolutionSheets[0].svg).toContain('ACCEPTED PROFESSIONAL REVIEW COORDINATION');
    expect(resolutionSheets[0].svg).toContain('sealed-review-evidence-001');
    expect(resolutionSheets[0].svg).toContain('Deck Structure Engineering Ltd.');
    expect(resolutionSheets[0].svg).toContain('Permit to Practice 1000123');
    expect(resolutionSheets[0].svg).toContain(report.designFingerprint);
    expect(resolutionSheets[0].svg).toContain('SUPPLEMENTAL RECORD — NOT A SEAL');
    for (const sheet of resolutionSheets) {
      const errors: string[] = [];
      const xml = new DOMParser({ onError: (_level, message) => errors.push(message) }).parseFromString(sheet.svg, 'image/svg+xml');
      expect(errors, sheet.number).toEqual([]);
      expect(xml.documentElement!.tagName).toBe('svg');
    }
    for (const workPackage of workPackages) expect(resolutionSheets.filter((sheet) => sheet.svg.includes(workPackage.id))).toHaveLength(1);
    const connectionCount = structuralResolutions.filter((resolution) => resolution.kind === 'connection').length;
    const detailSheet = coordinated.reviewPackage.planset.find((sheet) => sheet.number === 'A4.0')?.svg || '';
    expect(detailSheet).toContain('Resolved packages');
    expect(detailSheet).toContain(`${connectionCount} of ${framing.connections.length}`);
    expect(detailSheet).toContain('MACHINE RECORD SUPPLEMENTS SEALED PROFESSIONAL EVIDENCE');
    expect(coordinated.reviewPackage.planset.find((sheet) => sheet.number === 'A0.0')?.svg).toContain(resolutionSheets.length === 1 ? 'R1.0' : `R1.0–R1.${resolutionSheets.length - 1}`);

    const staleCycle = { ...acceptedCycle, sourceDesignFingerprint: 'DP-00000000', structuralResolutions: structuralResolutions.map((resolution) => ({ ...resolution, designFingerprint: 'DP-00000000' })) };
    const withoutStale = buildCanonicalReviewIssue({ property, site, design, framing, reviewCycles: [staleCycle], revision: 4, issuedAt: '2026-07-18T12:05:00.000Z' });
    expect(withoutStale.reviewPackage.planset.some((sheet) => sheet.id === 'professional-resolutions')).toBe(false);
    expect(() => buildCanonicalReviewIssue({ property, site, design, framing, reviewCycles: [{ ...acceptedCycle, structuralResolutions: structuralResolutions.slice(1) }], revision: 4, issuedAt: '2026-07-18T12:05:00.000Z' })).toThrow(/remain unanswered/);
  });
});
