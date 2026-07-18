import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { captureEvidenceFromFile } from './captureFileStorage';

describe('capture file admission', () => {
  it('creates hashed local-only metadata for a supported photo', async () => {
    const file = new File(['house-wall'], 'wall.jpg', { type: 'image/jpeg' });
    const record = await captureEvidenceFromFile(file, 'design-wall', new Date('2026-07-18T12:00:00Z'));
    expect(record).toMatchObject({ category: 'design-wall', fileName: 'wall.jpg', mimeType: 'image/jpeg', byteSize: 10, status: 'recorded-unverified' });
    expect(record.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects unsupported uploads before storage', async () => {
    const file = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
    await expect(captureEvidenceFromFile(file, 'design-wall')).rejects.toThrow(/not a supported photo/);
  });
});
