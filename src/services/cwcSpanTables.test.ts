import { describe, expect, it } from 'vitest';
import { selectCwcFraming } from './cwcSpanTables';

const base = {
  joistSpanM: 3,
  joistSpacingMm: 400,
  speciesGroup: 'S-P-F',
  grade: 'No.2 or better',
  treatment: 'incised',
  postSpacingM: 1.8,
  heightAboveGradeM: 0.6,
  guardRequired: false,
  attachedSingleSpan: true,
  rectangular: true,
  snowLoadKpa: 1,
} as const;

describe('CWC framing table boundary', () => {
  it('selects exact incised S-P-F joist and beam rows', () => {
    const result = selectCwcFraming(base);
    expect(result.joistSize).toBe('2x8');
    expect(result.beamSize).toBe('2-2x6');
    expect(result.selection.status).toBe('table-supported');
    expect(result.selection.joistMaxSpanM).toBe(3.49);
    expect(result.selection.beamLookupSpanM).toBe(3);
    expect(result.selection.joistTable).toBe('Table 3a');
    expect(result.selection.beamTable).toBe('Table 5a');
  });

  it('enforces the guide minimum 2x8 joist where guards are required', () => {
    const result = selectCwcFraming({ ...base, joistSpanM: 1.5, guardRequired: true });
    expect(result.joistSize).toBe('2x8');
  });

  it('routes unsupported geometry and higher loads to engineering', () => {
    expect(selectCwcFraming({ ...base, rectangular: false }).selection.status).toBe('engineering-required');
    const snow = selectCwcFraming({ ...base, snowLoadKpa: 2.5 });
    expect(snow.selection.status).toBe('engineering-required');
    expect(snow.selection.reason).toContain('snow load');
  });

  it('does not silently cap a span beyond the tables', () => {
    const result = selectCwcFraming({ ...base, joistSpanM: 5.2 });
    expect(result.beamSize).toBe('ENGINEER DESIGN');
    expect(result.selection.status).toBe('engineering-required');
  });
});
