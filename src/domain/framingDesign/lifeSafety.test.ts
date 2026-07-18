import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, boundaryFromPoints, createEmptyDesign, rectangularBoundary, setPlatformEdgeRole, setStairConstruction } from '../deckDesign';
import { createSiteModel } from '../siteModel';
import type { Property } from '../../types';
import { assessDeckLifeSafety, guardAssembliesFromLifeSafety } from './lifeSafety';

const property: Property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] };

describe('deck guard and handrail life-safety screen', () => {
  it('screens every exposed platform edge against modeled adjacent surfaces within 1.2 m', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900, houseEdgeIndex: 0 });
    const assessment = assessDeckLifeSafety(design, createSiteModel(property));
    expect(assessment.platformEdges.filter((edge) => edge.guardRequired && edge.edgeRole === 'open')).toHaveLength(3);
    expect(assessment.platformEdges.find((edge) => edge.edgeRole === 'house')).toMatchObject({ guardIntent: 'protected-by-wall', status: 'pass' });
    expect(assessment.platformEdges.filter((edge) => edge.guardRequired && edge.edgeRole === 'open').every((edge) => edge.maximumDropMm === 900 && edge.requiredHeightMm === 900 && edge.openingLimitMm === 100)).toBe(true);
    const guards = guardAssembliesFromLifeSafety(design, assessment);
    expect(guards).toHaveLength(3);
    expect(guards.every((guard) => guard.requirement === 'code-required' && guard.maximumDropMm === 900 && guard.openingLimitMm === 100)).toBe(true);
  });

  it('keeps a low optional guard distinct from a code-required guard', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 3000, 2000), elevationMm: 450 });
    design = setPlatformEdgeRole(design, 'P1', 'P1-E2', 'guard');
    const assessment = assessDeckLifeSafety(design, createSiteModel(property));
    expect(assessment.platformEdges.find((edge) => edge.edgeId === 'P1-E2')).toMatchObject({ guardRequired: false, guardIntent: 'owner-selected-optional', requiredHeightMm: 900, status: 'review' });
    expect(guardAssembliesFromLifeSafety(design, assessment)[0]).toMatchObject({ requirement: 'owner-selected', maximumDropMm: 450 });
  });

  it('uses polygon winding to search outside the platform rather than the platform interior', () => {
    const reversed = boundaryFromPoints([[0, 0], [0, 3000], [4000, 3000], [4000, 0]]);
    const design = addPlatform(createEmptyDesign(), { boundary: reversed, elevationMm: 2000 });
    const assessment = assessDeckLifeSafety(design, createSiteModel(property));
    expect(assessment.platformEdges.every((edge) => edge.maximumDropMm === 2000 && edge.requiredHeightMm === 1070)).toBe(true);
  });

  it('blocks an exterior stair over three risers when no handrail intent is present', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 800 });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'terrain', elevationMm: 0 }, fromEdgeId: 'P1-E2', startMm: [4000, 1500], directionDeg: 0, widthMm: 900, riserCount: 4 });
    design = setStairConstruction(design, 'ST1', { handrailSides: 'none' });
    const stair = assessDeckLifeSafety(design, createSiteModel(property)).stairs[0];
    expect(stair).toMatchObject({ handrailRequired: true, minimumHandrailCount: 1, handrailIntentCount: 0, status: 'blocked', continuityResolved: false, guardAssemblyResolved: false });
    expect(stair.basis).toContain('at least one handrail is required');
  });
});
