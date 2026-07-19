import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { addCaptureEvidence, createSiteModel } from '../../domain/siteModel';
import { emptyProperty } from '../../state/homeownerProjectStore';
import { PhotoWallCalibrationPanel } from './PhotoWallCalibrationPanel';

describe('PhotoWallCalibrationPanel', () => {
  it('explains the measured two-axis workflow without presenting AI pixels as dimensions', () => {
    let site = createSiteModel(emptyProperty);
    site = { ...site, capture: addCaptureEvidence(site.capture, { id: 'wall-photo', category: 'design-wall', label: 'Rear wall', fileName: 'rear.jpg', mimeType: 'image/jpeg', byteSize: 1000, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T00:00:00.000Z' }) };
    const html = renderToStaticMarkup(<PhotoWallCalibrationPanel site={site} previewUrls={{ 'wall-photo': 'blob:test' }} onApply={vi.fn()} />);
    expect(html).toContain('Measure the wall from a calibrated photo');
    expect(html).toContain('H1 · measured horizontal start');
    expect(html).toContain('Known distances');
    expect(html).toContain('Enter measurements you actually took');
    expect(html).toContain('cannot infer scale from pixels');
    expect(html).toContain('Apply calibrated door to wall model');
  });
});
