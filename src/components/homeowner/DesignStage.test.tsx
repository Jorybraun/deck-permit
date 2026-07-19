import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, createEmptyDesign, rectangularBoundary } from '../../domain/deckDesign';
import { assessDeckLifeSafety } from '../../domain/framingDesign';
import { createSiteModel, recordExistingConditionFieldSurvey } from '../../domain/siteModel';
import type { Property } from '../../types';
import { platformDoorThresholdGuidance, StairSafetyPanel } from './DesignStage';

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

describe('platform door-threshold guidance', () => {
  it('uses a current controlled door measurement and refuses a status label alone', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 700, houseEdgeIndex: 0 });
    const platform = design.platforms[0];
    const base = createSiteModel(property);
    const withDoor = { ...base, designWall: { ...base.designWall, lengthMm: 8000, openings: [{ id: 'D1', kind: 'door' as const, offsetMm: 1200, widthMm: 900, sillHeightMm: 850, heightMm: 2100, evidenceStatus: 'field-measured' as const }] } };
    expect(platformDoorThresholdGuidance(platform, { ...withDoor, designWall: { ...withDoor.designWall, selectionStatus: 'field-measured' } }, 50)).toBeNull();
    const surveyed = recordExistingConditionFieldSurvey(withDoor, { id: 'FS-D1', recordedBy: 'Homeowner', recordedAt: '2026-07-18', instrument: 'laser-distance-meter', wallLengthMm: 8000, wallHeightMm: 3200, houseDepthMm: 9000, openings: [{ openingId: 'D1', kind: 'door', offsetMm: 1200, widthMm: 900, sillHeightMm: 850, heightMm: 2100 }], sourceEvidenceIds: [], notes: '' });
    expect(platformDoorThresholdGuidance(platform, surveyed, 50)).toEqual({ doorId: 'D1', thresholdElevationMm: 850, suggestedPlatformElevationMm: 800 });
  });
});
