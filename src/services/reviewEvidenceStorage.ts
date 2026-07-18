import { ProjectRepository } from './projectRepository';

const repository = new ProjectRepository();

/** Stores the sealed review bytes locally without importing or mutating the retired application store. */
export async function saveReviewEvidenceFile(id: string, file: File): Promise<void> {
  await repository.putEvidenceFile(id, file, file.name);
}

export async function loadReviewEvidenceFile(id: string) {
  return repository.getEvidenceFile(id);
}
