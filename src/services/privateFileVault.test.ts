import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PrivateFileVault } from './privateFileVault';

describe('PrivateFileVault', () => {
  it('stores evidence bytes and removes orphaned files', async () => {
    const repository = new PrivateFileVault(indexedDB, 'deck-permit-test-evidence');
    await repository.putEvidenceFile('keep', new Blob(['sealed'], { type: 'application/pdf' }), 'sealed.pdf');
    await repository.putEvidenceFile('remove', new Blob(['old'], { type: 'application/pdf' }), 'old.pdf');
    expect((await repository.getEvidenceFile('keep'))?.fileName).toBe('sealed.pdf');
    await repository.deleteOrphanedEvidenceFiles(new Set(['keep']));
    expect(await repository.listEvidenceFileIds()).toEqual(['keep']);
    expect(await repository.getEvidenceFile('remove')).toBeNull();
  });

  it('keeps private house captures in a separate object store', async () => {
    const repository = new PrivateFileVault(indexedDB, 'deck-permit-test-captures');
    const image = new Blob(['photo'], { type: 'image/jpeg' });
    await repository.putCaptureFile('capture-1', image, 'wall.jpg');
    expect(await repository.getCaptureFile('capture-1')).toMatchObject({ id: 'capture-1', fileName: 'wall.jpg', mimeType: 'image/jpeg', byteSize: 5 });
    await repository.deleteCaptureFile('capture-1');
    expect(await repository.getCaptureFile('capture-1')).toBeNull();
  });
});
