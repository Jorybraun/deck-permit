import type { CaptureEvidence } from '../domain/siteModel';
import type { ProfessionalReviewCycle, Property, SidneyApplicationData, SubmissionReadiness, VerificationEvidence } from '../types';
import type { CanonicalReviewIssue } from './canonicalReviewIssue';
import { buildCanonicalCalculationPdf } from './canonicalCalculationReport';
import { loadCaptureFile } from './captureFileStorage';
import { sha256Blob, sha256Bytes } from './fileDigest';
import { buildProfessionalResolutionRecord } from './professionalWorkResolution';
import { loadReviewEvidenceFile } from './reviewEvidenceStorage';
import { buildSidneyApplicationPdf, SIDNEY_APPLICATION_EDITION, validateSidneyApplication } from './sidneyApplication';
import { buildVectorPlanPdf } from './vectorPlanPdf';

export const CANONICAL_PERMIT_BUNDLE_SCHEMA = 'permitly-canonical-permit-bundle/v1' as const;

export interface CanonicalPermitBundleArtifact {
  blob: Blob;
  kind: 'professional-review' | 'ready-to-submit';
  fileNames: string[];
  byteSize: number;
  designFingerprint: string;
}

export interface CanonicalPermitBundleInput {
  issue: CanonicalReviewIssue;
  property: Property;
  application: SidneyApplicationData;
  readiness: SubmissionReadiness;
  evidence: VerificationEvidence[];
  reviewCycles: ProfessionalReviewCycle[];
}

export interface CanonicalPermitBundleDependencies {
  buildDrawingPdf: typeof buildVectorPlanPdf;
  buildCalculationPdf: typeof buildCanonicalCalculationPdf;
  buildApplicationPdf: typeof buildSidneyApplicationPdf;
  loadCapture: typeof loadCaptureFile;
  loadEvidence: typeof loadReviewEvidenceFile;
}

const defaults: CanonicalPermitBundleDependencies = { buildDrawingPdf: buildVectorPlanPdf, buildCalculationPdf: buildCanonicalCalculationPdf, buildApplicationPdf: buildSidneyApplicationPdf, loadCapture: loadCaptureFile, loadEvidence: loadReviewEvidenceFile };

export async function buildCanonicalPermitBundle(input: CanonicalPermitBundleInput, dependencies: CanonicalPermitBundleDependencies = defaults): Promise<CanonicalPermitBundleArtifact> {
  validateInput(input);
  const { issue } = input; const fingerprint = issue.manifest.designFingerprint;
  const canonical = issue.reviewPackage.deck.canonical as { site: { capture: { evidence: CaptureEvidence[] } } };
  const [{ zip, unzipSync }, drawingPdf, calculationPdf, applicationPdf, captureEntries, evidenceEntries] = await Promise.all([
    import('fflate'),
    dependencies.buildDrawingPdf(input.property, issue.reviewPackage.planset, issue.manifest),
    dependencies.buildCalculationPdf(issue.reviewPackage.calculationReport!),
    dependencies.buildApplicationPdf(input.application),
    collectCaptureEntries(canonical.site.capture.evidence, dependencies.loadCapture),
    collectProfessionalEntries(input.evidence, fingerprint, dependencies.loadEvidence),
  ]);
  const files: Record<string, Uint8Array> = {
    'README-FIRST.txt': encode(buildReadme(input)),
    [`01-application/sidney-application-prefill-UNSIGNED-${safeName(SIDNEY_APPLICATION_EDITION)}.pdf`]: applicationPdf,
    [`02-drawings/deck-permit-drawings-${fingerprint}.pdf`]: await bytes(drawingPdf),
    [`02-drawings/structural-calculation-report-${fingerprint}.pdf`]: await bytes(calculationPdf),
    [`02-drawings/layered-cad-${fingerprint}.dxf`]: encode(issue.reviewPackage.cadExchange!.dxf),
    [`04-records/canonical-project-${fingerprint}.json`]: encode(JSON.stringify(issue.reviewPackage.deck.canonical, null, 2)),
    [`04-records/calculation-report-${fingerprint}.json`]: encode(JSON.stringify(issue.reviewPackage.calculationReport, null, 2)),
    [`04-records/submission-manifest-${fingerprint}.json`]: encode(JSON.stringify({ schema: CANONICAL_PERMIT_BUNDLE_SCHEMA, project: issue.manifest, readiness: input.readiness, applicationTemplate: SIDNEY_APPLICATION_EDITION, evidence: input.evidence, reviewCycles: input.reviewCycles }, null, 2)),
    ...captureEntries,
    ...evidenceEntries,
  };
  input.reviewCycles.filter((cycle) => (cycle.structuralResolutions || []).length > 0).forEach((cycle) => { files[`04-records/professional-resolution-${cycle.sourceDesignFingerprint}-${safeName(cycle.id)}.json`] = encode(buildProfessionalResolutionRecord(cycle)); });
  const indexPath = `04-records/package-index-${fingerprint}.json`;
  files[indexPath] = encode(await buildIndex(files, fingerprint, input.readiness.status));
  const zipped = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)));
  const expectedNames = Object.keys(files).sort(); validateArchive(unzipSync(zipped), expectedNames);
  const blob = new Blob([zipped.slice().buffer as ArrayBuffer], { type: 'application/zip' });
  return { blob, kind: input.readiness.status === 'ready-to-submit' ? 'ready-to-submit' : 'professional-review', fileNames: expectedNames, byteSize: blob.size, designFingerprint: fingerprint };
}

export async function downloadCanonicalPermitBundle(input: CanonicalPermitBundleInput): Promise<CanonicalPermitBundleArtifact> {
  const artifact = await buildCanonicalPermitBundle(input); const url = URL.createObjectURL(artifact.blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `sidney-deck-permit-${input.issue.manifest.designFingerprint.toLowerCase()}.zip`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); return artifact;
}

export async function collectCaptureEntries(records: CaptureEvidence[], loader: CanonicalPermitBundleDependencies['loadCapture']): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  for (const record of records) {
    const stored = await loader(record.id); if (!stored) throw new Error(`The capture file ${record.fileName} is missing from this browser.`);
    if (stored.blob.size !== record.byteSize || stored.blob.type !== record.mimeType || await sha256Blob(stored.blob) !== record.sha256.toLowerCase()) throw new Error(`The capture file ${record.fileName} failed its size, MIME, or SHA-256 integrity check.`);
    entries[`03-evidence/site-capture-${record.category}-${record.sha256.slice(0, 10)}-${safeName(record.fileName)}`] = await bytes(stored.blob);
  }
  return entries;
}

export async function collectProfessionalEntries(records: VerificationEvidence[], fingerprint: string, loader: CanonicalPermitBundleDependencies['loadEvidence']): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  for (const record of records) {
    const stored = await loader(record.id); if (!stored) throw new Error(`The evidence file ${record.fileName} is missing from this browser.`);
    if (stored.blob.size !== record.byteSize || stored.blob.type !== record.mimeType || await sha256Blob(stored.blob) !== record.sha256.toLowerCase()) throw new Error(`The evidence file ${record.fileName} failed its size, MIME, or SHA-256 integrity check.`);
    const current = !record.designFingerprint || record.designFingerprint === fingerprint;
    const folder = current ? '03-evidence' : '05-stale-evidence';
    entries[`${folder}/${record.kind}-${record.sha256.slice(0, 10)}-${safeName(record.fileName)}`] = await bytes(stored.blob);
  }
  return entries;
}

function validateInput(input: CanonicalPermitBundleInput): void {
  const fingerprint = input.issue.manifest.designFingerprint; const report = input.issue.reviewPackage.calculationReport; const cad = input.issue.reviewPackage.cadExchange;
  const sheets = input.issue.reviewPackage.planset;
  const numbers = sheets.map((sheet) => sheet.number);
  const requiredNumbers = ['A0.0', 'C1.0', 'A1.0', 'A2.0', 'S1.0', 'S2.0', 'A3.0', 'S3.0', 'A4.0', 'A4.1', 'S4.0'];
  if (!/^DP-[A-F0-9]{8}$/.test(fingerprint) || report?.designFingerprint !== fingerprint || cad?.designFingerprint !== fingerprint || sheets.length < requiredNumbers.length || requiredNumbers.some((number) => !numbers.includes(number)) || new Set(numbers).size !== numbers.length || sheets.some((sheet) => sheet.designFingerprint !== fingerprint)) throw new Error('Regenerate the coordinated canonical issue before assembling the permit package.');
  const missing = validateSidneyApplication(input.application); if (missing.length) throw new Error(`Complete the municipal application data before packaging: ${missing.join(', ')}.`);
}

function buildReadme(input: CanonicalPermitBundleInput): string {
  const outstanding = input.readiness.gates.filter((gate) => gate.status === 'required');
  return ['PERMITLY — TOWN OF SIDNEY DECK PERMIT PACKAGE', `Project: ${input.issue.manifest.address}`, `Drawing issue: Rev ${input.issue.manifest.revision} · ${input.issue.manifest.designFingerprint}`, `Package state: ${input.readiness.status}`, `Schema: ${CANONICAL_PERMIT_BUNDLE_SCHEMA}`, '', 'CONTENTS', '01-application — official unsigned Town application prefill', `02-drawings — ${input.issue.reviewPackage.planset.length}-sheet vector drawing set, calculation booklet, and layered DXF`, '03-evidence — owner-signed application, current professional evidence, and field-confirmed site capture', '04-records — canonical model, calculation data, professional resolutions, submission manifest, and SHA-256 index', '05-stale-evidence — retained evidence belonging to another design fingerprint', '', 'IMPORTANT', 'The official prefill remains unsigned. A ready-to-submit label means the app recorded every listed gate; it is not proof of municipal acceptance or authorization to construct.', '', outstanding.length ? `OUTSTANDING GATES (${outstanding.length})` : 'OUTSTANDING GATES: none recorded by the app', ...outstanding.map((gate) => `- ${gate.label}: ${gate.detail}`), '', 'Town of Sidney Development Services · developmentservices@sidney.ca · 250-656-1725'].join('\n');
}

async function buildIndex(files: Record<string, Uint8Array>, fingerprint: string, status: SubmissionReadiness['status']): Promise<string> {
  const records = await Promise.all(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(async ([path, value]) => ({ path, byteSize: value.byteLength, sha256: await sha256Bytes(value) })));
  return JSON.stringify({ schema: 'permitly-canonical-package-index/v1', designFingerprint: fingerprint, packageKind: status, generatedAt: new Date().toISOString(), files: records }, null, 2);
}
function validateArchive(archive: Record<string, Uint8Array>, expected: string[]): void { const actual = Object.keys(archive).sort(); if (JSON.stringify(actual) !== JSON.stringify(expected) || actual.some((path) => !archive[path]?.byteLength || path.includes('..') || path.startsWith('/'))) throw new Error('The assembled canonical permit archive failed its exact-path and non-empty-file validation.'); }
function safeName(value: string): string { return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/\.{2,}/g, '.').slice(0, 120) || 'document'; }
function encode(value: string): Uint8Array { return new TextEncoder().encode(value); }
async function bytes(blob: Blob): Promise<Uint8Array> { return new Uint8Array(await blob.arrayBuffer()); }
