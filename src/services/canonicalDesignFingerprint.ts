import type { DeckDesign } from '../domain/deckDesign';
import type { FramingDesign } from '../domain/framingDesign';
import type { SiteModel } from '../domain/siteModel';
import type { Property } from '../types';

export const CANONICAL_PLAN_SET_SCHEMA = 'permitly-canonical-plan-set/v11' as const;

export interface CanonicalFingerprintInput {
  property: Property;
  site: SiteModel;
  design: DeckDesign;
  framing: FramingDesign;
}

/** Fingerprints every controlled fact that can affect a coordinated review issue. */
export function canonicalPlanFingerprint(input: CanonicalFingerprintInput): string {
  const { generatedAt: _generatedAt, ...controlledFraming } = input.framing;
  const { updatedAt: _updatedAt, ...controlledSite } = input.site;
  const controlledIssue = {
    schema: CANONICAL_PLAN_SET_SCHEMA,
    property: {
      address: input.property.address,
      parcel: input.property.parcel,
      buildings: input.property.buildings,
      zoning: input.property.zoning,
      buildableEnvelope: input.property.buildableEnvelope,
      snowLoad: input.property.snowLoad,
      evidence: input.property.evidence,
    },
    site: controlledSite,
    design: input.design,
    framing: controlledFraming,
  };
  return `DP-${fnv1a32(JSON.stringify(controlledIssue))}`;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
