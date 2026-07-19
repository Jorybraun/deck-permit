import { describe, expect, it } from 'vitest';
import { emptyProperty } from '../../state/homeownerProjectStore';
import { addCaptureEvidence } from './existingConditionCapture';
import { applyPhotoWallCalibration, derivePhotoOpeningMeasurement, type ApplyPhotoWallCalibrationInput } from './photoWallCalibration';
import { createSiteModel } from './siteModel';

const geometry = {
  horizontalReference: { label: 'Measured wall segment', start: { x: .1, y: .8 }, end: { x: .9, y: .8 }, distanceMm: 8000 },
  verticalReference: { label: 'Laser height', start: { x: .1, y: .8 }, end: { x: .1, y: .2 }, distanceMm: 3000 },
  openingBox: { x: .3, y: .4, width: .2, height: .3 },
};

describe('photo wall calibration', () => {
  it('derives wall-plane opening dimensions from two independent measured axes', () => {
    expect(derivePhotoOpeningMeasurement(geometry)).toMatchObject({ offsetMm: 2000, widthMm: 2000, sillHeightMm: 500, heightMm: 1500 });
  });

  it('rejects unusable axes and out-of-image boxes', () => {
    expect(() => derivePhotoOpeningMeasurement({ ...geometry, verticalReference: { ...geometry.verticalReference, end: { x: .9, y: .8 } } })).toThrow(/too parallel/);
    expect(() => derivePhotoOpeningMeasurement({ ...geometry, openingBox: { x: .9, y: .4, width: .2, height: .3 } })).toThrow(/fit inside/);
  });

  it('updates a source-bound opening and preserves a reviewable calibration record', () => {
    let site = createSiteModel(emptyProperty, new Date('2026-07-18T00:00:00.000Z'));
    site = { ...site, designWall: { ...site.designWall, lengthMm: 8000, wallHeightMm: 3500 }, capture: addCaptureEvidence(site.capture, { id: 'photo-1', category: 'design-wall', label: 'Rear wall', fileName: 'rear.jpg', mimeType: 'image/jpeg', byteSize: 1000, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T12:00:00.000Z' }) };
    const input: ApplyPhotoWallCalibrationInput = { id: 'cal-1', sourceEvidenceId: 'photo-1', openingId: null, openingKind: 'window', ...geometry, recordedBy: 'Homeowner', recordedAt: '2026-07-18' };
    const calibrated = applyPhotoWallCalibration(site, input);
    expect(calibrated.designWall.openings).toContainEqual(expect.objectContaining({ id: 'W1', kind: 'window', offsetMm: 2000, widthMm: 2000, sillHeightMm: 500, heightMm: 1500, evidenceStatus: 'scaled-photo-derived', sourceEvidenceIds: ['photo-1'] }));
    expect(calibrated.capture.wallCalibrations).toContainEqual(expect.objectContaining({ id: 'cal-1', openingId: 'W1', sourceEvidenceId: 'photo-1', status: 'homeowner-measured-unverified', result: { offsetMm: 2000, widthMm: 2000, sillHeightMm: 500, heightMm: 1500 } }));
  });

  it('will not pretend a calibration exists without an admitted photo and identified measurer', () => {
    const site = createSiteModel(emptyProperty);
    const input: ApplyPhotoWallCalibrationInput = { id: 'cal-1', sourceEvidenceId: 'missing', openingId: null, openingKind: 'door', ...geometry, recordedBy: '', recordedAt: '2026-07-18' };
    expect(() => applyPhotoWallCalibration(site, input)).toThrow(/source photo/);
    const withPhoto = { ...site, capture: addCaptureEvidence(site.capture, { id: 'photo-1', category: 'design-wall', label: 'Wall', fileName: 'wall.jpg', mimeType: 'image/jpeg', byteSize: 1000, sha256: 'a'.repeat(64), recordedAt: '2026-07-18T12:00:00.000Z' }) };
    expect(() => applyPhotoWallCalibration(withPhoto, { ...input, sourceEvidenceId: 'photo-1' })).toThrow(/Identify who/);
  });
});
