import type { CaptureCategory, CaptureEvidence, ExistingConditionCapture, ExistingConditionCaptureAssessment } from './types';

export const MAX_CAPTURE_FILE_BYTES = 30 * 1024 * 1024;
export const CAPTURE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

export type AddCaptureEvidenceInput = Omit<CaptureEvidence, 'status' | 'notes'> & { status?: CaptureEvidence['status']; notes?: string };

export function createExistingConditionCapture(): ExistingConditionCapture {
  return { schema: 'existing-condition-capture/v1', evidence: [] };
}

export function addCaptureEvidence(capture: ExistingConditionCapture, input: AddCaptureEvidenceInput): ExistingConditionCapture {
  if (capture.evidence.some((record) => record.id === input.id)) throw new Error(`Capture evidence ${input.id} already exists.`);
  if (!CAPTURE_IMAGE_TYPES.includes(input.mimeType as typeof CAPTURE_IMAGE_TYPES[number])) throw new Error('Capture evidence must be a JPEG, PNG, WebP, HEIC, or HEIF image.');
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_CAPTURE_FILE_BYTES) throw new Error('Capture image must be between 1 byte and 30 MB.');
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error('Capture evidence requires a valid SHA-256 digest.');
  const record: CaptureEvidence = {
    ...input,
    label: input.label.trim() || categoryTitle(input.category),
    fileName: input.fileName.trim(),
    status: input.status || 'recorded-unverified',
    notes: input.notes?.trim() || '',
  };
  return { ...capture, evidence: [...capture.evidence, record] };
}

export function updateCaptureEvidence(capture: ExistingConditionCapture, evidenceId: string, changes: Partial<Pick<CaptureEvidence, 'category' | 'label' | 'notes' | 'status'>>): ExistingConditionCapture {
  if (!capture.evidence.some((record) => record.id === evidenceId)) throw new Error(`Capture evidence ${evidenceId} was not found.`);
  return { ...capture, evidence: capture.evidence.map((record) => record.id === evidenceId ? { ...record, ...changes, label: changes.label?.trim() || record.label, notes: changes.notes?.trim() ?? record.notes } : record) };
}

export function removeCaptureEvidence(capture: ExistingConditionCapture, evidenceId: string): ExistingConditionCapture {
  return { ...capture, evidence: capture.evidence.filter((record) => record.id !== evidenceId) };
}

export function assessExistingConditionCapture(capture: ExistingConditionCapture, options: { hasDoor: boolean }): ExistingConditionCaptureAssessment {
  const definitions: Array<{ category: CaptureCategory; title: string; reason: string; required: boolean }> = [
    { category: 'house-overview', title: 'House and yard overview', reason: 'Orients the wall, yard, grade, roof, and nearby constraints.', required: true },
    { category: 'design-wall', title: 'Complete design wall', reason: 'Locates the wall plane, corners, openings, cladding, and proposed attachment zone.', required: true },
    { category: 'door-threshold', title: 'Door and threshold', reason: 'Establishes the access opening and deck surface elevation.', required: options.hasDoor },
    { category: 'grade-context', title: 'Grade and drainage', reason: 'Corroborates spot elevations, slope, drainage direction, and stair landing conditions.', required: true },
    { category: 'wall-assembly', title: 'Visible wall assembly', reason: 'Documents accessible rim, foundation, cladding, flashing, and existing deterioration.', required: false },
    { category: 'obstruction', title: 'Obstructions and services', reason: 'Records windows, vents, meters, hose bibs, utilities, and access limitations.', required: false },
    { category: 'survey-or-sketch', title: 'Survey or measured sketch', reason: 'Adds dimension and property evidence that photographs cannot establish alone.', required: false },
  ];
  const requirements = definitions.map((definition) => {
    const evidence = capture.evidence.filter((record) => record.category === definition.category);
    const confirmed = evidence.some((record) => record.status === 'homeowner-confirmed' || record.status === 'professional-verified');
    return { ...definition, status: evidence.length ? confirmed ? 'confirmed' as const : 'recorded' as const : 'missing' as const, evidenceIds: evidence.map((record) => record.id) };
  });
  const required = requirements.filter((requirement) => requirement.required);
  const recordedRequiredCount = required.filter((requirement) => requirement.status !== 'missing').length;
  const confirmedRequiredCount = required.filter((requirement) => requirement.status === 'confirmed').length;
  return {
    requirements,
    requiredCount: required.length,
    recordedRequiredCount,
    confirmedRequiredCount,
    readyForAiDraft: required.length === recordedRequiredCount,
    readyForProfessionalReview: required.length === confirmedRequiredCount,
  };
}

export function categoryTitle(category: CaptureCategory): string {
  return ({
    'house-overview': 'House and yard overview',
    'design-wall': 'Complete design wall',
    'door-threshold': 'Door and threshold',
    'grade-context': 'Grade and drainage',
    'wall-assembly': 'Visible wall assembly',
    obstruction: 'Obstructions and services',
    'survey-or-sketch': 'Survey or measured sketch',
  } satisfies Record<CaptureCategory, string>)[category];
}
