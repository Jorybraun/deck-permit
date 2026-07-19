import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSiteModel } from '../../domain/siteModel';
import { emptyProperty } from '../../state/homeownerProjectStore';
import { ExistingConditionFieldSurveyPanel } from './ExistingConditionFieldSurveyPanel';

describe('ExistingConditionFieldSurveyPanel', () => {
  it('requires a controlled direct-measurement record instead of a status dropdown', () => {
    const base = createSiteModel(emptyProperty);
    const site = { ...base, designWall: { ...base.designWall, openings: [{ id: 'D1', kind: 'door' as const, offsetMm: 600, widthMm: 900, sillHeightMm: 750, heightMm: 2100, evidenceStatus: 'photo-observed' as const }] } };
    const html = renderToStaticMarkup(<ExistingConditionFieldSurveyPanel site={site} onRecord={vi.fn()} />);
    expect(html).toContain('Field verification worksheet');
    expect(html).toContain('only homeowner action that can mark this geometry field measured');
    expect(html).toContain('D1 offset');
    expect(html).toContain('I directly measured every value');
    expect(html).toContain('Record controlled field worksheet');
    expect(html).toContain('No controlled existing-condition field worksheet is recorded');
  });
});
