import type { PlanSheet, ProfessionalReviewCycle, ReviewRedline, ReviewRedlineResolution } from '../types';
import type { ProfessionalWorkResolution } from './professionalWorkResolution';

export const REVIEW_REDLINE_SCHEMA = 'deck-permit-review-redlines/v1' as const;
export const REVIEW_RESPONSE_LOG_SCHEMA = 'deck-permit-review-response-log/v1' as const;

const CATEGORIES = new Set(['code', 'structure', 'site', 'coordination', 'documentation']);
const SEVERITIES = new Set(['required', 'advisory']);

export function validateReviewRedlines(
  redlines: ReviewRedline[],
  designFingerprint: string,
  sheetIds: PlanSheet['id'][],
  decision: 'accepted' | 'changes-requested',
): void {
  if (!Array.isArray(redlines) || redlines.length > 100) throw new Error('A review may contain up to 100 sheet redlines.');
  const ids = new Set<string>();
  for (const redline of redlines) {
    if (!redline || typeof redline !== 'object' || !/^[a-zA-Z0-9_-]{8,100}$/.test(redline.id) || ids.has(redline.id)) throw new Error('Every redline requires a unique identifier.');
    ids.add(redline.id);
    if (redline.designFingerprint !== designFingerprint) throw new Error('Every redline must match the published design revision.');
    if (!sheetIds.includes(redline.sheetId)) throw new Error('A redline references a sheet outside this drawing set.');
    if (!CATEGORIES.has(redline.category) || !SEVERITIES.has(redline.severity)) throw new Error('A redline category or severity is invalid.');
    if (redline.title.trim().length < 3 || redline.title.trim().length > 120) throw new Error('Each redline needs a title between 3 and 120 characters.');
    if (redline.comment.trim().length < 5 || redline.comment.trim().length > 2_000) throw new Error('Each redline needs a comment between 5 and 2,000 characters.');
    if (!Number.isFinite(redline.anchor?.xPercent) || !Number.isFinite(redline.anchor?.yPercent)
      || redline.anchor.xPercent < 0 || redline.anchor.xPercent > 100 || redline.anchor.yPercent < 0 || redline.anchor.yPercent > 100) {
      throw new Error('Every redline marker must fall within its drawing sheet.');
    }
    const createdAt = new Date(redline.createdAt).getTime();
    if (!Number.isFinite(createdAt) || createdAt > Date.now() + 60_000) throw new Error('A redline timestamp is invalid.');
  }
  const requiredCount = redlines.filter((redline) => redline.severity === 'required').length;
  if (decision === 'changes-requested' && requiredCount === 0) throw new Error('A change request requires at least one required sheet redline.');
  if (decision === 'accepted' && requiredCount > 0) throw new Error('An accepted decision may contain advisory redlines only.');
}

export function createProfessionalReviewCycle(input: {
  exchangeProjectId: string;
  review: {
    id: string;
    designFingerprint?: string;
    decision?: 'accepted' | 'changes-requested';
    issuerName: string;
    issuerRole: 'engineer' | 'architect';
    licenseNumber?: string;
    recordedAt: string;
    redlines?: ReviewRedline[];
    structuralResolutions?: ProfessionalWorkResolution[];
  };
}): ProfessionalReviewCycle {
  if (!input.review.designFingerprint || !input.review.decision || !input.review.licenseNumber) throw new Error('The imported review is missing revision or professional metadata.');
  return {
    id: input.exchangeProjectId,
    exchangeProjectId: input.exchangeProjectId,
    sourceDesignFingerprint: input.review.designFingerprint,
    decision: input.review.decision,
    issuerName: input.review.issuerName,
    issuerRole: input.review.issuerRole,
    licenseNumber: input.review.licenseNumber,
    importedAt: new Date().toISOString(),
    evidenceId: input.review.id,
    redlines: input.review.redlines || [],
    resolutions: [],
    structuralResolutions: input.review.structuralResolutions || [],
  };
}

export function upsertProfessionalReviewCycle(cycles: ProfessionalReviewCycle[], next: ProfessionalReviewCycle): ProfessionalReviewCycle[] {
  const existing = cycles.find((cycle) => cycle.id === next.id);
  const nextRedlineIds = new Set(next.redlines.map((redline) => redline.id));
  const merged = existing ? { ...next, importedAt: existing.importedAt, resolutions: existing.resolutions.filter((resolution) => nextRedlineIds.has(resolution.redlineId)) } : next;
  return [...cycles.filter((cycle) => cycle.id !== next.id), merged].sort((a, b) => a.importedAt.localeCompare(b.importedAt));
}

export function recordRedlineResolution(
  cycles: ProfessionalReviewCycle[],
  input: { cycleId: string; redlineId: string; targetDesignFingerprint: string; disposition: ReviewRedlineResolution['disposition']; response: string },
): ProfessionalReviewCycle[] {
  const response = input.response.trim();
  if (response.length < 5 || response.length > 2_000) throw new Error('Describe the response in 5 to 2,000 characters.');
  const selectedCycle = cycles.find((cycle) => cycle.id === input.cycleId);
  if (!selectedCycle) throw new Error('The selected professional review cycle no longer exists.');
  if (!selectedCycle.redlines.some((item) => item.id === input.redlineId)) throw new Error('The selected redline no longer exists.');
  if (!/^DP-[A-F0-9]{8}$/i.test(input.targetDesignFingerprint) || !['addressed-in-revision', 'response-only'].includes(input.disposition)) throw new Error('The redline response revision or disposition is invalid.');
  return cycles.map((cycle) => {
    if (cycle.id !== input.cycleId) return cycle;
    const redline = cycle.redlines.find((item) => item.id === input.redlineId)!;
    if (input.disposition === 'addressed-in-revision' && input.targetDesignFingerprint === cycle.sourceDesignFingerprint) {
      throw new Error('Regenerate a changed design revision before claiming this redline was addressed.');
    }
    const resolution: ReviewRedlineResolution = {
      id: crypto.randomUUID(),
      redlineId: redline.id,
      sourceDesignFingerprint: cycle.sourceDesignFingerprint,
      targetDesignFingerprint: input.targetDesignFingerprint,
      disposition: input.disposition,
      response,
      recordedAt: new Date().toISOString(),
      recordedBy: 'owner-or-designer',
    };
    return { ...cycle, resolutions: [...cycle.resolutions.filter((item) => item.redlineId !== redline.id || item.targetDesignFingerprint !== input.targetDesignFingerprint), resolution] };
  });
}

export function unansweredRequiredRedlines(cycles: ProfessionalReviewCycle[]): Array<{ cycle: ProfessionalReviewCycle; redline: ReviewRedline }> {
  return cycles.flatMap((cycle) => cycle.redlines
    .filter((redline) => redline.severity === 'required' && !cycle.resolutions.some((resolution) => resolution.redlineId === redline.id))
    .map((redline) => ({ cycle, redline })));
}

export function currentResolution(cycle: ProfessionalReviewCycle, redlineId: string, designFingerprint: string): ReviewRedlineResolution | undefined {
  return [...cycle.resolutions].reverse().find((resolution) => resolution.redlineId === redlineId && resolution.targetDesignFingerprint === designFingerprint);
}

export function buildReviewResponseLog(cycles: ProfessionalReviewCycle[], currentDesignFingerprint: string): string {
  return JSON.stringify({
    schema: REVIEW_RESPONSE_LOG_SCHEMA,
    currentDesignFingerprint,
    generatedAt: new Date().toISOString(),
    disclaimer: 'Owner/designer responses are coordination records only. A qualified reviewer must accept the current revision separately.',
    cycles,
  }, null, 2);
}

export function reviewCyclesForPublication(cycles: ProfessionalReviewCycle[]): ProfessionalReviewCycle[] {
  return cycles.slice(-10).map((cycle) => ({ ...cycle, redlines: cycle.redlines.slice(0, 100), resolutions: cycle.resolutions.slice(-200), structuralResolutions: (cycle.structuralResolutions || []).slice(0, 2_000) }));
}
