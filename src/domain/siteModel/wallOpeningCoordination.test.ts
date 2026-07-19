import { describe, expect, it } from 'vitest';
import { addPlatform, createEmptyDesign, rectangularBoundary } from '../deckDesign';
import { emptyProperty } from '../../state/homeownerProjectStore';
import { createSiteModel, updateSiteModel } from './siteModel';
import { assessWallOpeningCoordination } from './wallOpeningCoordination';

function siteWithOpening(opening: NonNullable<ReturnType<typeof createSiteModel>['designWall']['openings'][number]>) {
  return updateSiteModel(createSiteModel(emptyProperty, new Date('2026-07-18T00:00:00.000Z')), {}, { openings: [opening], rimDepthMm: 235 });
}

function platform(elevationMm: number, supportStrategy: 'auto' | 'ledger' | 'freestanding' = 'auto', yMm = 0) {
  const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, yMm, 4000, 3000), elevationMm, houseEdgeIndex: 0 });
  return { ...design, platforms: design.platforms.map((item) => ({ ...item, framingIntent: { ...item.framingIntent, supportStrategy } })) };
}

describe('wall opening coordination', () => {
  it('blocks a platform surface that reaches a window sill zone', () => {
    const site = siteWithOpening({ id: 'W1', kind: 'window', offsetMm: 800, widthMm: 1200, sillHeightMm: 900, heightMm: 1200, evidenceStatus: 'field-measured' });
    const assessment = assessWallOpeningCoordination(platform(875, 'freestanding'), site);
    expect(assessment.status).toBe('blocked');
    expect(assessment).toMatchObject({ schema: 'wall-opening-coordination/v2', profile: { schema: 'architectural-coordination-profile/v1' } });
    expect(assessment.checks).toContainEqual(expect.objectContaining({ kind: 'window-clearance', status: 'blocked', openingId: 'W1', platformId: 'P1', horizontalOverlapMm: 1200, ruleId: 'AC-04-window-deck-interaction', basisType: 'project-review-assumption' }));
  });

  it('reviews a low window without claiming its use or egress classification', () => {
    const site = siteWithOpening({ id: 'W1', kind: 'window', offsetMm: 800, widthMm: 1200, sillHeightMm: 900, heightMm: 1200, evidenceStatus: 'field-measured' });
    const assessment = assessWallOpeningCoordination(platform(450, 'freestanding'), site);
    expect(assessment.status).toBe('review');
    expect(assessment.checks.find((check) => check.kind === 'window-clearance')).toMatchObject({ status: 'review' });
    expect(assessment.checks.find((check) => check.kind === 'window-clearance')?.message).toContain('bedroom egress');
  });

  it('blocks a ledger zone that crosses an opening', () => {
    const site = siteWithOpening({ id: 'W1', kind: 'window', offsetMm: 800, widthMm: 1200, sillHeightMm: 250, heightMm: 1200, evidenceStatus: 'field-measured' });
    const assessment = assessWallOpeningCoordination(platform(450, 'ledger'), site);
    expect(assessment.checks).toContainEqual(expect.objectContaining({ kind: 'ledger-zone', status: 'blocked', horizontalOverlapMm: 1200 }));
  });

  it('passes a measured door landing within the design-screen threshold range', () => {
    const site = siteWithOpening({ id: 'D1', kind: 'door', offsetMm: 800, widthMm: 900, sillHeightMm: 750, heightMm: 2100, evidenceStatus: 'field-measured' });
    const assessment = assessWallOpeningCoordination(platform(650, 'freestanding'), site);
    expect(assessment.status).toBe('pass');
    expect(assessment.checks).toContainEqual(expect.objectContaining({ kind: 'door-access', status: 'pass' }));
  });

  it('keeps photo-observed dimensions in review even when provisional geometry clears', () => {
    const site = siteWithOpening({ id: 'W1', kind: 'window', offsetMm: 800, widthMm: 1200, sillHeightMm: 1800, heightMm: 900, evidenceStatus: 'photo-observed' });
    const assessment = assessWallOpeningCoordination(platform(450, 'freestanding'), site);
    expect(assessment.status).toBe('review');
    expect(assessment.checks).toContainEqual(expect.objectContaining({ kind: 'opening-evidence', status: 'review' }));
  });

  it('blocks a house edge that is detached from the selected wall datum', () => {
    const site = siteWithOpening({ id: 'W1', kind: 'window', offsetMm: 800, widthMm: 1200, sillHeightMm: 1800, heightMm: 900, evidenceStatus: 'field-measured' });
    const assessment = assessWallOpeningCoordination(platform(450, 'freestanding', 500), site);
    expect(assessment.checks).toContainEqual(expect.objectContaining({ kind: 'house-edge-alignment', status: 'blocked' }));
  });

  it('labels every numeric tolerance as an editable model or review assumption with traceable sources', () => {
    const assessment = assessWallOpeningCoordination(platform(450), siteWithOpening({ id: 'W1', kind: 'window', offsetMm: 800, widthMm: 1200, sillHeightMm: 900, heightMm: 1200, evidenceStatus: 'field-measured' }), 'Town of Sidney');
    const parameterizedRules = assessment.profile.rules.filter((rule) => rule.parameters.length > 0);
    expect(parameterizedRules.every((rule) => ['model-integrity', 'project-review-assumption'].includes(rule.classification))).toBe(true);
    expect(parameterizedRules.flatMap((rule) => rule.parameters).every((parameter) => parameter.editableAtProfessionalReview && parameter.unit === 'mm')).toBe(true);
    expect(assessment.profile.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'bcbc-2024-revision-2', locator: expect.stringContaining('Division B') }),
      expect.objectContaining({ id: 'sidney-residential-deck-guide', locator: expect.stringContaining('Plan Details') }),
    ]));
  });
});
