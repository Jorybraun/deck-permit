import type { AiPhotoAnalysisDraft, CaptureCategory, CaptureEvidence, CaptureEvidenceChanges, CaptureObservationTag, ExistingConditionCapture, ExistingConditionCaptureAssessment, HouseOpening, SiteModel } from './types';

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
  return { ...capture, evidence: capture.evidence.filter((record) => record.id !== evidenceId), aiAnalyses: (capture.aiAnalyses || []).map((analysis) => ({ ...analysis, observations: analysis.observations.filter((observation) => observation.sourceEvidenceId !== evidenceId) })), wallCalibrations: (capture.wallCalibrations || []).filter((record) => record.sourceEvidenceId !== evidenceId) };
}

export function recordAiPhotoAnalysis(capture: ExistingConditionCapture, analysis: AiPhotoAnalysisDraft): ExistingConditionCapture {
  if (analysis.schema !== 'ai-photo-observation-draft/v1' || !analysis.id) throw new Error('AI photo analysis requires a versioned ID.');
  const evidenceIds = new Set(capture.evidence.map((record) => record.id));
  if (analysis.observations.some((observation) => !evidenceIds.has(observation.sourceEvidenceId))) throw new Error('AI photo observations must reference an admitted source photo.');
  return { ...capture, aiAnalyses: [...(capture.aiAnalyses || []).filter((item) => item.id !== analysis.id), analysis] };
}

export function reviewAiPhotoObservation(capture: ExistingConditionCapture, analysisId: string, observationId: string, decision: 'homeowner-accepted' | 'homeowner-rejected'): ExistingConditionCapture {
  let found = false;
  const aiAnalyses = (capture.aiAnalyses || []).map((analysis) => analysis.id !== analysisId ? analysis : { ...analysis, observations: analysis.observations.map((observation) => {
    if (observation.id !== observationId) return observation;
    found = true;
    return { ...observation, decision };
  }) });
  if (!found) throw new Error(`AI photo observation ${observationId} was not found.`);
  return { ...capture, aiAnalyses };
}

/**
 * Admits one homeowner-accepted visual observation into the editable wall model.
 * Dimensions are deliberately starter values and remain photo-observed until measured.
 */
export function promoteAcceptedAiOpening(site: SiteModel, analysisId: string, observationId: string): SiteModel {
  const analysis = (site.capture.aiAnalyses || []).find((candidate) => candidate.id === analysisId);
  const observation = analysis?.observations.find((candidate) => candidate.id === observationId);
  if (!analysis || !observation) throw new Error(`AI photo observation ${observationId} was not found.`);
  if (observation.decision !== 'homeowner-accepted') throw new Error('Accept the AI photo observation before adding it to the wall model.');
  if (observation.kind !== 'door' && observation.kind !== 'window') throw new Error('Only accepted door and window observations can become wall openings.');
  if (!site.capture.evidence.some((record) => record.id === observation.sourceEvidenceId)) throw new Error('The source photo for this AI observation is no longer available.');
  const sourceRef = `${analysisId}:${observationId}`;
  if (site.designWall.openings.some((opening) => opening.sourceAiObservationRefs?.includes(sourceRef))) throw new Error('This AI photo observation is already linked to a wall opening.');
  const opening = provisionalOpeningFromObservation(site, observation.kind, observation.sourceEvidenceId, sourceRef);
  return {
    ...site,
    status: 'field-input-unverified',
    designWall: { ...site.designWall, openings: [...site.designWall.openings, opening] },
    updatedAt: new Date().toISOString(),
  };
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
    unsorted: 'Not sorted yet',
  } satisfies Record<CaptureCategory, string>)[category];
}

export function defaultObservationTag(category: CaptureCategory): CaptureObservationTag {
  return ({ 'house-overview': 'house-context', 'design-wall': 'complete-wall', 'door-threshold': 'threshold-grade', 'grade-context': 'grade-slope', 'wall-assembly': 'visible-foundation', obstruction: 'obstruction-service', 'survey-or-sketch': 'measured-sketch', unsorted: 'house-context' } satisfies Record<CaptureCategory, CaptureObservationTag>)[category];
}

/** Confidence at or above which a scene classification auto-fills the photo's category. */
export const AI_CLASSIFICATION_APPLY_THRESHOLD = 0.55;

/**
 * Records the AI's per-photo scene guess on each evidence record, and auto-applies a confident
 * guess as the photo's category — but only while the photo is still 'unsorted', so a category the
 * homeowner has already chosen (or a prior confident auto-fill they left in place) is never
 * overridden. The AI guess is always kept so the UI can surface a low-confidence "unsure" state.
 */
export function applyPhotoClassifications(capture: ExistingConditionCapture, analysis: AiPhotoAnalysisDraft): ExistingConditionCapture {
  const byEvidence = new Map<string, { category: CaptureCategory; confidence: number }>();
  for (const classification of analysis.classifications || []) {
    if (!byEvidence.has(classification.sourceEvidenceId)) byEvidence.set(classification.sourceEvidenceId, { category: classification.category, confidence: classification.confidence });
  }
  if (!byEvidence.size) return capture;
  return { ...capture, evidence: capture.evidence.map((record) => {
    const guess = byEvidence.get(record.id);
    if (!guess) return record;
    const confident = Number.isFinite(guess.confidence) && guess.confidence >= AI_CLASSIFICATION_APPLY_THRESHOLD && guess.category !== 'unsorted';
    const category = confident && record.category === 'unsorted' ? guess.category : record.category;
    return { ...record, aiCategoryGuess: guess.category, aiCategoryConfidence: guess.confidence, category };
  }) };
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

function provisionalOpeningFromObservation(site: SiteModel, kind: HouseOpening['kind'], sourceEvidenceId: string, sourceRef: string): HouseOpening {
  const widthMm = kind === 'door' ? 900 : 1200;
  const sameKindCount = site.designWall.openings.filter((opening) => opening.kind === kind).length;
  const starterOffset = Math.min(Math.max(0, sameKindCount * 1600 + 600), Math.max(0, site.designWall.lengthMm - widthMm));
  return {
    id: nextOpeningId(site.designWall.openings.map((opening) => opening.id), kind),
    kind,
    offsetMm: starterOffset,
    widthMm,
    sillHeightMm: kind === 'door' ? 750 : 900,
    heightMm: kind === 'door' ? 2100 : 1200,
    evidenceStatus: 'photo-observed',
    sourceEvidenceIds: [sourceEvidenceId],
    sourceAiObservationRefs: [sourceRef],
  };
}

function nextOpeningId(existingIds: string[], kind: HouseOpening['kind']): string {
  const prefix = kind === 'door' ? 'D' : 'W';
  let number = 1;
  while (existingIds.includes(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}
