import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { assessExistingConditionCapture, createExistingConditionCapture, type CaptureEvidence } from '../../domain/siteModel';
import { ExistingConditionCapturePanel } from './ExistingConditionCapturePanel';

describe('ExistingConditionCapturePanel', () => {
  it('offers one friendly capture zone with both camera and gallery entry, and tucks the detail + privacy text away', () => {
    const record: CaptureEvidence = {
      id: 'capture-1', category: 'design-wall', label: 'Rear wall', fileName: 'rear-wall.jpg', mimeType: 'image/jpeg', byteSize: 1234, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T12:00:00.000Z', status: 'homeowner-confirmed', notes: 'No visible damage.',
      viewpoint: 'Rear yard looking north', observationTags: ['complete-wall', 'wall-corners', 'window-opening', 'scale-reference'], referenceLabel: 'tape', referenceDimensionMm: 1000,
      aiCategoryGuess: 'design-wall', aiCategoryConfidence: .9,
    };
    const capture = { ...createExistingConditionCapture(), evidence: [record] };
    const html = renderToStaticMarkup(<ExistingConditionCapturePanel capture={capture} assessment={assessExistingConditionCapture(capture, { hasDoor: false })} previewUrls={{}} analyzing={false} onAddFiles={vi.fn()} onUpdateEvidence={vi.fn()} onRemoveEvidence={vi.fn()} onAnalyze={vi.fn()} onReviewAiObservation={vi.fn()} linkedAiOpeningRefs={[]} onPromoteAiOpening={vi.fn()} />);

    // One friendly capture zone with both entry points.
    expect(html).toContain('Add photos');
    expect(html).toContain('Take a photo');
    expect(html).toContain('capture="environment"');
    // A confident photo shows a tappable chip, not a fixed upload slot.
    expect(html).toContain('Looks like');
    expect(html).toContain('tap to change');
    // The detailed fields are collapsed behind "Add detail (optional)".
    expect(html).toContain('Add detail (optional)');
    expect(html).toContain('No visible damage.');
    expect(html).toContain('Rear yard looking north');
    // The privacy explanation is preserved, just tucked into a details toggle.
    expect(html).toContain('Why we ask, and how your photos are handled');
    expect(html).toContain('original image payloads are not persisted');
    expect(html).toContain('SHA-256');
  });

  it('asks "What\'s this one?" when a photo is still unsorted', () => {
    const record: CaptureEvidence = { id: 'capture-1', category: 'unsorted', label: 'Not sorted yet', fileName: 'mystery.jpg', mimeType: 'image/jpeg', byteSize: 1234, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T12:00:00.000Z', status: 'recorded-unverified', notes: '' };
    const capture = { ...createExistingConditionCapture(), evidence: [record] };
    const html = renderToStaticMarkup(<ExistingConditionCapturePanel capture={capture} assessment={assessExistingConditionCapture(capture, { hasDoor: false })} previewUrls={{}} analyzing={false} onAddFiles={vi.fn()} onUpdateEvidence={vi.fn()} onRemoveEvidence={vi.fn()} onAnalyze={vi.fn()} onReviewAiObservation={vi.fn()} linkedAiOpeningRefs={[]} onPromoteAiOpening={vi.fn()} />);
    expect(html).toContain('this one?');
    expect(html).toContain('Not needed');
  });

  it('offers an explicit provisional wall-object admission after the homeowner accepts an AI opening observation', () => {
    const record: CaptureEvidence = { id: 'capture-1', category: 'design-wall', label: 'Rear wall', fileName: 'rear-wall.jpg', mimeType: 'image/jpeg', byteSize: 1234, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T12:00:00.000Z', status: 'homeowner-confirmed', notes: '' };
    const capture = { ...createExistingConditionCapture(), evidence: [record], aiAnalyses: [{ schema: 'ai-photo-observation-draft/v1' as const, id: 'analysis-1', summary: 'Rear wall openings visible.', unknowns: ['Exact dimensions'], generation: { model: 'gemma-4-31b', responseId: 'response', generatedAt: '2026-07-18T12:00:00.000Z' }, observations: [{ id: 'observation-1', sourceEvidenceId: record.id, kind: 'window' as const, confidence: .9, description: 'Window visible.', measurementStatus: 'not-measured' as const, boundingBox: null, uncertainties: ['Perspective'], decision: 'homeowner-accepted' as const }] }] };
    const html = renderToStaticMarkup(<ExistingConditionCapturePanel capture={capture} assessment={assessExistingConditionCapture(capture, { hasDoor: false })} previewUrls={{}} analyzing={false} onAddFiles={vi.fn()} onUpdateEvidence={vi.fn()} onRemoveEvidence={vi.fn()} onAnalyze={vi.fn()} onReviewAiObservation={vi.fn()} linkedAiOpeningRefs={[]} onPromoteAiOpening={vi.fn()} />);
    expect(html).toContain('Add this window to your wall');
    expect(html).toContain('measure it');
    const linkedHtml = renderToStaticMarkup(<ExistingConditionCapturePanel capture={capture} assessment={assessExistingConditionCapture(capture, { hasDoor: false })} previewUrls={{}} analyzing={false} onAddFiles={vi.fn()} onUpdateEvidence={vi.fn()} onRemoveEvidence={vi.fn()} onAnalyze={vi.fn()} onReviewAiObservation={vi.fn()} linkedAiOpeningRefs={['analysis-1:observation-1']} onPromoteAiOpening={vi.fn()} />);
    expect(linkedHtml).toContain('Added to your wall');
  });
});
