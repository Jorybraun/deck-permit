import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary, setPlatformElevation, setPlatformFinish } from '../domain/deckDesign';
import { estimateProject } from './projectEstimate';

describe('running homeowner project estimate', () => {
  it('grows with geometry and itemizes stairs, guards, supports, and finishes', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    const treated = estimateProject(design);
    design = setPlatformFinish(design, 'P1', { decking: 'Composite decking', guardSystem: 'Black aluminum guardrail' });
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'terrain', elevationMm: 0 }, startMm: [4000, 1500], directionDeg: 0 });
    const compositeWithStairs = estimateProject(design);
    expect(treated.areaSqM).toBe(12);
    expect(compositeWithStairs.materialLowCad).toBeGreaterThan(treated.materialLowCad);
    expect(compositeWithStairs.installedHighCad).toBeGreaterThan(compositeWithStairs.materialHighCad);
    expect(compositeWithStairs.lines.find((line) => line.id === 'stairs')?.basis).toContain('1 run');
    expect(compositeWithStairs.pricingMode).toBe('regional-allowance-not-live');
    expect(compositeWithStairs.lines.find((line) => line.id === 'decking')?.basis).toContain('Composite decking $145–265/m²');
    expect(compositeWithStairs.sources.length).toBeGreaterThan(0);
  });

  it('updates guard allowance when a platform crosses the guard-height screen', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 3000, 3000), elevationMm: 450 });
    expect(estimateProject(design).lines.find((line) => line.id === 'guards')?.highCad).toBe(0);
    design = setPlatformElevation(design, 'P1', 900);
    expect(estimateProject(design).lines.find((line) => line.id === 'guards')?.highCad).toBeGreaterThan(0);
  });
});
