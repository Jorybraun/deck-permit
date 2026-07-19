import { addPlatform, addStair, assessDesign, boundaryFromPoints, createEmptyDesign, setPlatformEdgeRole, setPlatformFinish, setPlatformFramingIntent, suggestPointToPointStair, type DeckDesign, type DeckPlatform, type VerticalEndpoint } from '../domain/deckDesign';
import { assessDeckLifeSafety, generateFramingDesign } from '../domain/framingDesign';
import { assessSiteCompliance, assessWallOpeningCoordination, projectPropertyToLocal, type AiPhotoAnalysisDraft, type CaptureEvidence, type SiteModel } from '../domain/siteModel';
import { loadCaptureFile } from './captureFileStorage';
import type { HomeownerIntent } from '../state/homeownerProjectStore';
import type { Property } from '../types';

export interface AiDesignCapabilities {
  schema: 'ai-design-capabilities/v1';
  configured: boolean;
  designModel: string;
  reviewModel: string;
  workflow: 'independent-proposal-and-review/v1';
  limitations: string[];
}

export interface AiPlatformProposal {
  name: string;
  purpose: 'deck' | 'landing';
  elevationMm: number;
  vertices: Array<{ xMm: number; yMm: number }>;
  supportStrategy: 'auto' | 'ledger' | 'freestanding';
  joistSpacingMm: 300 | 400 | 600;
  decking: string;
  guardEdgeIndexes: number[];
}

export interface AiStairProposal {
  name: string;
  fromPlatformIndex: number;
  toKind: 'platform' | 'terrain';
  toPlatformIndex: number | null;
  toTerrainElevationMm: number | null;
  fromEdgeIndex: number;
  toEdgeIndex: number | null;
  startMm: { xMm: number; yMm: number };
  endMm: { xMm: number; yMm: number };
  widthMm: number;
  handrailSides: 'none' | 'left' | 'right' | 'both';
}

export interface AiDesignProposal {
  schema: 'ai-deck-concept/v1';
  title: string;
  homeownerSummary: string;
  rationale: string[];
  platforms: AiPlatformProposal[];
  stairs: AiStairProposal[];
  assumptions: string[];
  unresolved: string[];
  generation: AiGeneration;
}

export interface AiDesignReview {
  schema: 'ai-deck-review/v1';
  verdict: 'revise' | 'conditional' | 'candidate-ready-for-professional-review';
  summary: string;
  deterministicAlignment: string;
  findings: Array<{ severity: 'blocked' | 'warning' | 'review'; category: string; objectId: string; checkId: string; ruleId: string; message: string; requiredAction: string }>;
  strengths: string[];
  unresolvedProfessionalChecks: string[];
  generation: AiGeneration;
}

export interface AiDesignTeamResult {
  proposal: AiDesignProposal;
  canonicalDesign: DeckDesign;
  deterministicReview: ReturnType<typeof buildDeterministicDesignReview>;
  independentReview: AiDesignReview;
}

interface AiGeneration { model: string; responseId: string; generatedAt: string }

export class AiDesignStudioError extends Error {
  constructor(message: string, public readonly code = 'ai-design-error') { super(message); }
}

export async function fetchAiDesignCapabilities(): Promise<AiDesignCapabilities> {
  return requestJson<AiDesignCapabilities>('/api/ai/capabilities');
}

export async function analyzeCapturePhotos(records: CaptureEvidence[], projectContext: { address: string; designWallLabel: string }): Promise<AiPhotoAnalysisDraft> {
  const supported = records.filter((record) => ['image/jpeg', 'image/png', 'image/webp'].includes(record.mimeType));
  if (!supported.length) throw new AiDesignStudioError('Add a JPEG, PNG, or WebP photo before starting AI analysis.', 'no-supported-photos');
  const photos = await Promise.all(supported.slice(0, 8).map(async (record) => {
    const stored = await loadCaptureFile(record.id);
    if (!stored) throw new AiDesignStudioError(`${record.label} is no longer available in private browser storage.`, 'photo-bytes-missing');
    return { evidenceId: record.id, sha256: record.sha256, label: record.label, dataUrl: await blobToDataUrl(stored.blob) };
  }));
  const raw = await requestJson<Omit<AiPhotoAnalysisDraft, 'id' | 'observations'> & { observations: Array<Omit<AiPhotoAnalysisDraft['observations'][number], 'id' | 'decision'>> }>('/api/ai/photo-analysis', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ photos, projectContext }),
  });
  const sourceIds = new Set(supported.map((record) => record.id));
  if (raw.schema !== 'ai-photo-observation-draft/v1' || raw.observations.some((observation) => !sourceIds.has(observation.sourceEvidenceId))) throw new AiDesignStudioError('The AI photo draft referenced an unknown source image.', 'invalid-photo-analysis');
  return { ...raw, id: crypto.randomUUID(), observations: raw.observations.map((observation) => ({ ...observation, id: crypto.randomUUID(), decision: 'proposed' })) };
}

export async function runAiDesignTeam(input: { goal: string; intent: HomeownerIntent; property: Property; site: SiteModel; design: DeckDesign }): Promise<AiDesignTeamResult> {
  const proposal = await requestJson<AiDesignProposal>('/api/ai/design-proposal', { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } });
  const canonicalDesign = materializeAiDesignProposal(proposal);
  const deterministicReview = buildDeterministicDesignReview(canonicalDesign, input.site, input.property);
  const independentReview = await requestJson<AiDesignReview>('/api/ai/design-review', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal, canonicalDesign, deterministicReview }),
  });
  return { proposal, canonicalDesign, deterministicReview, independentReview };
}

/** Converts untrusted AI concept geometry through the same domain constructors used by the editor. */
export function materializeAiDesignProposal(proposal: AiDesignProposal, now = new Date().toISOString()): DeckDesign {
  if (proposal.schema !== 'ai-deck-concept/v1' || !Array.isArray(proposal.platforms) || proposal.platforms.length < 1 || proposal.platforms.length > 8) throw new AiDesignStudioError('The AI proposal did not contain a usable platform set.', 'invalid-proposal');
  let design = createEmptyDesign(now);
  proposal.platforms.forEach((candidate, index) => {
    validatePlatformProposal(candidate, index);
    const boundary = boundaryFromPoints(candidate.vertices.map((point) => [integer(point.xMm), integer(point.yMm)] as const), `AI${index + 1}V`);
    const houseEdgeIndex = closestHouseEdgeIndex(candidate);
    design = addPlatform(design, { name: candidate.name, purpose: candidate.purpose, elevationMm: integer(candidate.elevationMm), boundary, ...(houseEdgeIndex === null ? {} : { houseEdgeIndex }) }, now);
    const platform = design.platforms[index];
    design = setPlatformFramingIntent(design, platform.id, { supportStrategy: candidate.supportStrategy, joistSpacingMm: candidate.joistSpacingMm }, now);
    design = setPlatformFinish(design, platform.id, { decking: candidate.decking }, now);
    for (const edgeIndex of uniqueIntegers(candidate.guardEdgeIndexes)) {
      const edge = design.platforms[index].edges[edgeIndex];
      if (edge && edge.role !== 'house') design = setPlatformEdgeRole(design, platform.id, edge.id, 'guard', now);
    }
  });
  for (const [index, candidate] of proposal.stairs.entries()) design = materializeStair(design, candidate, index, now);
  const assessment = assessDesign(design);
  if (assessment.errors.length) throw new AiDesignStudioError(`The AI revision was rejected by the geometry engine: ${assessment.errors.slice(0, 3).map((item) => item.message).join(' ')}`, 'proposal-failed-geometry');
  return { ...design, selectedObjectId: null, updatedAt: now };
}

export function buildDeterministicDesignReview(design: DeckDesign, site: SiteModel, property: Property) {
  const municipality = property.parcel?.municipality || property.address?.locality || 'British Columbia';
  const geometry = assessDesign(design);
  const siteCompliance = assessSiteCompliance(property, projectPropertyToLocal(property, site), site, design);
  const openingCoordination = assessWallOpeningCoordination(design, site, municipality);
  const lifeSafety = assessDeckLifeSafety(design, site);
  let framing: { status: 'generated' | 'blocked'; checks: unknown[]; reviewGates: unknown[]; message: string };
  try {
    const generated = generateFramingDesign(design, site, { municipality, snowLoadKpa: property.snowLoad });
    framing = { status: 'generated', checks: generated.checks, reviewGates: generated.reviewGates, message: 'Preliminary framing generated; professional structural scope remains identified by the review gates.' };
  } catch (reason) {
    framing = { status: 'blocked', checks: [], reviewGates: [], message: reason instanceof Error ? reason.message : 'Preliminary framing could not be generated.' };
  }
  return {
    schema: 'deterministic-ai-design-review/v1' as const,
    municipality,
    geometry,
    siteCompliance,
    openingCoordination,
    lifeSafety,
    framing,
    controllingPrinciple: 'AI may explain or critique these results but cannot override them.',
    professionalReviewRequired: true,
  };
}

function materializeStair(design: DeckDesign, candidate: AiStairProposal, index: number, now: string): DeckDesign {
  const fromPlatform = design.platforms[candidate.fromPlatformIndex];
  if (!fromPlatform) throw new AiDesignStudioError(`Stair ${index + 1} has no valid source platform.`, 'invalid-proposal');
  const fromEdge = fromPlatform.edges[candidate.fromEdgeIndex];
  if (!fromEdge) throw new AiDesignStudioError(`Stair ${index + 1} has no valid source edge.`, 'invalid-proposal');
  let to: VerticalEndpoint;
  let toEdgeId: string | undefined;
  if (candidate.toKind === 'platform') {
    const toPlatform = candidate.toPlatformIndex === null ? null : design.platforms[candidate.toPlatformIndex];
    if (!toPlatform || candidate.toEdgeIndex === null || !toPlatform.edges[candidate.toEdgeIndex]) throw new AiDesignStudioError(`Stair ${index + 1} has no valid destination platform edge.`, 'invalid-proposal');
    to = { kind: 'platform', platformId: toPlatform.id };
    toEdgeId = toPlatform.edges[candidate.toEdgeIndex].id;
  } else {
    if (!Number.isFinite(candidate.toTerrainElevationMm)) throw new AiDesignStudioError(`Stair ${index + 1} has no grade elevation.`, 'invalid-proposal');
    to = { kind: 'terrain', elevationMm: integer(candidate.toTerrainElevationMm!) };
  }
  const suggested = suggestPointToPointStair(design, fromPlatform.id, fromEdge.id, to, [integer(candidate.startMm.xMm), integer(candidate.startMm.yMm)], [integer(candidate.endMm.xMm), integer(candidate.endMm.yMm)], toEdgeId);
  let next = addStair(design, { ...suggested, name: candidate.name, widthMm: integer(candidate.widthMm), handrailSides: candidate.handrailSides }, now);
  next = setPlatformEdgeRole(next, fromPlatform.id, fromEdge.id, 'stair', now);
  if (to.kind === 'platform' && toEdgeId) next = setPlatformEdgeRole(next, to.platformId, toEdgeId, 'stair', now);
  return next;
}

function validatePlatformProposal(candidate: AiPlatformProposal, index: number) {
  if (!candidate || !Array.isArray(candidate.vertices) || candidate.vertices.length < 3 || candidate.vertices.length > 16) throw new AiDesignStudioError(`Platform ${index + 1} has an invalid outline.`, 'invalid-proposal');
  if (![300, 400, 600].includes(candidate.joistSpacingMm)) throw new AiDesignStudioError(`Platform ${index + 1} has an unsupported joist spacing.`, 'invalid-proposal');
  for (const point of candidate.vertices) if (!Number.isFinite(point.xMm) || !Number.isFinite(point.yMm) || Math.abs(point.xMm) > 200_000 || Math.abs(point.yMm) > 200_000) throw new AiDesignStudioError(`Platform ${index + 1} contains an out-of-range coordinate.`, 'invalid-proposal');
}

function closestHouseEdgeIndex(platform: AiPlatformProposal): number | null {
  if (platform.supportStrategy !== 'ledger') return null;
  const scores = platform.vertices.map((start, index) => {
    const end = platform.vertices[(index + 1) % platform.vertices.length];
    return (Math.abs(start.yMm) + Math.abs(end.yMm)) / 2;
  });
  const minimum = Math.min(...scores);
  return minimum <= 1_000 ? scores.indexOf(minimum) : null;
}

function uniqueIntegers(values: number[]): number[] { return [...new Set((values || []).filter(Number.isInteger))]; }
function integer(value: number): number { if (!Number.isFinite(value)) throw new AiDesignStudioError('The AI proposal contains a non-numeric dimension.', 'invalid-proposal'); return Math.round(value); }

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, init); }
  catch { throw new AiDesignStudioError('The local API server is unavailable. Start it and try again.', 'api-unavailable'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new AiDesignStudioError(body?.message || 'The AI design team could not complete this request.', body?.error || 'request-failed');
  return body as T;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new AiDesignStudioError('A private photo could not be prepared for analysis.', 'photo-read-failed')); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
}

export function platformProposalSummary(platform: AiPlatformProposal): string {
  return `${platform.name} · EL. ${platform.elevationMm} mm · ${platform.vertices.length} corners · ${platform.decking}`;
}

export function canonicalPlatformForProposal(design: DeckDesign, index: number): DeckPlatform | null { return design.platforms[index] || null; }
