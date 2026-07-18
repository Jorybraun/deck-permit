import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary } from '../../domain/deckDesign';
import { assessDeckLifeSafety } from '../../domain/framingDesign';
import { createSiteModel } from '../../domain/siteModel';
import type { Property } from '../../types';
import { StairSafetyPanel } from './DesignStage';

const property: Property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] };

describe('live stair permit screen', () => {
  it('shows the same landing, width, stringer, and headroom findings used by the permit model', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    design = addPlatform(design, { boundary: rectangularBoundary(4710, 1200, 2600, 600), elevationMm: 450 });
    design = addStair(design, {
      from: { kind: 'platform', platformId: 'P1' },
      to: { kind: 'platform', platformId: 'P2' },
      fromEdgeId: 'P1-E2',
      toEdgeId: 'P2-E4',
      startMm: [4000, 1500],
      endMm: [4710, 1500],
      directionDeg: 0,
      widthMm: 900,
      riserCount: 3,
      treadDepthMm: 355,
    });
    const assessment = assessDeckLifeSafety(design, createSiteModel(property)).stairs[0];
    const html = renderToStaticMarkup(<StairSafetyPanel assessment={assessment} />);
    expect(html).toContain('Live stair permit screen');
    expect(html).toContain('Fix the blocked plan geometry before permit review.');
    expect(html).toContain('Blocked · does not fit');
    expect(html).toContain('900 / 860 mm min');
    expect(html).toContain('450 / 900 mm max');
    expect(html).toContain('1950 mm min · unverified');
  });
});
