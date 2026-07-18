import type { Deck, DesignCheck, PermitManifest, PlanSheet, ProfessionalReviewCycle, Property, ReviewExchangePublication, ReviewRedline, StructuralReport, VerificationEvidence } from '../types';
import { reviewCyclesForPublication } from './reviewRedlines';

export interface ReviewPackagePayload {
  manifest: PermitManifest;
  property: { address: string; pid: string; legalDescription: string; municipality: string; zone: string };
  deck: ReviewDeckPayload;
  planset: PlanSheet[];
  report: ReviewBasisPayload;
  priorReviewCycles: ProfessionalReviewCycle[];
}

/** Minimal public review contract. Canonical publications may add a typed snapshot; legacy publications remain readable. */
export interface ReviewDeckPayload {
  area: number;
  platformCount?: number;
  stairCount?: number;
  canonical?: unknown;
}

/** The reviewer UI owns decisions; it consumes traceable checks without depending on the legacy calculation report shape. */
export interface ReviewBasisPayload {
  checks: DesignCheck[];
  generatedAt?: string;
  codeEdition?: string;
  assumptions?: unknown;
  reviewGates?: unknown;
  sources?: unknown;
  framingStatus?: unknown;
}

export interface ReviewSubmission extends Omit<VerificationEvidence, 'issuerRole' | 'licenseNumber' | 'decision' | 'designFingerprint'> {
  issuerRole: 'engineer' | 'architect';
  licenseNumber: string;
  decision: 'accepted' | 'changes-requested';
  designFingerprint: string;
  pdfBase64: string;
  redlines: ReviewRedline[];
}

export interface ReviewerExchangeResult {
  id: string;
  createdAt: string;
  expiresAt: string;
  reviewPackage: ReviewPackagePayload;
  review: Omit<ReviewSubmission, 'pdfBase64'> | null;
}

export interface OwnerExchangeResult extends Omit<ReviewerExchangeResult, 'review'> {
  updatedAt: string;
  review: ReviewSubmission | null;
}

export function buildReviewPackage(property: Property, deck: Deck, planset: PlanSheet[], report: StructuralReport, manifest: PermitManifest, reviewCycles: ProfessionalReviewCycle[] = []): ReviewPackagePayload {
  return {
    manifest,
    property: {
      address: property.address?.fullAddress || '', pid: property.parcel?.pid || '', legalDescription: property.parcel?.legalDescription || '',
      municipality: property.parcel?.municipality || property.address?.locality || '', zone: property.zoning?.zone || '',
    },
    deck,
    planset,
    report,
    priorReviewCycles: reviewCyclesForPublication(reviewCycles),
  };
}

export async function publishReviewExchange(reviewPackage: ReviewPackagePayload): Promise<ReviewExchangePublication> {
  const response = await fetch('/api/review-exchange', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reviewPackage) });
  const result = await parseResponse<{ id: string; ownerToken: string; reviewerToken: string; createdAt: string; expiresAt: string }>(response);
  const reviewerUrl = new URL(window.location.href);
  reviewerUrl.search = `?reviewProject=${encodeURIComponent(result.id)}`;
  reviewerUrl.hash = `reviewToken=${encodeURIComponent(result.reviewerToken)}`;
  return { projectId: result.id, ownerToken: result.ownerToken, reviewerUrl: reviewerUrl.toString(), designFingerprint: reviewPackage.manifest.designFingerprint, revision: reviewPackage.manifest.revision, issueIssuedAt: reviewPackage.manifest.generatedAt, publishedAt: result.createdAt, expiresAt: result.expiresAt };
}

export async function getReviewerExchange(projectId: string, reviewerToken: string): Promise<ReviewerExchangeResult> {
  const response = await fetch(`/api/review-exchange/${encodeURIComponent(projectId)}/reviewer`, { headers: bearerHeaders(reviewerToken) });
  return parseResponse<ReviewerExchangeResult>(response);
}

export async function getOwnerExchange(publication: ReviewExchangePublication): Promise<OwnerExchangeResult> {
  const response = await fetch(`/api/review-exchange/${encodeURIComponent(publication.projectId)}/owner`, { headers: bearerHeaders(publication.ownerToken) });
  return parseResponse<OwnerExchangeResult>(response);
}

export async function submitReviewerDecision(projectId: string, reviewerToken: string, review: ReviewSubmission): Promise<Omit<ReviewSubmission, 'pdfBase64'>> {
  const response = await fetch(`/api/review-exchange/${encodeURIComponent(projectId)}/review`, { method: 'POST', headers: { ...bearerHeaders(reviewerToken), 'content-type': 'application/json' }, body: JSON.stringify(review) });
  return parseResponse<Omit<ReviewSubmission, 'pdfBase64'>>(response);
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not read the PDF.'));
    reader.readAsDataURL(file);
  });
}

export function reviewPdfFile(review: ReviewSubmission): File {
  const binary = atob(review.pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], review.fileName, { type: review.mimeType });
}

function bearerHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : `Review exchange failed (${response.status}).`);
  return result as T;
}
