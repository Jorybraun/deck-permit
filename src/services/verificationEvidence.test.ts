import { describe, expect, it } from 'vitest';
import type { ReviewGate, VerificationEvidence } from '../types';
import { assessVerificationEvidence } from './verificationEvidence';

const gates: ReviewGate[] = [
  { id: 'structural-review', label: 'Structural review', status: 'required', responsibleParty: 'engineer', detail: '' },
  { id: 'legal-survey', label: 'Survey', status: 'required', responsibleParty: 'surveyor', detail: '' },
];
const base: VerificationEvidence = {
  id: 'e1', gateId: 'structural-review', kind: 'sealed-structural-review', fileName: 'sealed.pdf', mimeType: 'application/pdf', byteSize: 100,
  sha256: 'a'.repeat(64), issuerName: 'P. Engineer', issuerRole: 'engineer', licenseNumber: 'EGBC-123', decision: 'accepted',
  professionalRegistry: 'egbc', registryUrl: 'https://www.egbc.ca/registrant-directory', registryCheckedAt: new Date().toISOString(), registryStatus: 'directory-confirmed-by-user',
  designFingerprint: 'DP-AAAA', recordedAt: '2026-07-18T00:00:00Z', status: 'recorded-unverified',
};

describe('verification evidence boundary', () => {
  it('confirms a sealed review only for the current design fingerprint', () => {
    expect(assessVerificationEvidence(gates, [base], 'DP-AAAA').confirmedGateIds.has('structural-review')).toBe(true);
    const stale = assessVerificationEvidence(gates, [base], 'DP-BBBB');
    expect(stale.confirmedGateIds.has('structural-review')).toBe(false);
    expect(stale.rejected[0].reason).toContain('different design revision');
  });

  it('requires professional identity and a real PDF digest', () => {
    const invalid = { ...base, licenseNumber: '', sha256: '' };
    const result = assessVerificationEvidence(gates, [invalid], 'DP-AAAA');
    expect(result.confirmedGateIds.size).toBe(0);
  });

  it('requires licensed survey evidence for the legal boundary gate', () => {
    const survey: VerificationEvidence = { ...base, id: 'e2', gateId: 'legal-survey', kind: 'legal-survey', issuerRole: 'surveyor', licenseNumber: 'BCLS-100', designFingerprint: undefined, professionalRegistry: 'abcls', registryUrl: 'https://abcls.ca/' };
    expect(assessVerificationEvidence(gates, [survey], 'DP-AAAA').confirmedGateIds.has('legal-survey')).toBe(true);
  });

  it('rejects free-text professional credentials without an official directory check', () => {
    const unchecked: VerificationEvidence = { ...base, professionalRegistry: undefined, registryUrl: undefined, registryCheckedAt: undefined, registryStatus: undefined };
    const result = assessVerificationEvidence(gates, [unchecked], 'DP-AAAA');
    expect(result.confirmedGateIds.has('structural-review')).toBe(false);
    expect(result.rejected[0].reason).toContain('Registrant Directory');
  });

  it('binds house field-verification reports to the current design revision', () => {
    const fieldGate: ReviewGate = { id: 'house-field-check', label: 'Field check', status: 'required', responsibleParty: 'designer', detail: '' };
    const fieldEvidence: VerificationEvidence = {
      ...base, id: 'field-1', gateId: 'house-field-check', kind: 'field-report', issuerRole: 'designer',
      professionalRegistry: undefined, registryUrl: undefined, registryCheckedAt: undefined, registryStatus: undefined, designFingerprint: 'DP-OLD',
    };
    const result = assessVerificationEvidence([fieldGate], [fieldEvidence], 'DP-NEW');
    expect(result.confirmedGateIds.has('house-field-check')).toBe(false);
    expect(result.rejected[0].reason).toContain('different design revision');
  });
});
