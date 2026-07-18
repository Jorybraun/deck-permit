import type { Property } from '../../types';
import { deriveHouseReference } from './propertyGeometry';
import type { SiteAssessment, SiteModel } from './types';
import { createTerrainSurface } from './terrain';
import { assessExistingConditionCapture, createExistingConditionCapture } from './existingConditionCapture';

/** Owns the editable house/terrain reference used by deck construction coordinates. */
export function createSiteModel(property: Property, now = new Date()): SiteModel {
  const reference = deriveHouseReference(property);
  const lengthMm = Math.round(reference.widthM * 1000);
  return {
    schema: 'site-model/v4',
    units: 'mm',
    status: 'reference-unverified',
    referenceSource: reference.source,
    houseDepthMm: Math.round(reference.depthM * 1000),
    designWall: {
      id: 'HW1',
      label: 'Unconfirmed house side',
      selectionStatus: 'unselected',
      reverseDirection: false,
      invertOutward: false,
      lengthMm,
      wallHeightMm: 3150,
      cladding: 'unknown',
      rimMaterial: 'unknown',
      rimDepthMm: null,
      flashingFeasible: 'unknown',
      openings: [],
    },
    terrain: createTerrainSurface(),
    yardReference: { schema: 'parcel-yard-reference/v1', status: 'unselected', frontEdgeIndex: null, rearEdgeIndex: null, exteriorSideEdgeIndex: null, selectedBy: '', selectedAt: '', notes: '' },
    capture: createExistingConditionCapture(),
    measuredBy: '',
    measuredAt: now.toISOString().slice(0, 10),
    notes: '',
    updatedAt: now.toISOString(),
  };
}

/** Mirrors the municipal property along the selected wall without changing deck geometry. */
export function flipHouseWallDirection(site: SiteModel): SiteModel {
  return { ...site, designWall: { ...site.designWall, reverseDirection: !site.designWall.reverseDirection }, updatedAt: new Date().toISOString() };
}

/** Rotates the municipal-to-deck alignment around the wall by 180° without changing either source geometry. */
export function rotateHouseWallAlignment(site: SiteModel): SiteModel {
  return { ...site, designWall: { ...site.designWall, reverseDirection: !site.designWall.reverseDirection, invertOutward: !site.designWall.invertOutward }, updatedAt: new Date().toISOString() };
}

export function assessSiteModel(site: SiteModel): SiteAssessment {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (site.designWall.lengthMm < 2000 || site.designWall.lengthMm > 30000) errors.push('Measured design wall length must be between 2,000 mm and 30,000 mm.');
  if (site.houseDepthMm < 2000 || site.houseDepthMm > 30000) errors.push('House depth must be between 2,000 mm and 30,000 mm.');
  site.designWall.openings.forEach((opening) => {
    if (opening.widthMm < 300 || opening.offsetMm < 0 || opening.offsetMm + opening.widthMm > site.designWall.lengthMm) errors.push(`${opening.kind} ${opening.id} must fit inside the measured wall.`);
  });
  if (site.status !== 'field-input-unverified') warnings.push('House geometry is reference context only. Record field measurements before professional review.');
  if (site.designWall.selectionStatus === 'unselected') errors.push('Select and confirm the house wall used by the deck design.');
  if (site.designWall.selectionStatus !== 'field-measured') warnings.push('The selected house wall has not been confirmed from field measurements.');
  if (site.yardReference.status === 'unselected' || site.yardReference.frontEdgeIndex === null || site.yardReference.rearEdgeIndex === null) warnings.push('Front and rear parcel edges are unconfirmed; named setback checks remain unavailable.');
  if (site.status === 'field-input-unverified' && !site.measuredBy.trim()) errors.push('Identify who recorded the field measurements.');
  if (site.designWall.rimMaterial === 'unknown') warnings.push('Rim/band substrate is unknown; ledger attachment cannot be designed.');
  if (site.designWall.cladding === 'unknown') warnings.push('Cladding is unknown; flashing integration remains unresolved.');
  if (site.designWall.flashingFeasible === 'unknown') warnings.push('Continuous ledger flashing feasibility is unconfirmed.');
  if (!site.terrain.gradePoints.length) warnings.push('No grade observations are recorded; stairs, post heights, guards, and footing elevations use an assumed project datum.');
  else if (site.terrain.gradePoints.some((point) => point.verificationStatus === 'reference')) warnings.push('At least one grade point is reference-only and must be field-verified.');
  const capture = assessExistingConditionCapture(site.capture, { hasDoor: site.designWall.openings.some((opening) => opening.kind === 'door') });
  if (!capture.readyForAiDraft) warnings.push(`Existing-condition photo set is incomplete: ${capture.recordedRequiredCount} of ${capture.requiredCount} required views recorded.`);
  else if (!capture.readyForProfessionalReview) warnings.push('Required existing-condition photos are recorded but have not all been confirmed by the homeowner.');
  return { errors, warnings };
}

export function updateSiteModel(site: SiteModel, changes: Partial<Omit<SiteModel, 'schema' | 'units' | 'designWall'>>, wallChanges: Partial<SiteModel['designWall']> = {}): SiteModel {
  return {
    ...site,
    ...changes,
    designWall: { ...site.designWall, ...wallChanges },
    status: changes.status || 'field-input-unverified',
    referenceSource: changes.referenceSource || (wallChanges.selectionStatus === 'field-measured' ? 'field-measurement' : site.referenceSource),
    updatedAt: new Date().toISOString(),
  };
}
