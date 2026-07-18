import { PrivateFileVault } from './privateFileVault';

const repository = new PrivateFileVault();

/** Stores sealed review and owner-signed application bytes in the private local vault. */
export async function saveReviewEvidenceFile(id: string, file: File): Promise<void> {
  await repository.putEvidenceFile(id, file, file.name);
}

export async function loadReviewEvidenceFile(id: string) {
  return repository.getEvidenceFile(id);
}
