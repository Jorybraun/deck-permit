import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { assessExistingConditionCapture, createExistingConditionCapture, type CaptureEvidence } from '../../domain/siteModel';
import { ExistingConditionCapturePanel } from './ExistingConditionCapturePanel';

describe('ExistingConditionCapturePanel', () => {
  it('exposes a structured field record for every admitted photo', () => {
    const record: CaptureEvidence = {
      id: 'capture-1', category: 'design-wall', label: 'Rear wall', fileName: 'rear-wall.jpg', mimeType: 'image/jpeg', byteSize: 1234, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T12:00:00.000Z', status: 'homeowner-confirmed', notes: 'No visible damage.',
      viewpoint: 'Rear yard looking north', observationTags: ['complete-wall', 'wall-corners', 'scale-reference'], referenceLabel: 'tape', referenceDimensionMm: 1000,
    };
    const capture = { ...createExistingConditionCapture(), evidence: [record] };
    const html = renderToStaticMarkup(<ExistingConditionCapturePanel capture={capture} assessment={assessExistingConditionCapture(capture, { hasDoor: false })} previewUrls={{}} onAddFiles={vi.fn()} onUpdateEvidence={vi.fn()} onRemoveEvidence={vi.fn()} />);

    expect(html).toContain('Document what this photo proves');
    expect(html).toContain('Viewpoint / direction');
    expect(html).toContain('Visible observations');
    expect(html).toContain('Scale reference');
    expect(html).toContain('Length (mm)');
    expect(html).toContain('Condition notes');
    expect(html).toContain('Rear yard looking north');
    expect(html).toContain('No visible damage.');
    expect(html).toContain('Structured observations appear on C1.x');
  });
});
