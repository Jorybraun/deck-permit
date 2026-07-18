import { describe, expect, it } from 'vitest';
import type { CanonicalCalculationReport } from './canonicalCalculationReport';
import { buildProfessionalResolutionRecord, buildProfessionalWorkPackages, PROFESSIONAL_WORK_RESOLUTION_SCHEMA, validateProfessionalWorkResolutions, type ProfessionalWorkResolution } from './professionalWorkResolution';

const report = {
  designFingerprint: 'DP-ABCDEF12',
  platformSystems: [{ platformId: 'P1', name: 'Upper deck', joistDesignSpanMm: 3000 }],
  joistGroups: [{ platformId: 'P1' }],
  beams: [{ platformId: 'P1' }],
  postFootingChecks: [{ platformId: 'P1', reactionKn: 5.2 }],
  stairs: [{ id: 'ST1', riserCount: 3, riserHeightMm: 150, stringerCount: 3, widthMm: 900 }],
  lifeSafety: { platformEdges: [{ platformId: 'P1', guardIntent: 'generated-required', guardRequired: true, maximumDropMm: 900 }] },
  connections: [{ id: 'C-P1-B1', kind: 'beam-to-post', designActionKn: 5.2, actionScope: 'each', requirements: ['Specify post cap and fasteners.'] }],
} as unknown as CanonicalCalculationReport;

function resolution(workPackageId: string, kind: ProfessionalWorkResolution['kind']): ProfessionalWorkResolution {
  return { schema: PROFESSIONAL_WORK_RESOLUTION_SCHEMA, id: crypto.randomUUID(), designFingerprint: report.designFingerprint, workPackageId, kind, disposition: 'specified', specification: 'Selected engineered assembly', capacityBasis: 'Sealed calculation section 4', documentReference: 'SK-01 / Calc 4', notes: '', recordedAt: new Date().toISOString() };
}

describe('professional structural work resolutions', () => {
  it('derives compact member, foundation, stair, and connection work packages', () => {
    expect(buildProfessionalWorkPackages(report).map((item) => item.id)).toEqual(['SYS:P1', 'FND:P1', 'STAIR:ST1', 'GUARD:P1', 'C-P1-B1']);
  });

  it('requires every work package for an accepted review and binds each resolution to the fingerprint', () => {
    const complete = [resolution('SYS:P1', 'platform-system'), resolution('FND:P1', 'foundation-system'), resolution('STAIR:ST1', 'stair-system'), resolution('GUARD:P1', 'guard-system'), resolution('C-P1-B1', 'connection')];
    expect(() => validateProfessionalWorkResolutions(complete, report, 'accepted')).not.toThrow();
    expect(() => validateProfessionalWorkResolutions(complete.slice(1), report, 'accepted')).toThrow(/remain unanswered/);
    expect(() => validateProfessionalWorkResolutions([{ ...complete[0], designFingerprint: 'DP-00000000' }], report, 'changes-requested')).toThrow(/published design revision/);
  });

  it('exports a revision-bound machine-readable professional resolution record', () => {
    const record = JSON.parse(buildProfessionalResolutionRecord({ id: 'cycle', exchangeProjectId: 'rvw', sourceDesignFingerprint: report.designFingerprint, decision: 'accepted', issuerName: 'A. Engineer', issuerRole: 'engineer', licenseNumber: '12345', importedAt: '2026-07-18T00:00:00.000Z', evidenceId: 'sealed-1', redlines: [], resolutions: [], structuralResolutions: [resolution('SYS:P1', 'platform-system')] }));
    expect(record).toMatchObject({ schema: 'permitly-professional-resolution-record/v1', designFingerprint: report.designFingerprint, decision: 'accepted', resolutionCount: 1, professional: { licenseNumber: '12345' } });
    expect(record.disclaimer).toContain('supplements the sealed professional PDF');
  });
});
