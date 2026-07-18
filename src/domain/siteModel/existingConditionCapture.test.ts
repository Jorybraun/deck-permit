import { describe, expect, it } from 'vitest';
import { addCaptureEvidence, assessExistingConditionCapture, createExistingConditionCapture, removeCaptureEvidence, updateCaptureEvidence } from './existingConditionCapture';
import type { CaptureCategory } from './types';

const evidence = (id: string, category: CaptureCategory) => ({
  id, category, label: '', fileName: `${id}.jpg`, mimeType: 'image/jpeg', byteSize: 1000,
  sha256: id.padEnd(64, 'a').slice(0, 64), recordedAt: '2026-07-18T12:00:00.000Z',
});

describe('ExistingConditionCapture public contract', () => {
  it('requires overview, wall, grade, and a door image only when a door is modeled', () => {
    let capture = createExistingConditionCapture();
    capture = addCaptureEvidence(capture, evidence('1', 'house-overview'));
    capture = addCaptureEvidence(capture, evidence('2', 'design-wall'));
    capture = addCaptureEvidence(capture, evidence('3', 'grade-context'));
    expect(assessExistingConditionCapture(capture, { hasDoor: false }).readyForAiDraft).toBe(true);
    const withDoor = assessExistingConditionCapture(capture, { hasDoor: true });
    expect(withDoor.readyForAiDraft).toBe(false);
    expect(withDoor.requirements.find((item) => item.category === 'door-threshold')).toMatchObject({ required: true, status: 'missing' });
  });

  it('keeps recorded evidence distinct from homeowner confirmation', () => {
    let capture = addCaptureEvidence(createExistingConditionCapture(), evidence('1', 'house-overview'));
    expect(assessExistingConditionCapture(capture, { hasDoor: false }).requirements[0].status).toBe('recorded');
    capture = updateCaptureEvidence(capture, '1', { status: 'homeowner-confirmed', notes: 'Shows the complete rear elevation.' });
    expect(assessExistingConditionCapture(capture, { hasDoor: false }).requirements[0].status).toBe('confirmed');
    expect(capture.evidence[0].notes).toBe('Shows the complete rear elevation.');
  });

  it('rejects invalid files and removes metadata without mutating other records', () => {
    expect(() => addCaptureEvidence(createExistingConditionCapture(), { ...evidence('1', 'design-wall'), mimeType: 'text/plain' })).toThrow(/must be a JPEG/);
    let capture = addCaptureEvidence(createExistingConditionCapture(), evidence('1', 'design-wall'));
    capture = addCaptureEvidence(capture, evidence('2', 'grade-context'));
    expect(removeCaptureEvidence(capture, '1').evidence.map((record) => record.id)).toEqual(['2']);
  });
});
