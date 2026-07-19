import type { DeckDesign } from '../domain/deckDesign';
import type { FramingDesign } from '../domain/framingDesign';
import { assessExistingConditionCapture, type SiteModel } from '../domain/siteModel';
import type { BuilderShareConsent, HomeownerIntent } from '../state/homeownerProjectStore';
import type { PermitSubmissionRecord, ProfessionalReviewCycle, Property, ReviewExchangePublication, SidneyApplicationData, SubmissionReadiness, VerificationEvidence } from '../types';
import { evaluateCanonicalPermitReadiness } from './canonicalPermitReadiness';
import { buildCanonicalReviewIssue } from './canonicalReviewIssue';
import { estimateProject, type ProjectEstimate } from './projectEstimate';

export const CANONICAL_BUILDER_BRIEF_SCHEMA = 'permitly-canonical-builder-brief/v1' as const;

export interface CanonicalBuilderBrief {
  schema: typeof CANONICAL_BUILDER_BRIEF_SCHEMA;
  status: 'draft-private-preview' | 'homeowner-approved';
  generatedAt: string;
  designFingerprint: string;
  revision: number;
  consent: {
    recordedAt: string | null;
    preferredContact: BuilderShareConsent['preferredContact'];
    requestedBuilderCount: BuilderShareConsent['requestedBuilderCount'];
    includedScopes: string[];
    excludedScopes: string[];
  };
  project: {
    generalLocation: string;
    exactProperty?: { address: string; pid: string; legalDescription: string };
    homeownerContact?: { name: string; email: string; phone: string };
    goals: HomeownerIntent;
  };
  design: {
    areaSqM: number;
    platformCount: number;
    stairCount: number;
    platforms: Array<{ id: string; name: string; purpose: 'deck' | 'landing'; areaSqM: number; elevationMm: number; decking: string; guardSystem: string; supportStrategy: string }>;
    stairs: Array<{ id: string; name: string; from: string; to: string; widthMm: number; riseMm: number; runMm: number; riserCount: number; treadDepthMm: number; stringerCount: number; handrailSides: string }>;
    framing: { status: FramingDesign['status']; memberCount: number; checkSummary: Record<'pass' | 'review' | 'blocked', number>; codeProfile: string };
  };
  site: {
    wallStatus: SiteModel['designWall']['selectionStatus'];
    openings: Array<{ id: string; kind: 'door' | 'window'; offsetMm: number; widthMm: number; sillHeightMm: number; heightMm: number; evidenceStatus: string }>;
    yardOrientationStatus: SiteModel['yardReference']['status'];
    terrainStatus: SiteModel['terrain']['datum']['verificationStatus'];
    sourceEvidence: Array<{ label: string; authority: string; status: string; url: string }>;
    captureSummary: { required: number; confirmed: number; readyForProfessionalReview: boolean; totalRecords: number };
    photoEvidence?: Array<{ id: string; category: string; label: string; status: string; recordedAt: string; viewpoint: string; observations: string[]; reference: string; referenceDimensionMm: number | null; notes: string; mimeType: string; byteSize: number; sha256: string }>;
  };
  estimate: ProjectEstimate;
  permit: {
    status: SubmissionReadiness['status'];
    confirmedGateCount: number;
    requiredGateCount: number;
    gates: Array<{ id: string; label: string; status: string; responsibleParty: string }>;
    unresolvedWork: string[];
    currentProfessionalReviewLink: boolean;
    latestSubmission: { submittedAt: string; status: string; packageFileName: string } | null;
    professionalRecords?: Array<{ kind: string; issuerName: string; issuerRole: string; licenseNumber: string; decision: string; recordedAt: string; designFingerprint: string }>;
  };
  drawings?: { issueId: string; sheetCount: number; sheets: Array<{ number: string; title: string }>; cadFormat: 'DXF'; units: 'mm'; issuePurpose: 'professional-review' };
  matchProfile: {
    serviceArea: string;
    complexity: string;
    materialSpecialties: string[];
    requiredCapabilities: string[];
    qualificationRequirements: string[];
  };
  limitations: string[];
}

export interface CanonicalBuilderBriefInput {
  property: Property;
  site: SiteModel;
  design: DeckDesign;
  framing: FramingDesign;
  intent: HomeownerIntent;
  consent: BuilderShareConsent;
  application: SidneyApplicationData;
  reviewPublication: ReviewExchangePublication | null;
  reviewIssueRevision: number;
  reviewCycles: ProfessionalReviewCycle[];
  verificationEvidence: VerificationEvidence[];
  permitSubmissionHistory: PermitSubmissionRecord[];
  generatedAt?: string;
}

/** Builds a fail-closed homeowner handoff. Restricted fields appear only after explicit recorded consent. */
export function buildCanonicalBuilderBrief(input: CanonicalBuilderBriefInput): CanonicalBuilderBrief {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const revision = Math.max(1, input.reviewIssueRevision || 1);
  const issue = buildCanonicalReviewIssue({ property: input.property, site: input.site, design: input.design, framing: input.framing, reviewCycles: input.reviewCycles, revision, issuedAt: generatedAt });
  const readiness = evaluateCanonicalPermitReadiness({ issue, property: input.property, application: input.application, evidence: input.verificationEvidence, reviewCycles: input.reviewCycles });
  const approved = Boolean(input.consent.confirmed && input.consent.recordedAt && input.consent.designFingerprint === issue.manifest.designFingerprint);
  const allow = (scope: keyof Pick<BuilderShareConsent, 'shareExactAddress' | 'shareContactDetails' | 'shareDrawings' | 'sharePhotoEvidence' | 'shareProfessionalRecords'>) => approved && input.consent[scope];
  const capture = assessExistingConditionCapture(input.site.capture, { hasDoor: input.site.designWall.openings.some((opening) => opening.kind === 'door') });
  const fingerprint = issue.manifest.designFingerprint;
  const latestSubmission = [...input.permitSubmissionHistory].filter((record) => record.designFingerprint === fingerprint).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  const includedScopes = ['design-summary', 'site-readiness-summary', 'permit-status', 'concept-estimate'];
  const excludedScopes: string[] = [];
  const scoped = [
    ['exact-address', 'shareExactAddress'], ['contact-details', 'shareContactDetails'], ['drawing-index', 'shareDrawings'], ['photo-observations', 'sharePhotoEvidence'], ['professional-records', 'shareProfessionalRecords'],
  ] as const;
  scoped.forEach(([label, key]) => (allow(key) ? includedScopes : excludedScopes).push(label));

  return {
    schema: CANONICAL_BUILDER_BRIEF_SCHEMA,
    status: approved ? 'homeowner-approved' : 'draft-private-preview',
    generatedAt,
    designFingerprint: fingerprint,
    revision,
    consent: { recordedAt: approved ? input.consent.recordedAt : null, preferredContact: input.consent.preferredContact, requestedBuilderCount: input.consent.requestedBuilderCount, includedScopes, excludedScopes },
    project: {
      generalLocation: [input.property.address?.locality, input.property.address?.province].filter(Boolean).join(', ') || 'Location not confirmed',
      ...(allow('shareExactAddress') ? { exactProperty: { address: input.property.address?.fullAddress || '', pid: input.property.parcel?.pid || '', legalDescription: input.property.parcel?.legalDescription || '' } } : {}),
      ...(allow('shareContactDetails') ? { homeownerContact: { name: input.application.ownerName, email: input.application.ownerEmail, phone: input.application.ownerPhone } } : {}),
      goals: input.intent,
    },
    design: {
      areaSqM: round(issue.reviewPackage.deck.area, 1), platformCount: input.design.platforms.length, stairCount: input.design.stairs.length,
      platforms: input.design.platforms.map((platform) => ({ id: platform.id, name: platform.name, purpose: platform.purpose || 'deck', areaSqM: round(platformAreaSqM(platform.boundary.vertices), 1), elevationMm: platform.elevationMm, decking: platform.finish.decking, guardSystem: platform.finish.guardSystem, supportStrategy: platform.framingIntent.supportStrategy })),
      stairs: input.design.stairs.map((stair) => ({ id: stair.id, name: stair.name, from: endpointLabel(stair.from, input.design), to: endpointLabel(stair.to, input.design), widthMm: stair.widthMm, riseMm: stair.riserCount * stair.riserHeightMm, runMm: stair.totalRunMm, riserCount: stair.riserCount, treadDepthMm: stair.treadDepthMm, stringerCount: stair.stringerCount, handrailSides: stair.handrailSides })),
      framing: { status: input.framing.status, memberCount: input.framing.joists.length + input.framing.beams.length + input.framing.ledgers.length + input.framing.posts.length + input.framing.stairStringers.length + input.framing.stairOpenings.length + input.framing.stairTrimmers.length, checkSummary: checkSummary(input.framing), codeProfile: input.framing.codeProfile.label },
    },
    site: {
      wallStatus: input.site.designWall.selectionStatus, yardOrientationStatus: input.site.yardReference.status, terrainStatus: input.site.terrain.datum.verificationStatus,
      openings: input.site.designWall.openings.map((opening) => ({ id: opening.id, kind: opening.kind, offsetMm: opening.offsetMm, widthMm: opening.widthMm, sillHeightMm: opening.sillHeightMm, heightMm: opening.heightMm ?? (opening.kind === 'door' ? 2100 : 1200), evidenceStatus: opening.evidenceStatus || 'field-measured' })),
      sourceEvidence: input.property.evidence.map((source) => ({ label: source.label, authority: source.authority, status: source.status, url: source.url })),
      captureSummary: { required: capture.requiredCount, confirmed: capture.confirmedRequiredCount, readyForProfessionalReview: capture.readyForProfessionalReview, totalRecords: input.site.capture.evidence.length },
      ...(allow('sharePhotoEvidence') ? { photoEvidence: input.site.capture.evidence.map((record) => ({ id: record.id, category: record.category, label: record.label, status: record.status, recordedAt: record.recordedAt, viewpoint: record.viewpoint || '', observations: record.observationTags || [], reference: record.referenceLabel || '', referenceDimensionMm: record.referenceDimensionMm || null, notes: record.notes, mimeType: record.mimeType, byteSize: record.byteSize, sha256: record.sha256 })) } : {}),
    },
    estimate: estimateProject(input.design),
    permit: {
      status: readiness.status, confirmedGateCount: readiness.confirmedCount, requiredGateCount: readiness.requiredCount,
      gates: readiness.gates.map((gate) => ({ id: gate.id, label: gate.label, status: gate.status, responsibleParty: gate.responsibleParty })),
      unresolvedWork: readiness.gates.filter((gate) => gate.status !== 'confirmed').map((gate) => gate.label),
      currentProfessionalReviewLink: Boolean(input.reviewPublication?.designFingerprint === fingerprint),
      latestSubmission: latestSubmission ? { submittedAt: latestSubmission.submittedAt, status: latestSubmission.status, packageFileName: latestSubmission.packageFileName } : null,
      ...(allow('shareProfessionalRecords') ? { professionalRecords: input.verificationEvidence.filter((record) => record.designFingerprint === fingerprint || !record.designFingerprint).map((record) => ({ kind: record.kind, issuerName: record.issuerName, issuerRole: record.issuerRole, licenseNumber: record.licenseNumber || '', decision: record.decision || '', recordedAt: record.recordedAt, designFingerprint: record.designFingerprint || '' })) } : {}),
    },
    ...(allow('shareDrawings') ? { drawings: { issueId: issue.manifest.issueId, sheetCount: issue.reviewPackage.planset.length, sheets: issue.reviewPackage.planset.map((sheet) => ({ number: sheet.number, title: sheet.title })), cadFormat: 'DXF' as const, units: 'mm' as const, issuePurpose: 'professional-review' as const } } : {}),
    matchProfile: {
      serviceArea: input.property.parcel?.municipality || input.property.address?.locality || 'Unconfirmed service area', complexity: complexity(input.design),
      materialSpecialties: unique(input.design.platforms.flatMap((platform) => [platform.finish.decking, platform.finish.guardSystem]).filter(Boolean)),
      requiredCapabilities: capabilities(input.design),
      qualificationRequirements: ['Active local business licence where required', 'Current liability insurance evidence', 'Permit and inspection experience', 'Comparable completed deck work', 'Written scope, exclusions, schedule, and warranty'],
    },
    limitations: [
      'This brief is a homeowner-controlled quoting handoff, not authorization to construct.',
      'Concept pricing uses regional allowances dated 2026-07 and is not a live supplier takeoff or contractor quote.',
      'Municipal GIS and homeowner observations remain reference evidence until the listed verification gates are resolved.',
      'Professional-review drawings remain marked not for construction until the responsible professionals and authority complete their reviews.',
      'Source photo bytes are never embedded in this JSON brief; they require a separate explicitly assembled evidence package.',
    ],
  };
}

export function serializeCanonicalBuilderBrief(brief: CanonicalBuilderBrief): string {
  return `${JSON.stringify(brief, null, 2)}\n`;
}

export function downloadCanonicalBuilderBrief(brief: CanonicalBuilderBrief): void {
  if (brief.status !== 'homeowner-approved' || !brief.consent.recordedAt) throw new Error('Record homeowner consent before downloading a builder brief.');
  const url = URL.createObjectURL(new Blob([serializeCanonicalBuilderBrief(brief)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `permitly-builder-brief-${brief.designFingerprint.toLowerCase()}.json`; anchor.rel = 'noopener';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  // Revoking synchronously races the browser's download handoff, especially for
  // generated Blob URLs. Release it after the click task has completed.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function endpointLabel(endpoint: DeckDesign['stairs'][number]['from'], design: DeckDesign): string {
  return endpoint.kind === 'terrain' ? `Yard / grade (${endpoint.elevationMm} mm)` : `${design.platforms.find((platform) => platform.id === endpoint.platformId)?.name || endpoint.platformId} (${design.platforms.find((platform) => platform.id === endpoint.platformId)?.elevationMm ?? '?'} mm)`;
}

function platformAreaSqM(vertices: DeckDesign['platforms'][number]['boundary']['vertices']): number {
  return Math.abs(vertices.reduce((sum, vertex, index) => { const next = vertices[(index + 1) % vertices.length]; return sum + vertex.xMm * next.yMm - next.xMm * vertex.yMm; }, 0) / 2_000_000);
}

function checkSummary(framing: FramingDesign): Record<'pass' | 'review' | 'blocked', number> {
  return framing.checks.reduce((summary, check) => ({ ...summary, [check.status]: summary[check.status] + 1 }), { pass: 0, review: 0, blocked: 0 });
}

function complexity(design: DeckDesign): string {
  if (design.platforms.length > 1 && design.stairs.length) return 'Multi-level deck with connected stairs / landings';
  if (design.platforms.length > 1) return 'Multi-platform deck';
  if (design.stairs.length) return 'Single platform with stairs';
  return 'Single platform deck';
}

function capabilities(design: DeckDesign): string[] {
  const values = ['Residential deck construction', 'Permit-plan coordination'];
  if (design.platforms.length > 1) values.push('Multi-level platform coordination');
  if (design.stairs.length) values.push('Exterior stair, landing, stringer, handrail, and guard construction');
  if (design.platforms.some((platform) => platform.elevationMm > 600)) values.push('Elevated deck guards and lateral-load coordination');
  if (design.platforms.some((platform) => platform.framingIntent.supportStrategy === 'ledger')) values.push('Ledger, flashing, and building-envelope integration');
  if (design.platforms.some((platform) => /waterproof|vinyl/i.test(platform.finish.decking))) values.push('Waterproof deck membrane installation');
  return values;
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
function round(value: number, decimals: number): number { const power = 10 ** decimals; return Math.round(value * power) / power; }
