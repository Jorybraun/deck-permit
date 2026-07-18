import type { Deck, DrawingIssueRecord, EvidenceSource, PermitManifest, PlanSheet, ProfessionalReviewCycle, Property, SidneyApplicationData, SubmissionReadiness, StructuralReport, VerificationEvidence } from '../types';
import { buildSidneyApplicationPdf, SIDNEY_APPLICATION_EDITION, validateSidneyApplication } from './sidneyApplication';
import { buildSubmissionManifest } from './submissionManifest';
import { buildVectorPlanPdf } from './vectorPlanPdf';
import { loadEvidenceFile } from './projectPersistence';
import type { StoredEvidenceFile } from './projectRepository';
import { assessVerificationEvidence } from './verificationEvidence';
import { sha256Blob, sha256Bytes } from './fileDigest';
import { buildReviewResponseLog } from './reviewRedlines';
import { buildProfessionalResolutionRecord } from './professionalWorkResolution';

export const PERMIT_BUNDLE_SCHEMA = 'deck-permit-bundle/v3' as const;
export const REQUIRED_PERMIT_SHEET_IDS: PlanSheet['id'][] = ['cover', 'existing-conditions', 'site', 'deck-plan', 'foundations', 'framing', 'elevations', 'sections', 'details', 'calculations'];

export interface PermitBundleInput {
  property: Property;
  deck: Deck;
  planset: PlanSheet[];
  report: StructuralReport;
  readiness: SubmissionReadiness;
  manifest: PermitManifest;
  evidence: VerificationEvidence[];
  application: SidneyApplicationData;
  sources: EvidenceSource[];
  professionalReviewCycles: ProfessionalReviewCycle[];
  drawingIssueHistory: DrawingIssueRecord[];
}

export interface PermitBundleArtifact {
  blob: Blob;
  kind: 'professional-review' | 'ready-to-submit';
  fileNames: string[];
  byteSize: number;
}

export async function buildPermitBundle(input: PermitBundleInput): Promise<PermitBundleArtifact> {
  validateBundleInput(input);
  const assessment = assessVerificationEvidence(input.report.gates, input.evidence, input.manifest.designFingerprint);
  const rejectedEvidenceIds = new Set(assessment.rejected.map((item) => item.evidenceId));
  const [{ zip, unzipSync }, drawingPdf, applicationPdf, evidenceFiles] = await Promise.all([
    import('fflate'),
    buildVectorPlanPdf(input.property, input.planset, input.manifest),
    buildSidneyApplicationPdf(input.application),
    collectEvidenceEntries(input.evidence, loadEvidenceFile, rejectedEvidenceIds),
  ]);
  const files: Record<string, Uint8Array> = {
    'README-FIRST.txt': new TextEncoder().encode(buildBundleReadme(input)),
    [`01-application/sidney-application-prefill-UNSIGNED-${safeFileName(SIDNEY_APPLICATION_EDITION)}.pdf`]: new Uint8Array(applicationPdf),
    [`02-drawings/deck-permit-drawings-${input.manifest.designFingerprint}.pdf`]: new Uint8Array(await drawingPdf.arrayBuffer()),
    [`04-records/submission-manifest-${input.manifest.designFingerprint}.json`]: new TextEncoder().encode(buildSubmissionManifest({ manifest: input.manifest, readiness: input.readiness, report: input.report, evidence: input.evidence, sources: input.sources, professionalReviewCycles: input.professionalReviewCycles || [], drawingIssueHistory: input.drawingIssueHistory || [] })),
    [`04-records/design-basis-report-${input.manifest.designFingerprint}.json`]: new TextEncoder().encode(JSON.stringify(input.report, null, 2)),
    [`04-records/professional-redline-response-log-${input.manifest.designFingerprint}.json`]: new TextEncoder().encode(buildReviewResponseLog(input.professionalReviewCycles || [], input.manifest.designFingerprint)),
    [`04-records/drawing-issue-register-${input.manifest.designFingerprint}.json`]: new TextEncoder().encode(JSON.stringify({ schema: 'deck-permit-drawing-issue-register/v1', currentIssueId: input.manifest.issueId, issues: input.drawingIssueHistory || [] }, null, 2)),
    ...evidenceFiles,
  };
  Object.assign(files, buildProfessionalResolutionEntries(input.professionalReviewCycles || []));
  const packageIndexPath = `04-records/package-index-${input.manifest.designFingerprint}.json`;
  files[packageIndexPath] = new TextEncoder().encode(await buildPackageIndex(files, input));
  const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)));
  if (bytes.length < 1_000) throw new Error('The assembled permit bundle is unexpectedly empty.');
  const fileNames = Object.keys(files).sort();
  validateBundleArchive(unzipSync(bytes), fileNames, files);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' });
  return { blob, kind: input.readiness.status === 'ready-to-submit' ? 'ready-to-submit' : 'professional-review', fileNames, byteSize: blob.size };
}

export async function downloadPermitBundle(input: PermitBundleInput): Promise<PermitBundleArtifact> {
  const artifact = await buildPermitBundle(input);
  const url = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sidney-deck-permit-${input.property.address?.civicNumber || 'project'}-${input.manifest.designFingerprint.toLowerCase()}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
  return artifact;
}

export async function collectEvidenceEntries(
  evidence: VerificationEvidence[],
  loader: (id: string) => Promise<StoredEvidenceFile | null> = loadEvidenceFile,
  rejectedEvidenceIds: ReadonlySet<string> = new Set(),
): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  for (const record of evidence) {
    const stored = await loader(record.id);
    if (!stored) throw new Error(`The evidence PDF “${record.fileName}” is missing from this browser. Reattach it before assembling the package.`);
    if (stored.byteSize !== record.byteSize || stored.blob.size !== record.byteSize || stored.mimeType !== 'application/pdf' || stored.blob.type !== 'application/pdf' || stored.fileName !== record.fileName) {
      throw new Error(`The stored evidence PDF “${record.fileName}” no longer matches its ledger metadata.`);
    }
    if (await sha256Blob(stored.blob) !== record.sha256.toLowerCase()) throw new Error(`The stored evidence PDF “${record.fileName}” failed its SHA-256 integrity check.`);
    const folder = rejectedEvidenceIds.has(record.id)
      ? '05-rejected-or-stale-evidence'
      : record.gateId === 'application' ? '01-application' : '03-professional-and-site-evidence';
    const name = `${folder}/${safeFileName(record.gateId)}-${record.sha256.slice(0, 10)}-${safeFileName(record.id).slice(0, 8)}-${safeFileName(record.fileName)}`;
    if (entries[name]) throw new Error(`Two evidence records resolve to the same package path: ${name}.`);
    entries[name] = new Uint8Array(await stored.blob.arrayBuffer());
  }
  return entries;
}

export function validateBundleInput(input: PermitBundleInput): void {
  if (!/^DP-[A-F0-9]{8}$/i.test(input.manifest.designFingerprint)) throw new Error('The design revision fingerprint is invalid. Regenerate the drawing package.');
  if (!input.property.address || input.manifest.address !== input.property.address.fullAddress || input.manifest.pid !== (input.property.parcel?.pid || 'PID unconfirmed')) {
    throw new Error('The project address or parcel no longer matches the drawing manifest. Regenerate the drawing package.');
  }
  const sheetIds = input.planset.map((sheet) => sheet.id);
  if (sheetIds.length !== REQUIRED_PERMIT_SHEET_IDS.length || sheetIds.some((id, index) => id !== REQUIRED_PERMIT_SHEET_IDS[index]) || input.manifest.sheetIds.join('|') !== sheetIds.join('|')) {
    throw new Error('The drawing set is incomplete or no longer matches the manifest. Regenerate all ten canonical sheets.');
  }
  if (input.planset.some((sheet) => sheet.revision !== input.manifest.revision || sheet.designFingerprint !== input.manifest.designFingerprint || sheet.issuedAt !== input.manifest.generatedAt)) {
    throw new Error('One or more drawing sheets do not match the controlled issue manifest. Regenerate all ten canonical sheets.');
  }
  const currentIssue = input.drawingIssueHistory?.find((issue) => issue.id === input.manifest.issueId);
  if (!currentIssue || currentIssue.designFingerprint !== input.manifest.designFingerprint || currentIssue.revision !== input.manifest.revision || currentIssue.sheetIds.join('|') !== sheetIds.join('|')) {
    throw new Error('The drawing issue register does not contain the current manifest issue. Regenerate the drawing package.');
  }
  const missing = validateSidneyApplication(input.application);
  if (missing.length) throw new Error(`Complete the permit application before assembling the package: ${missing.join(', ')}.`);
}

export function validateBundleArchive(entries: Record<string, Uint8Array>, expectedNames: string[], expectedEntries?: Record<string, Uint8Array>): void {
  const actualNames = Object.keys(entries).sort();
  if (actualNames.join('|') !== [...expectedNames].sort().join('|')) throw new Error('The ZIP archive contents did not match the package manifest.');
  for (const name of actualNames) {
    if (!name || name.startsWith('/') || name.split('/').some((part) => part === '..')) throw new Error(`The ZIP archive contains an unsafe path: ${name || '(empty)'}.`);
    if (entries[name].byteLength === 0) throw new Error(`The ZIP archive contains an empty file: ${name}.`);
    const expected = expectedEntries?.[name];
    if (expected && (expected.byteLength !== entries[name].byteLength || expected.some((byte, index) => byte !== entries[name][index]))) {
      throw new Error(`The ZIP archive changed the bytes for ${name}.`);
    }
  }
}

export async function buildPackageIndex(files: Record<string, Uint8Array>, input: PermitBundleInput): Promise<string> {
  const records = await Promise.all(Object.keys(files).sort().map(async (path) => ({
    path,
    byteSize: files[path].byteLength,
    sha256: await sha256Bytes(files[path]),
  })));
  return JSON.stringify({
    schema: 'deck-permit-package-index/v1',
    designFingerprint: input.manifest.designFingerprint,
    packageKind: input.readiness.status === 'ready-to-submit' ? 'ready-to-submit' : 'professional-review',
    generatedAt: new Date().toISOString(),
    note: 'This index covers every package file except the index itself. Verify SHA-256 digests after extraction.',
    files: records,
  }, null, 2);
}

export function buildBundleReadme(input: PermitBundleInput): string {
  const outstanding = input.readiness.gates.filter((gate) => gate.status === 'required');
  return [
    'TOWN OF SIDNEY — RESIDENTIAL DECK PERMIT PACKAGE',
    `Project: ${input.property.address?.fullAddress || 'Address unconfirmed'}`,
    `PID: ${input.property.parcel?.pid || 'unconfirmed'}`,
    `Drawing issue: Rev ${input.manifest.revision} · ${input.manifest.designFingerprint}`,
    `Package generated: ${new Date().toISOString()}`,
    `Application template: Town of Sidney ${SIDNEY_APPLICATION_EDITION}`,
    `Package schema: ${PERMIT_BUNDLE_SCHEMA}`,
    `Application state: ${input.readiness.status === 'ready-to-submit' ? 'all in-app evidence gates recorded; municipal validation still required' : 'professional review package — not ready to submit'}`,
    '',
    'CONTENTS',
    '01-application/ — official Sidney prefill plus any signed application evidence',
    '02-drawings/ — coordinated ten-sheet 11×17 vector PDF (PDF paths and searchable text; no sheet rasterization)',
    '03-professional-and-site-evidence/ — locally stored survey, field, engineering, and municipal PDFs',
    '04-records/ — submission manifest, drawing issue register, design-basis report, professional redline response log, and revision-bound structural resolution records',
    '05-rejected-or-stale-evidence/ — evidence retained for audit but not valid for the current submission state',
    '',
    'OWNER ACTION REQUIRED',
    'The generated Sidney prefill is deliberately unsigned. Review and sign the official application. Use the signed application evidence file for submission.',
    'Confirm the Town’s current checklist, fees, construction fire-safety plan, and project-specific requirements immediately before emailing Development Services.',
    'This package does not prove municipal acceptance and is not authorization to construct.',
    '',
    outstanding.length ? `OUTSTANDING GATES (${outstanding.length})` : 'OUTSTANDING GATES: none recorded by the app',
    ...outstanding.map((gate) => `- ${gate.label}: ${gate.detail}`),
    '',
    'SUBMISSION CONTACT',
    'Town of Sidney Development Services',
    'developmentservices@sidney.ca · 250-656-1725',
  ].join('\n');
}

export function buildProfessionalResolutionEntries(cycles: ProfessionalReviewCycle[]): Record<string, Uint8Array> {
  return Object.fromEntries(cycles.filter((cycle) => (cycle.structuralResolutions || []).length > 0).map((cycle) => [
    `04-records/professional-resolution-${cycle.sourceDesignFingerprint}-${safeFileName(cycle.id)}.json`,
    new TextEncoder().encode(buildProfessionalResolutionRecord(cycle)),
  ]));
}

export function safeFileName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 120) || 'document';
}
