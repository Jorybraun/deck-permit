import type { CaptureCategory, CaptureEvidence, CaptureEvidenceChanges, CaptureObservationTag, ExistingConditionCapture, ExistingConditionCaptureAssessment } from './types';

export const MAX_CAPTURE_FILE_BYTES = 30 * 1024 * 1024;
export const CAPTURE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const CAPTURE_OBSERVATION_TAGS: Array<{ id: CaptureObservationTag; label: string }> = [
  { id: 'house-context', label: 'House + yard context' }, { id: 'complete-wall', label: 'Complete design wall' }, { id: 'wall-corners', label: 'Wall corners visible' }, { id: 'door-opening', label: 'Door visible' }, { id: 'window-opening', label: 'Window opening visible' },
  { id: 'threshold-grade', label: 'Threshold to grade' }, { id: 'grade-slope', label: 'Grade/slope visible' }, { id: 'drainage-path', label: 'Drainage path' }, { id: 'visible-foundation', label: 'Foundation/rim visible' },
  { id: 'cladding-condition', label: 'Cladding condition' }, { id: 'obstruction-service', label: 'Obstruction/service' }, { id: 'scale-reference', label: 'Scale reference visible' }, { id: 'measured-sketch', label: 'Measured sketch/survey' },
];
const CAPTURE_OBSERVATION_IDS = new Set(CAPTURE_OBSERVATION_TAGS.map((tag) => tag.id));

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
    observationTags: normalizeObservationTags(input.observationTags),
    viewpoint: input.viewpoint?.trim() || '',
    referenceLabel: input.referenceLabel?.trim() || '',
    referenceDimensionMm: normalizeReferenceDimension(input.referenceDimensionMm),
  };
  return { ...capture, evidence: [...capture.evidence, record] };
}

export function updateCaptureEvidence(capture: ExistingConditionCapture, evidenceId: string, changes: CaptureEvidenceChanges): ExistingConditionCapture {
  if (!capture.evidence.some((record) => record.id === evidenceId)) throw new Error(`Capture evidence ${evidenceId} was not found.`);
  return { ...capture, evidence: capture.evidence.map((record) => record.id === evidenceId ? {
    ...record,
    ...changes,
    label: changes.label?.trim() || record.label,
    notes: changes.notes?.trim() ?? record.notes,
    observationTags: changes.observationTags ? normalizeObservationTags(changes.observationTags) : normalizeObservationTags(record.observationTags),
    viewpoint: changes.viewpoint === undefined ? record.viewpoint || '' : changes.viewpoint.trim(),
    referenceLabel: changes.referenceLabel === undefined ? record.referenceLabel || '' : changes.referenceLabel.trim(),
    referenceDimensionMm: changes.referenceDimensionMm === undefined ? normalizeReferenceDimension(record.referenceDimensionMm) : normalizeReferenceDimension(changes.referenceDimensionMm),
  } : record) };
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

export function defaultObservationTag(category: CaptureCategory): CaptureObservationTag {
  return ({ 'house-overview': 'house-context', 'design-wall': 'complete-wall', 'door-threshold': 'threshold-grade', 'grade-context': 'grade-slope', 'wall-assembly': 'visible-foundation', obstruction: 'obstruction-service', 'survey-or-sketch': 'measured-sketch' } satisfies Record<CaptureCategory, CaptureObservationTag>)[category];
}

export function observationTagLabel(tag: CaptureObservationTag): string {
  return CAPTURE_OBSERVATION_TAGS.find((candidate) => candidate.id === tag)?.label || tag;
}

export function captureObservationSummary(record: CaptureEvidence): string {
  const tags = normalizeObservationTags(record.observationTags).map(observationTagLabel);
  const reference = record.referenceDimensionMm ? `${record.referenceLabel || 'reference'} ${record.referenceDimensionMm} mm` : '';
  return [record.viewpoint?.trim(), tags.join(', '), reference, record.notes?.trim()].filter(Boolean).join(' · ') || 'No structured observation recorded';
}

function normalizeObservationTags(tags: CaptureObservationTag[] | undefined): CaptureObservationTag[] {
  return [...new Set((tags || []).filter((tag) => CAPTURE_OBSERVATION_IDS.has(tag)))];
}

function normalizeReferenceDimension(value: number | null | undefined): number | null {
  if (value === null || value === undefined || value === 0) return null;
  if (!Number.isFinite(value) || value < 1 || value > 100_000) throw new Error('Photo scale reference must be between 1 mm and 100,000 mm.');
  return Math.round(value);
}
