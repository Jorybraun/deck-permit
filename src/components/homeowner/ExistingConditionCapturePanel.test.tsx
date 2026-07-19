import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { assessExistingConditionCapture, createExistingConditionCapture, type CaptureEvidence } from '../../domain/siteModel';
import { ExistingConditionCapturePanel } from './ExistingConditionCapturePanel';

describe('ExistingConditionCapturePanel', () => {
  it('exposes a structured field record for every admitted photo', () => {
    const record: CaptureEvidence = {
      id: 'capture-1', category: 'design-wall', label: 'Rear wall', fileName: 'rear-wall.jpg', mimeType: 'image/jpeg', byteSize: 1234, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T12:00:00.000Z', status: 'homeowner-confirmed', notes: 'No visible damage.',
      viewpoint: 'Rear yard looking north', observationTags: ['complete-wall', 'wall-corners', 'window-opening', 'scale-reference'], referenceLabel: 'tape', referenceDimensionMm: 1000,
    };
    const capture = { ...createExistingConditionCapture(), evidence: [record] };
    const html = renderToStaticMarkup(<ExistingConditionCapturePanel capture={capture} assessment={assessExistingConditionCapture(capture, { hasDoor: false })} previewUrls={{}} onAddFiles={vi.fn()} onUpdateEvidence={vi.fn()} onRemoveEvidence={vi.fn()} onAnalyze={vi.fn()} onReviewAiObservation={vi.fn()} linkedAiOpeningRefs={[]} onPromoteAiOpening={vi.fn()} />);

    expect(html).toContain('Document what this photo proves');
    expect(html).toContain('Viewpoint / direction');
    expect(html).toContain('Visible observations');
    expect(html).toContain('Window opening visible');
    expect(html).toContain('Scale reference');
    expect(html).toContain('Length (mm)');
    expect(html).toContain('Condition notes');
    expect(html).toContain('Rear yard looking north');
    expect(html).toContain('No visible damage.');
    expect(html).toContain('Structured observations appear on C1.x');
    expect(html).toContain('sends the selected JPEG/PNG sources to Cerebras');
    expect(html).toContain('original image payloads are not persisted');
  });

  it('offers an explicit provisional wall-object admission after the homeowner accepts an AI opening observation', () => {
    const record: CaptureEvidence = { id: 'capture-1', category: 'design-wall', label: 'Rear wall', fileName: 'rear-wall.jpg', mimeType: 'image/jpeg', byteSize: 1234, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T12:00:00.000Z', status: 'homeowner-confirmed', notes: '' };
    const capture = { ...createExistingConditionCapture(), evidence: [record], aiAnalyses: [{ schema: 'ai-photo-observation-draft/v1' as const, id: 'analysis-1', summary: 'Rear wall openings visible.', unknowns: ['Exact dimensions'], generation: { model: 'gemma-4-31b', responseId: 'response', generatedAt: '2026-07-18T12:00:00.000Z' }, observations: [{ id: 'observation-1', sourceEvidenceId: record.id, kind: 'window' as const, confidence: .9, description: 'Window visible.', measurementStatus: 'not-measured' as const, boundingBox: null, uncertainties: ['Perspective'], decision: 'homeowner-accepted' as const }] }] };
    const html = renderToStaticMarkup(<ExistingConditionCapturePanel capture={capture} assessment={assessExistingConditionCapture(capture, { hasDoor: false })} previewUrls={{}} onAddFiles={vi.fn()} onUpdateEvidence={vi.fn()} onRemoveEvidence={vi.fn()} onAnalyze={vi.fn()} onReviewAiObservation={vi.fn()} linkedAiOpeningRefs={[]} onPromoteAiOpening={vi.fn()} />);
    expect(html).toContain('Add provisional window to wall measurement list');
    expect(html).toContain('Not measured · cannot set geometry');
    const linkedHtml = renderToStaticMarkup(<ExistingConditionCapturePanel capture={capture} assessment={assessExistingConditionCapture(capture, { hasDoor: false })} previewUrls={{}} onAddFiles={vi.fn()} onUpdateEvidence={vi.fn()} onRemoveEvidence={vi.fn()} onAnalyze={vi.fn()} onReviewAiObservation={vi.fn()} linkedAiOpeningRefs={['analysis-1:observation-1']} onPromoteAiOpening={vi.fn()} />);
    expect(linkedHtml).toContain('Added to wall measurement list');
  });
});
