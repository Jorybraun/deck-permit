import type { ReviewGate, StructuralReport, SubmissionReadiness } from '../types';

/** Derives an honest submission state from explicit review confirmations. */
export function evaluateSubmissionReadiness(
  report: StructuralReport,
  confirmations: ReadonlySet<string> = new Set()
): SubmissionReadiness {
  const gates: ReviewGate[] = report.gates.map((gate) => (
    gate.status === 'required' && confirmations.has(gate.id)
      ? { ...gate, status: 'confirmed' }
      : gate
  ));
  const required = gates.filter((gate) => gate.status === 'required');
  const confirmedCount = gates.filter((gate) => gate.status === 'confirmed').length;
  const hasBlockedCheck = report.checks.some((check) => check.status === 'blocked');
  const ready = required.length === 0 && !hasBlockedCheck;

  return {
    status: ready ? 'ready-to-submit' : 'review-package',
    confirmedCount,
    requiredCount: required.length,
    gates,
    summary: ready
      ? 'All recorded review gates are confirmed. Recheck current Town requirements immediately before submission.'
      : `${required.length} verification${required.length === 1 ? '' : 's'} remain before this package can be represented as ready to submit.`,
  };
}
