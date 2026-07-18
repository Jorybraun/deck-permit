import type { CanonicalCalculationReport } from './canonicalCalculationReport';
import type { ProfessionalReviewCycle } from '../types';

export const PROFESSIONAL_WORK_RESOLUTION_SCHEMA = 'permitly-professional-work-resolution/v1' as const;

export type ProfessionalWorkPackageKind = 'platform-system' | 'foundation-system' | 'stair-system' | 'connection';

export interface ProfessionalWorkPackage {
  id: string;
  kind: ProfessionalWorkPackageKind;
  title: string;
  demandSummary: string;
  requirementSummary: string;
}

export interface ProfessionalWorkResolution {
  schema: typeof PROFESSIONAL_WORK_RESOLUTION_SCHEMA;
  id: string;
  designFingerprint: string;
  workPackageId: string;
  kind: ProfessionalWorkPackageKind;
  disposition: 'specified' | 'covered-by-sealed-document' | 'not-applicable';
  specification: string;
  capacityBasis: string;
  documentReference: string;
  notes: string;
  recordedAt: string;
}

export function buildProfessionalWorkPackages(report: CanonicalCalculationReport): ProfessionalWorkPackage[] {
  const packages: ProfessionalWorkPackage[] = [];
  report.platformSystems.forEach((system) => {
    const joists = report.joistGroups.filter((group) => group.platformId === system.platformId);
    const beams = report.beams.filter((beam) => beam.platformId === system.platformId);
    packages.push({
      id: `SYS:${system.platformId}`,
      kind: 'platform-system',
      title: `${system.name} member system`,
      demandSummary: `${joists.length} joist group(s), ${beams.length} beam(s), governing joist span ${system.joistDesignSpanMm} mm`,
      requirementSummary: 'Confirm member sizes, species/grade, spans, cantilevers, bearing, built-up fastening, blocking, bracing, and complete gravity/lateral load path.',
    });
  });
  unique(report.postFootingChecks.map((item) => item.platformId)).forEach((platformId) => {
    const footings = report.postFootingChecks.filter((item) => item.platformId === platformId);
    packages.push({
      id: `FND:${platformId}`,
      kind: 'foundation-system',
      title: `${platformId} foundation system`,
      demandSummary: `${footings.length} footing(s), maximum generated reaction ${maximum(footings.map((item) => item.reactionKn)).toFixed(2)} kN`,
      requirementSummary: 'Resolve soil capacity, frost depth, footing material/reinforcement, post base, uplift, sliding, settlement, drainage, utilities, and construction depth.',
    });
  });
  report.stairs.forEach((stair) => packages.push({
    id: `STAIR:${stair.id}`,
    kind: 'stair-system',
    title: `${stair.id} stair and landing system`,
    demandSummary: `${stair.riserCount} risers @ ${stair.riserHeightMm} mm, ${stair.stringerCount} stringers, ${stair.widthMm} mm width`,
    requirementSummary: 'Resolve stringer size/notching, header and landing support, attachment hardware, guards, handrails, load path, and code geometry.',
  }));
  report.connections.forEach((connection) => packages.push({
    id: connection.id,
    kind: 'connection',
    title: `${connection.id} · ${connection.kind.replace(/-/g, ' ')}`,
    demandSummary: connection.designActionKn === null ? 'Design action unresolved by generator' : `${connection.designActionKn.toFixed(2)} kN ${connection.actionScope}`,
    requirementSummary: connection.requirements.join(' '),
  }));
  return packages;
}

export function validateProfessionalWorkResolutions(
  resolutions: ProfessionalWorkResolution[],
  report: CanonicalCalculationReport,
  decision: 'accepted' | 'changes-requested',
): void {
  if (!Array.isArray(resolutions) || resolutions.length > 2_000) throw new Error('A review may contain up to 2,000 structured work-package resolutions.');
  const packages = buildProfessionalWorkPackages(report);
  const packageById = new Map(packages.map((item) => [item.id, item]));
  const ids = new Set<string>();
  const packageIds = new Set<string>();
  for (const resolution of resolutions) {
    if (!resolution || resolution.schema !== PROFESSIONAL_WORK_RESOLUTION_SCHEMA || !/^[a-zA-Z0-9_-]{8,100}$/.test(resolution.id) || ids.has(resolution.id)) throw new Error('Every structural resolution requires a unique valid identifier.');
    ids.add(resolution.id);
    const workPackage = packageById.get(resolution.workPackageId);
    if (!workPackage || packageIds.has(resolution.workPackageId) || workPackage.kind !== resolution.kind) throw new Error('Every structural resolution must target one unique work package in this review issue.');
    packageIds.add(resolution.workPackageId);
    if (resolution.designFingerprint !== report.designFingerprint) throw new Error('Every structural resolution must match the published design revision.');
    if (!['specified', 'covered-by-sealed-document', 'not-applicable'].includes(resolution.disposition)) throw new Error('A structural resolution disposition is invalid.');
    validateText(resolution.documentReference, 3, 200, 'Each structural resolution needs a drawing, calculation, or sealed-document reference.');
    if (resolution.disposition === 'specified') {
      validateText(resolution.specification, 5, 2_000, 'A specified resolution needs the selected member, assembly, or hardware specification.');
      validateText(resolution.capacityBasis, 5, 2_000, 'A specified resolution needs a capacity, calculation, table, or product-data basis.');
    } else {
      validateText(resolution.notes, 5, 2_000, 'A deferred or not-applicable resolution needs an explanatory note.');
    }
    const recordedAt = Date.parse(resolution.recordedAt);
    if (!Number.isFinite(recordedAt) || recordedAt > Date.now() + 60_000) throw new Error('A structural resolution timestamp is invalid.');
  }
  if (decision === 'accepted') {
    const unresolved = packages.filter((item) => !packageIds.has(item.id));
    if (unresolved.length) throw new Error(`An accepted review must resolve all ${packages.length} structural work packages; ${unresolved.length} remain unanswered.`);
  }
}

export function buildProfessionalResolutionRecord(cycle: ProfessionalReviewCycle): string {
  const structuralResolutions = cycle.structuralResolutions || [];
  return JSON.stringify({
    schema: 'permitly-professional-resolution-record/v1',
    designFingerprint: cycle.sourceDesignFingerprint,
    decision: cycle.decision,
    professional: { name: cycle.issuerName, role: cycle.issuerRole, licenseNumber: cycle.licenseNumber },
    evidenceId: cycle.evidenceId,
    importedAt: cycle.importedAt,
    resolutionCount: structuralResolutions.length,
    resolutions: structuralResolutions,
    disclaimer: 'This machine-readable coordination record supplements the sealed professional PDF identified by evidenceId. It is not independently sealed or authenticated by Permitly.',
  }, null, 2);
}

export function downloadProfessionalResolutionRecord(cycle: ProfessionalReviewCycle): void {
  const blob = new Blob([buildProfessionalResolutionRecord(cycle)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `professional-resolution-${cycle.sourceDesignFingerprint.toLowerCase()}.json`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

function validateText(value: string, minimum: number, maximum: number, message: string): void {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) throw new Error(message);
}
function unique(values: string[]): string[] { return [...new Set(values)]; }
function maximum(values: number[]): number { return values.length ? Math.max(...values) : 0; }
