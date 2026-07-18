import type { DrawingIssueRecord, EvidenceSource, PermitManifest, ProfessionalReviewCycle, SubmissionReadiness, StructuralReport, VerificationEvidence } from '../types';
import { assessVerificationEvidence } from './verificationEvidence';

export function buildSubmissionManifest(input: {
  manifest: PermitManifest;
  readiness: SubmissionReadiness;
  report: StructuralReport;
  evidence: VerificationEvidence[];
  sources: EvidenceSource[];
  professionalReviewCycles?: ProfessionalReviewCycle[];
  drawingIssueHistory?: DrawingIssueRecord[];
}): string {
  const assessment = assessVerificationEvidence(input.report.gates, input.evidence, input.manifest.designFingerprint);
  const rejectionById = new Map(assessment.rejected.map((item) => [item.evidenceId, item.reason]));
  return JSON.stringify({
    schema: 'deck-permit-submission-manifest/v1',
    project: input.manifest,
    readiness: {
      status: input.readiness.status,
      summary: input.readiness.summary,
      gates: input.readiness.gates,
    },
    structuralDesign: {
      codeEdition: input.report.codeEdition,
      designBasis: input.report.designBasis,
      quantities: input.report.quantities,
      checks: input.report.checks,
      calculations: input.report.calculations,
      connectionSchedule: input.report.connectionSchedule,
      professionalChecklist: input.report.professionalChecklist,
      limitations: input.report.limitations,
    },
    evidenceLedger: input.evidence.map((record) => ({
      ...record,
      currentStateAssessment: rejectionById.has(record.id)
        ? { acceptedForCurrentState: false, reason: rejectionById.get(record.id) }
        : { acceptedForCurrentState: true },
      note: 'Recorded metadata is not independent verification of the issuer, licence, seal, or municipal acceptance.',
    })),
    sourceLedger: input.sources,
    professionalReviewCycles: input.professionalReviewCycles || [],
    drawingIssueHistory: input.drawingIssueHistory || [],
  }, null, 2);
}

export function downloadSubmissionManifest(input: Parameters<typeof buildSubmissionManifest>[0]): void {
  const blob = new Blob([buildSubmissionManifest(input)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${input.manifest.designFingerprint.toLowerCase()}-submission-manifest.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
