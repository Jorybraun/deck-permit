import type { ReviewGate, VerificationEvidence, VerificationEvidenceKind } from '../types';
import { registryRejectionReason } from './professionalRegistry';

const EXPECTED_KIND: Record<string, VerificationEvidenceKind> = {
  'legal-survey': 'legal-survey',
  'yard-orientation': 'municipal-confirmation',
  'house-field-check': 'field-report',
  'soil-frost': 'soil-report',
  'structural-review': 'sealed-structural-review',
  stormwater: 'municipal-confirmation',
  application: 'application-checklist',
};

export interface EvidenceAssessment {
  confirmedGateIds: Set<string>;
  rejected: Array<{ evidenceId: string; reason: string }>;
}

/** Validates recorded evidence against gate-specific and revision-specific requirements. */
export function assessVerificationEvidence(
  gates: ReviewGate[],
  evidence: VerificationEvidence[],
  designFingerprint: string
): EvidenceAssessment {
  const confirmedGateIds = new Set<string>();
  const rejected: EvidenceAssessment['rejected'] = [];

  for (const record of evidence) {
    const gate = gates.find((item) => item.id === record.gateId);
    if (!gate || gate.status === 'not-applicable') {
      rejected.push({ evidenceId: record.id, reason: 'Evidence does not match an applicable review gate.' });
      continue;
    }
    const reason = rejectionReason(record, designFingerprint);
    if (reason) rejected.push({ evidenceId: record.id, reason });
    else confirmedGateIds.add(record.gateId);
  }

  return { confirmedGateIds, rejected };
}

function rejectionReason(record: VerificationEvidence, designFingerprint: string): string | undefined {
  if (EXPECTED_KIND[record.gateId] !== record.kind) return `Expected ${EXPECTED_KIND[record.gateId]} evidence for this gate.`;
  if (!record.sha256 || !/^[a-f0-9]{64}$/i.test(record.sha256)) return 'A SHA-256 file digest is required.';
  if (record.byteSize <= 0 || record.mimeType !== 'application/pdf') return 'A non-empty PDF document is required.';
  if (!record.issuerName.trim()) return 'Issuer name is required.';
  const registryReason = registryRejectionReason(record);
  if (registryReason) return registryReason;

  if (record.gateId === 'legal-survey' && (record.issuerRole !== 'surveyor' || !record.licenseNumber)) {
    return 'Survey evidence requires a named surveyor and licence number.';
  }
  if ((record.gateId === 'yard-orientation' || record.gateId === 'stormwater') && (record.issuerRole !== 'municipality' || !record.referenceNumber)) {
    return 'Municipal evidence requires an official reference number.';
  }
  if (record.gateId === 'house-field-check' && !['designer', 'engineer', 'architect'].includes(record.issuerRole)) {
    return 'Field verification requires a designer, engineer, or architect.';
  }
  if (record.gateId === 'house-field-check' && record.designFingerprint !== designFingerprint) {
    return 'The field-verification report applies to a different design revision.';
  }
  if (record.gateId === 'soil-frost' && (record.issuerRole !== 'engineer' || !record.licenseNumber)) {
    return 'Soil/frost evidence requires an engineer and licence number.';
  }
  if (record.gateId === 'structural-review') {
    if (!['engineer', 'architect'].includes(record.issuerRole) || !record.licenseNumber) return 'Structural review requires a licensed engineer or architect.';
    if (record.decision !== 'accepted') return 'The professional review decision is not accepted.';
    if (record.designFingerprint !== designFingerprint) return 'The sealed review applies to a different design revision.';
  }
  if (record.gateId === 'application' && record.issuerRole !== 'owner') return 'The application checklist must be attested by the owner/applicant.';
  return undefined;
}
