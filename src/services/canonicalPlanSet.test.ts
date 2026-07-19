import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary } from '../domain/deckDesign';
import { generateFramingDesign } from '../domain/framingDesign';
import { addCaptureEvidence, createSiteModel, recordAiPhotoAnalysis, selectHouseWall } from '../domain/siteModel';
import type { Property } from '../types';
import { canonicalPlanFingerprint, generateCanonicalPlanSet } from './canonicalPlanSet';

const property: Property = {
  address: { fullAddress: '2433 Lovell Ave, Sidney, BC', civicNumber: '2433', streetName: 'Lovell', streetType: 'Ave', locality: 'Sidney', localityType: 'Town', province: 'BC', postalCode: '', coordinates: [-123.399, 48.659], score: 100 },
  parcel: { pid: '000-111-222', pidRaw: '000111222', parcelName: 'Test parcel', planNumber: 'VIP123', municipality: 'Town of Sidney', ownerType: '', parcelClass: '', areaSqm: 720, polygon: [[-123.400, 48.658], [-123.398, 48.658], [-123.398, 48.660], [-123.400, 48.660], [-123.400, 48.658]], center: [-123.399, 48.659], geometrySource: 'live' },
  buildings: [{ id: 'house', primary: true, areaSqm: 100, kind: 'building-footprint', sourceId: 'sidney-gis', confidence: 'medium', polygon: [[-123.3995, 48.6590], [-123.3988, 48.6590], [-123.3988, 48.6593], [-123.3995, 48.6593], [-123.3995, 48.6590]] }],
  zoning: { zone: 'R2', setbacks: { front: 4.5, rear: 4.5, side: 2, exteriorSide: 3 }, maxLotCoverage: 45, maxHeight: 10.5, source: 'Town of Sidney test fixture', notes: [] }, buildableEnvelope: null, snowLoad: 1,
  evidence: [{ id: 'parcel', label: 'Town parcel layer', url: 'https://example.test/parcel', authority: 'municipal', retrievedAt: '2026-07-18T00:00:00.000Z', status: 'reference' }],
};

describe('canonical coordinated review set', () => {
  it('derives coordinated, parseable 11×17 sheets from the current design and framing graph', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Upper deck', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
    design = addPlatform(design, { name: 'Lower deck', boundary: rectangularBoundary(4710, 0, 3500, 3000), elevationMm: 450 });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'platform', platformId: 'P2' }, fromEdgeId: 'P1-E2', toEdgeId: 'P2-E4', startMm: [4000, 1500], endMm: [4710, 1500], directionDeg: 0, riserCount: 3, treadDepthMm: 355 });
    const selectedSite = selectHouseWall(createSiteModel(property), property, 'house', 0);
    let capture = addCaptureEvidence(selectedSite.capture, { id: 'capture-wall', category: 'design-wall', label: 'Complete wall', fileName: 'wall.jpg', mimeType: 'image/jpeg', byteSize: 1200, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T00:00:00.000Z', status: 'homeowner-confirmed', notes: 'Cladding appears intact.', viewpoint: 'Rear yard looking toward house', observationTags: ['complete-wall', 'wall-corners', 'scale-reference'], referenceLabel: 'tape', referenceDimensionMm: 1000 });
    capture = recordAiPhotoAnalysis(capture, { schema: 'ai-photo-observation-draft/v1', id: 'analysis-1', summary: 'Door visible.', unknowns: ['Exact dimensions'], generation: { model: 'gemma-4-31b', responseId: 'response', generatedAt: '2026-07-18T00:00:00.000Z' }, observations: [{ id: 'observation-1', sourceEvidenceId: 'capture-wall', kind: 'door', confidence: .94, description: 'Exterior door is visible on the selected wall.', measurementStatus: 'not-measured', boundingBox: null, uncertainties: ['Perspective'], decision: 'homeowner-accepted' }] });
    const site = { ...selectedSite, capture, measuredBy: 'Homeowner', yardReference: { ...selectedSite.yardReference, status: 'homeowner-selected' as const, frontEdgeIndex: 0, rearEdgeIndex: 2, selectedBy: 'Homeowner', selectedAt: '2026-07-18T00:00:00.000Z' }, designWall: { ...selectedSite.designWall, openings: [{ id: 'D1', kind: 'door' as const, offsetMm: 900, widthMm: 1800, sillHeightMm: 120, evidenceStatus: 'field-measured' as const, sourceEvidenceIds: ['capture-wall'], sourceAiObservationRefs: ['analysis-1:observation-1'] }] } };
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T00:00:00.000Z');
    const planSet = generateCanonicalPlanSet({ property, site, design, framing, issuedAt: '2026-07-18T00:00:00.000Z' });

    expect(planSet.fingerprint).not.toBe(`DP-${framing.inputFingerprint.slice(-8).toUpperCase()}`);
    const connectionPageCount = Math.max(1, Math.ceil(framing.connections.length / 12));
    const connectionNumbers = Array.from({ length: connectionPageCount }, (_, index) => `S2.${index + 1}`);
    const foundationPageCount = Math.max(1, Math.ceil(framing.footings.length / 15));
    const foundationNumbers = Array.from({ length: foundationPageCount }, (_, index) => `S1.${index + 1}`);
    const sectionNumbers = design.platforms.map((_, index) => `S3.${index}`);
    const capturePageCount = Math.max(1, Math.ceil(site.capture.evidence.length / 8));
    const captureNumbers = Array.from({ length: capturePageCount }, (_, index) => `C1.${index + 1}`);
    const reviewControlCount = framing.platformSystems.length + framing.checks.length + framing.reviewGates.length + framing.openingCoordination.profile.rules.length + framing.openingCoordination.profile.sources.length;
    const reviewPageCount = Math.max(1, Math.ceil(reviewControlCount / 8));
    const reviewNumbers = Array.from({ length: reviewPageCount }, (_, index) => `S4.${index + 1}`);
    expect(planSet.sheets).toHaveLength(10 + capturePageCount + foundationPageCount + connectionPageCount + sectionNumbers.length + reviewPageCount);
    expect(planSet.sheets.map((sheet) => sheet.number)).toEqual(['A0.0', 'C1.0', ...captureNumbers, 'A1.0', 'A2.0', 'S1.0', ...foundationNumbers, 'S2.0', ...connectionNumbers, 'A3.0', ...sectionNumbers, 'A4.0', 'A4.1', 'S4.0', ...reviewNumbers]);
    expect(planSet.sheets.every((sheet) => sheet.designFingerprint === planSet.fingerprint)).toBe(true);
    for (const sheet of planSet.sheets) {
      const errors: string[] = [];
      const xml = new DOMParser({ onError: (_level, message) => errors.push(message) }).parseFromString(sheet.svg, 'image/svg+xml');
      expect(errors, sheet.number).toEqual([]);
      expect(xml.documentElement!.tagName).toBe('svg');
      expect(xml.documentElement!.getAttribute('width')).toBe('1700');
      expect(sheet.svg).toContain(planSet.fingerprint);
      expect(sheet.svg).toContain('PROFESSIONAL REVIEW');
      expect(sheet.svg).toContain('NOT FOR CONSTRUCTION');
      expect(sheet.svg).toContain('BLANK UNTIL APPLIED');
    }
    const siteSheet = planSet.sheets.find((sheet) => sheet.number === 'A1.0')?.svg || '';
    expect(siteSheet).toContain('SELECTED HOUSE WALL');
    expect(siteSheet).toContain('SITE / COVERAGE SCHEDULE');
    expect(siteSheet).toContain('REFERENCE SETBACK SCREEN');
    expect(siteSheet).toContain('FRONT · PL-1');
    expect(siteSheet).toContain('FRONT SETBACK · 4.50 m');
    expect(siteSheet).toContain('setback-band');
    expect(siteSheet).toContain('PL-1 · P1');
    expect(siteSheet).toContain('site-stair');
    expect(siteSheet).toContain('site-footing');
    expect(siteSheet).toContain('Municipal GIS is reference evidence, not a legal survey.');
    const existingSheet = planSet.sheets.find((sheet) => sheet.number === 'C1.0')?.svg || '';
    expect(existingSheet).toContain('EXISTING HOUSE WALL AND OPENING RECORD');
    expect(existingSheet).toContain('D1 · 1800 W × 2100 H · SILL 120 · FIELD-MEASURED');
    expect(existingSheet).toContain('AI REF analysis-1:observation-1');
    expect(existingSheet).toContain('MEASUREMENT / DATUM PROVENANCE');
    expect(existingSheet).toContain('EXISTING-CONDITION EVIDENCE REGISTER');
    expect(existingSheet).toContain('fully scheduled on C1.1+');
    const captureSchedules = planSet.sheets.filter((sheet) => sheet.id === 'capture-schedule' || sheet.id.startsWith('capture-schedule-'));
    expect(captureSchedules).toHaveLength(1);
    expect(captureSchedules[0].svg).toContain('PHOTO OBSERVATIONS &amp; INTEGRITY RECORDS');
    expect(captureSchedules[0].svg).toContain('Rear yard looking toward house');
    expect(captureSchedules[0].svg).toContain('complete-wall, wall-corners, scale-reference');
    expect(captureSchedules[0].svg).toContain('tape · 1000 mm');
    expect(captureSchedules[0].svg).toContain('SHA aaaaaaaaaaaaaaaa…');
    expect(captureSchedules[0].svg).toContain('AI ACCEPTED DOOR observation-1');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A2.0')?.svg).toContain('DECK, LANDING, STAIR AND GUARD PLAN');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A2.0')?.svg).toContain('STAIR 1 · 900 WIDE · 3R');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A2.0')?.svg).toContain('900H · DROP 900');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S1.0')?.svg).toContain('FOOTING / POST COORDINATE SCHEDULE');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S1.0')?.svg).toContain('FOUNDATION DESIGN GATE');
    const foundationSchedules = planSet.sheets.filter((sheet) => sheet.id === 'foundation-schedule' || sheet.id.startsWith('foundation-schedule-'));
    expect(foundationSchedules).toHaveLength(foundationPageCount);
    expect(foundationSchedules[0].svg).toContain('FOOTING &amp; POST DESIGN CONTROL');
    expect(foundationSchedules[0].svg).toContain('DO NOT EXCAVATE FROM THIS SCHEDULE');
    expect(foundationSchedules[0].svg).toContain('SOIL, FROST, DEPTH, THICKNESS, REINFORCEMENT, UPLIFT');
    for (const footing of framing.footings) expect(foundationSchedules.filter((sheet) => sheet.svg.includes(footing.id))).toHaveLength(1);
    expect(planSet.sheets.find((sheet) => sheet.number === 'S2.0')?.svg).toContain('Stair framing');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S2.0')?.svg).toContain('ST1-FROM-HDR');
    expect(planSet.sheets.find((sheet) => sheet.number === 'S2.0')?.svg).toContain('P1-C1');
    const connectionSchedules = planSet.sheets.filter((sheet) => sheet.id === 'connection-schedule' || sheet.id.startsWith('connection-schedule-'));
    expect(connectionSchedules).toHaveLength(connectionPageCount);
    expect(connectionSchedules[0].svg).toContain('KEYED STRUCTURAL CONNECTION DESIGN CONTROL');
    expect(connectionSchedules[0].svg).toContain('SOFTWARE DOES NOT SELECT OR CERTIFY HARDWARE');
    for (const connection of framing.connections) expect(connectionSchedules.filter((sheet) => sheet.svg.includes(connection.id))).toHaveLength(1);
    const elevationSheet = planSet.sheets.find((sheet) => sheet.number === 'A3.0')?.svg || '';
    expect(elevationSheet).toContain('E1 · HOUSE → YARD BUILDING SECTION / ELEVATION');
    expect(elevationSheet).toContain('E2 · SELECTED HOUSE WALL ELEVATION');
    expect(elevationSheet).toContain('UPPER DECK · TOP EL. 900');
    expect(elevationSheet).toContain('LOWER DECK · TOP EL. 450');
    expect(elevationSheet).toContain('STAIR 1 · 3R @ 150 · B → LOWER DECK');
    expect(elevationSheet).toContain('data-platform-id="P1"');
    expect(elevationSheet).toContain('P1-B1-P1-F');
    const sectionSheets = planSet.sheets.filter((sheet) => sheet.id === 'sections' || sheet.id.startsWith('sections-'));
    expect(sectionSheets).toHaveLength(2);
    expect(sectionSheets[0].svg).toContain('UPPER DECK · BUILDING SECTION');
    expect(sectionSheets[1].svg).toContain('LOWER DECK · BUILDING SECTION');
    expect(sectionSheets[0].svg).toContain('SECTION KEYNOTES · 1/2');
    expect(sectionSheets[1].svg).toContain('SECTION KEYNOTES · 2/2');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A0.0')?.svg).toContain('S3.0–S3.1');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('3 STRINGERS');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('355 RUN/GOING');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('LANDINGS: TOP PASS 900×900 · BOTTOM PASS 900×900');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('HEADROOM 1950 MIN · UNVERIFIED');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('450 O.C. / 900 MAX');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('GUARD CODE SCREEN / INTENT');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('OPENINGS: MAX 100 mm');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('TOP: ST1-FROM-CONN');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('KEYED STRUCTURAL CONNECTION SCHEDULE');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('ledger to house');
    expect(planSet.sheets.find((sheet) => sheet.number === 'A4.0')?.svg).toContain('HARDWARE / FASTENERS / CORROSION CLASS UNRESOLVED');
    const assemblySchedule = planSet.sheets.find((sheet) => sheet.number === 'A4.1')?.svg || '';
    expect(assemblySchedule).toContain('STAIR FLIGHT DESIGN CONTROL');
    expect(assemblySchedule).toContain('GUARD RUN DESIGN CONTROL');
    expect(assemblySchedule).toContain('ST1');
    expect(assemblySchedule).toContain('HEADROOM 1950 MIN');
    expect(assemblySchedule).toContain('UNVERIFIED');
    for (const guard of framing.guards) expect(assemblySchedule).toContain(guard.id);
    expect(assemblySchedule).toContain('REVIEWER MUST RESOLVE EVERY LISTED FLIGHT AND GUARD RUN');
    const calculationSheet = planSet.sheets.find((sheet) => sheet.number === 'S4.0')?.svg || '';
    expect(calculationSheet).toContain('PROFESSIONAL REVIEW GATES');
    expect(calculationSheet).toContain('SUMMARY ONLY');
    expect(calculationSheet).toContain('S4.1+');
    const reviewSchedules = planSet.sheets.filter((sheet) => sheet.id === 'review-schedule' || sheet.id.startsWith('review-schedule-'));
    expect(reviewSchedules).toHaveLength(reviewPageCount);
    expect(reviewSchedules[0].svg).toContain('SYSTEM SCREENS, CHECKS &amp; PROFESSIONAL WORK PACKAGES');
    expect(reviewSchedules[0].svg).toContain('A PASSING SOFTWARE SCREEN IS NOT A PROFESSIONAL ACCEPTANCE');
    for (const system of framing.platformSystems) expect(reviewSchedules.filter((sheet) => sheet.svg.includes(`SYS-${system.platformId}`))).toHaveLength(1);
    for (const check of framing.checks) expect(reviewSchedules.filter((sheet) => sheet.svg.includes(`CHECK-${check.id}`))).toHaveLength(1);
    for (const gate of framing.reviewGates) expect(reviewSchedules.filter((sheet) => sheet.svg.includes(`GATE-${gate.id}`))).toHaveLength(1);
    for (const rule of framing.openingCoordination.profile.rules) expect(reviewSchedules.filter((sheet) => sheet.svg.includes(rule.id))).toHaveLength(1);
    for (const source of framing.openingCoordination.profile.sources) expect(reviewSchedules.filter((sheet) => sheet.svg.includes(`SRC-${source.id}`))).toHaveLength(1);

    const movedDoorSite = { ...site, designWall: { ...site.designWall, openings: [{ ...site.designWall.openings[0], offsetMm: 1200 }] } };
    expect(canonicalPlanFingerprint({ property, site: movedDoorSite, design, framing })).not.toBe(planSet.fingerprint);
    expect(canonicalPlanFingerprint({ property: { ...property, parcel: { ...property.parcel!, pid: '999-888-777' } }, site, design, framing })).not.toBe(planSet.fingerprint);
    expect(canonicalPlanFingerprint({ property, site: { ...site, updatedAt: '2099-01-01T00:00:00.000Z' }, design, framing: { ...framing, generatedAt: '2099-01-01T00:00:00.000Z' } })).toBe(planSet.fingerprint);
  });

  it('paginates every generated guard run instead of clipping a larger project', () => {
    let design = createEmptyDesign();
    for (let index = 0; index < 4; index += 1) {
      design = addPlatform(design, { name: `Deck ${index + 1}`, boundary: rectangularBoundary(index * 5000, 0, 3000, 2400), elevationMm: 900 });
    }
    let site = selectHouseWall(createSiteModel(property), property, 'house', 0);
    for (let index = 0; index < 17; index += 1) {
      site = { ...site, capture: addCaptureEvidence(site.capture, { id: `ev-${String(index + 1).padStart(2, '0')}-id`, category: index % 2 ? 'design-wall' : 'house-overview', label: `Photo ${index + 1}`, fileName: `photo-${index + 1}.jpg`, mimeType: 'image/jpeg', byteSize: 1000 + index, sha256: index.toString(16).padStart(64, '0'), recordedAt: '2026-07-18T00:00:00.000Z', observationTags: index % 2 ? ['complete-wall'] : ['house-context'], viewpoint: `View ${index + 1}` }) };
    }
    const framing = generateFramingDesign(design, site, { municipality: 'Town of Sidney', snowLoadKpa: 1 }, '2026-07-18T00:00:00.000Z');
    expect(framing.guards.length).toBeGreaterThan(15);

    const planSet = generateCanonicalPlanSet({ property, site, design, framing, issuedAt: '2026-07-18T00:00:00.000Z' });
    const scheduleSheets = planSet.sheets.filter((sheet) => sheet.id === 'assembly-schedule' || sheet.id.startsWith('assembly-schedule-'));
    expect(scheduleSheets.map((sheet) => sheet.number)).toEqual(['A4.1', 'A4.2']);
    expect(new Set(planSet.sheets.map((sheet) => sheet.number)).size).toBe(planSet.sheets.length);
    for (const guard of framing.guards) {
      expect(scheduleSheets.filter((sheet) => sheet.svg.includes(guard.id))).toHaveLength(1);
    }
    expect(planSet.sheets.find((sheet) => sheet.number === 'A0.0')?.svg).toContain('A4.1–A4.2');
    const foundationSheets = planSet.sheets.filter((sheet) => sheet.id === 'foundation-schedule' || sheet.id.startsWith('foundation-schedule-'));
    expect(foundationSheets.length).toBeGreaterThan(1);
    for (const footing of framing.footings) expect(foundationSheets.filter((sheet) => sheet.svg.includes(footing.id))).toHaveLength(1);
    expect(planSet.sheets.find((sheet) => sheet.number === 'A0.0')?.svg).toContain(`S1.1–S1.${foundationSheets.length}`);
    const connectionSheets = planSet.sheets.filter((sheet) => sheet.id === 'connection-schedule' || sheet.id.startsWith('connection-schedule-'));
    expect(connectionSheets.length).toBeGreaterThan(1);
    for (const connection of framing.connections) expect(connectionSheets.filter((sheet) => sheet.svg.includes(connection.id))).toHaveLength(1);
    expect(planSet.sheets.find((sheet) => sheet.number === 'A0.0')?.svg).toContain(`S2.1–S2.${connectionSheets.length}`);
    expect(planSet.sheets.find((sheet) => sheet.number === 'A0.0')?.svg).toContain('S3.0–S3.3');
    const captureSheets = planSet.sheets.filter((sheet) => sheet.id === 'capture-schedule' || sheet.id.startsWith('capture-schedule-'));
    expect(captureSheets.map((sheet) => sheet.number)).toEqual(['C1.1', 'C1.2', 'C1.3']);
    for (const record of site.capture.evidence) expect(captureSheets.filter((sheet) => sheet.svg.includes(record.id))).toHaveLength(1);
    expect(planSet.sheets.find((sheet) => sheet.number === 'A0.0')?.svg).toContain('C1.1–C1.3');
    const reviewSheets = planSet.sheets.filter((sheet) => sheet.id === 'review-schedule' || sheet.id.startsWith('review-schedule-'));
    expect(reviewSheets.length).toBeGreaterThan(1);
    for (const system of framing.platformSystems) expect(reviewSheets.filter((sheet) => sheet.svg.includes(`SYS-${system.platformId}`))).toHaveLength(1);
    for (const check of framing.checks) expect(reviewSheets.filter((sheet) => sheet.svg.includes(`CHECK-${check.id}`))).toHaveLength(1);
    for (const gate of framing.reviewGates) expect(reviewSheets.filter((sheet) => sheet.svg.includes(`GATE-${gate.id}`))).toHaveLength(1);
    expect(planSet.sheets.find((sheet) => sheet.number === 'A0.0')?.svg).toContain(`S4.1–S4.${reviewSheets.length}`);
  });
});
