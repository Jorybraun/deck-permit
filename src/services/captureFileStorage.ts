import type { CaptureCategory, CaptureEvidence } from '../domain/siteModel';
import { CAPTURE_IMAGE_TYPES, MAX_CAPTURE_FILE_BYTES } from '../domain/siteModel';
import { sha256File } from './fileDigest';
import { ProjectRepository, type StoredCaptureFile } from './projectRepository';

const repository = new ProjectRepository();

/** Validates and hashes a private local photo before it is admitted to canonical metadata. */
export async function captureEvidenceFromFile(file: File, category: CaptureCategory, now = new Date()): Promise<CaptureEvidence> {
  if (!CAPTURE_IMAGE_TYPES.includes(file.type as typeof CAPTURE_IMAGE_TYPES[number])) throw new Error(`${file.name} is not a supported photo. Use JPEG, PNG, WebP, HEIC, or HEIF.`);
  if (file.size <= 0 || file.size > MAX_CAPTURE_FILE_BYTES) throw new Error(`${file.name} must be smaller than 30 MB.`);
  return {
    id: crypto.randomUUID(), category, label: file.name.replace(/\.[^.]+$/, ''), fileName: file.name,
    mimeType: file.type, byteSize: file.size, sha256: await sha256File(file), recordedAt: now.toISOString(),
    status: 'recorded-unverified', notes: '',
  };
}

export async function saveCaptureFile(record: CaptureEvidence, file: File): Promise<void> {
  if (record.byteSize !== file.size || record.mimeType !== file.type) throw new Error('Capture metadata does not match the selected file.');
  await repository.putCaptureFile(record.id, file, record.fileName);
}

export async function loadCaptureFile(id: string): Promise<StoredCaptureFile | null> {
  return repository.getCaptureFile(id);
}

export async function deleteCaptureFile(id: string): Promise<void> {
  await repository.deleteCaptureFile(id);
}
