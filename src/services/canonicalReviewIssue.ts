import type { DeckDesign, PointMm } from '../domain/deckDesign';
import type { FramingDesign } from '../domain/framingDesign';
import type { SiteModel } from '../domain/siteModel';
import type { PermitManifest, ProfessionalReviewCycle, Property } from '../types';
import { generateCanonicalPlanSet } from './canonicalPlanSet';
import type { ReviewPackagePayload } from './reviewExchange';
import { reviewCyclesForPublication } from './reviewRedlines';
import { buildProjectCadExchange } from './projectCadExchange';

export interface CanonicalReviewIssue {
  manifest: PermitManifest;
  reviewPackage: ReviewPackagePayload;
}

/** Builds one immutable professional-review issue from the current canonical project graph. */
export function buildCanonicalReviewIssue(input: {
  property: Property;
  site: SiteModel;
  design: DeckDesign;
  framing: FramingDesign;
  reviewCycles?: ProfessionalReviewCycle[];
  revision?: number;
  issuedAt?: string;
}): CanonicalReviewIssue {
  if (!input.property.address?.fullAddress) throw new Error('Confirm the project address before publishing a professional review.');
  if (!input.design.platforms.length) throw new Error('Draw at least one platform before publishing a professional review.');
  const issuedAt = input.issuedAt || new Date().toISOString();
  const revision = input.revision || 1;
  const planSet = generateCanonicalPlanSet({ ...input, revision, issuedAt });
  const manifest: PermitManifest = {
    issueId: `ISSUE-${String(revision).padStart(2, '0')}-${planSet.fingerprint}`,
    revision,
    designFingerprint: planSet.fingerprint,
    generatedAt: issuedAt,
    issuePurpose: 'professional-review',
    address: input.property.address.fullAddress,
    pid: input.property.parcel?.pid || 'PID unconfirmed',
    sheetIds: planSet.sheets.map((sheet) => sheet.id),
    status: 'professional-review',
  };
  const area = input.design.platforms.reduce((sum, platform) => sum + polygonArea(platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm])) / 1_000_000, 0);
  const reviewPackage: ReviewPackagePayload = {
    manifest,
    property: {
      address: input.property.address.fullAddress,
      pid: input.property.parcel?.pid || '',
      legalDescription: input.property.parcel?.legalDescription || '',
      municipality: input.property.parcel?.municipality || input.property.address.locality || '',
      zone: input.property.zoning?.zone || '',
    },
    deck: {
      area,
      platformCount: input.design.platforms.length,
      stairCount: input.design.stairs.length,
      canonical: {
        schema: 'permitly-canonical-review-snapshot/v1',
        units: 'mm',
        design: input.design,
        site: input.site,
        framing: input.framing,
      },
    },
    planset: planSet.sheets,
    cadExchange: buildProjectCadExchange({ property: input.property, site: input.site, design: input.design, framing: input.framing, generatedAt: issuedAt }),
    report: {
      generatedAt: input.framing.generatedAt,
      codeEdition: input.framing.codeProfile.label,
      checks: input.framing.checks.map(({ id, title, status, result, basis }) => ({ id, title, status, result, basis })),
      assumptions: input.framing.assumptions,
      reviewGates: input.framing.reviewGates,
      sources: input.framing.sources,
      framingStatus: input.framing.status,
    },
    priorReviewCycles: reviewCyclesForPublication(input.reviewCycles || []),
  };
  return { manifest, reviewPackage };
}

function polygonArea(points: PointMm[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}
