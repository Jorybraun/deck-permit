import type { VerificationEvidence } from '../types';

export type ProfessionalRegistry = 'egbc' | 'aibc' | 'abcls';

export const PROFESSIONAL_REGISTRIES: Record<ProfessionalRegistry, { label: string; url: string; role: VerificationEvidence['issuerRole'] }> = {
  egbc: { label: 'Engineers and Geoscientists BC Registrant Directory', url: 'https://www.egbc.ca/registrant-directory', role: 'engineer' },
  aibc: { label: 'Architectural Institute of BC Online Directory', url: 'https://aibc.ca/resources/online-directory-test/', role: 'architect' },
  abcls: { label: 'Association of BC Land Surveyors Member Directory', url: 'https://abcls.ca/', role: 'surveyor' },
};

export function registryForRole(role: VerificationEvidence['issuerRole']): ProfessionalRegistry | null {
  if (role === 'engineer') return 'egbc';
  if (role === 'architect') return 'aibc';
  if (role === 'surveyor') return 'abcls';
  return null;
}

export function registryRejectionReason(record: VerificationEvidence, now = new Date()): string | undefined {
  const expected = registryForRole(record.issuerRole);
  if (!expected) return undefined;
  if (record.professionalRegistry !== expected) return `The issuer must be checked in the ${PROFESSIONAL_REGISTRIES[expected].label}.`;
  if (record.registryUrl !== PROFESSIONAL_REGISTRIES[expected].url) return 'The registry evidence does not reference the official directory.';
  if (record.registryStatus !== 'directory-confirmed-by-user' || !record.registryCheckedAt) return 'Current professional registration must be confirmed in the official directory.';
  const checkedAt = new Date(record.registryCheckedAt);
  if (!Number.isFinite(checkedAt.getTime()) || checkedAt.getTime() > now.getTime() + 60_000) return 'The professional registry check date is invalid.';
  const ageDays = (now.getTime() - checkedAt.getTime()) / 86_400_000;
  if (ageDays > 30) return 'The professional registry check is more than 30 days old.';
  return undefined;
}
