import type { ExistingConditionFieldSurvey, ExistingConditionFieldSurveyAssessment, FieldOpeningMeasurement, HouseOpening, SiteModel } from './types';

export interface RecordExistingConditionFieldSurveyInput {
  id: string;
  recordedBy: string;
  recordedAt: string;
  instrument: ExistingConditionFieldSurvey['instrument'];
  wallLengthMm: number;
  wallHeightMm: number;
  houseDepthMm: number;
  openings: FieldOpeningMeasurement[];
  sourceEvidenceIds: string[];
  notes: string;
}

/** Records a complete existing-wall field worksheet and admits its values into the canonical site model. */
export function recordExistingConditionFieldSurvey(site: SiteModel, input: RecordExistingConditionFieldSurveyInput): SiteModel {
  validateRecordIdentity(input);
  validateDimension(input.wallLengthMm, 2000, 30_000, 'Wall length');
  validateDimension(input.wallHeightMm, 2000, 10_000, 'Wall height');
  validateDimension(input.houseDepthMm, 2000, 30_000, 'House depth');
  const openingIds = site.designWall.openings.map((opening) => opening.id);
  const measuredIds = input.openings.map((opening) => opening.openingId);
  if (new Set(measuredIds).size !== measuredIds.length) throw new Error('Each wall opening may appear only once in the field worksheet.');
  const missing = openingIds.filter((id) => !measuredIds.includes(id));
  const unknown = measuredIds.filter((id) => !openingIds.includes(id));
  if (missing.length) throw new Error(`Field worksheet is missing opening measurement${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.`);
  if (unknown.length) throw new Error(`Field worksheet references unknown opening${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}.`);
  input.openings.forEach((measurement) => validateOpeningMeasurement(measurement, site.designWall.openings, input.wallLengthMm, input.wallHeightMm));
  const evidenceIds = new Set(site.capture.evidence.map((record) => record.id));
  if (input.sourceEvidenceIds.some((id) => !evidenceIds.has(id))) throw new Error('Every field-survey evidence reference must exist in the capture record.');

  const survey: ExistingConditionFieldSurvey = {
    schema: 'existing-condition-field-survey/v1', id: input.id.trim(), status: 'homeowner-recorded-unverified', recordedBy: input.recordedBy.trim(), recordedAt: input.recordedAt,
    instrument: input.instrument, designWallId: site.designWall.id, wallLengthMm: Math.round(input.wallLengthMm), wallHeightMm: Math.round(input.wallHeightMm), houseDepthMm: Math.round(input.houseDepthMm),
    verticalDatum: { id: 'DATUM-1', label: site.terrain.datum.label, elevationMm: site.terrain.datum.elevationMm },
    openings: input.openings.map(normalizeOpeningMeasurement), sourceEvidenceIds: [...new Set(input.sourceEvidenceIds)], notes: input.notes.trim(),
  };
  const byId = new Map(survey.openings.map((opening) => [opening.openingId, opening]));
  return {
    ...site,
    status: 'field-input-unverified', referenceSource: 'field-measurement', houseDepthMm: survey.houseDepthMm, fieldSurvey: survey,
    designWall: { ...site.designWall, selectionStatus: 'field-measured', lengthMm: survey.wallLengthMm, wallHeightMm: survey.wallHeightMm, openings: site.designWall.openings.map((opening) => {
      const measured = byId.get(opening.id)!;
      return { ...opening, offsetMm: measured.offsetMm, widthMm: measured.widthMm, sillHeightMm: measured.sillHeightMm, heightMm: measured.heightMm, evidenceStatus: 'field-measured' };
    }) },
    measuredBy: survey.recordedBy, measuredAt: survey.recordedAt, updatedAt: new Date().toISOString(),
  };
}

/** Fails closed when the current model no longer matches its recorded field worksheet. */
export function assessExistingConditionFieldSurvey(site: SiteModel): ExistingConditionFieldSurveyAssessment {
  const survey = site.fieldSurvey;
  if (!survey || survey.schema !== 'existing-condition-field-survey/v1') return { status: 'missing', current: false, messages: ['No controlled existing-condition field worksheet is recorded.'] };
  const messages: string[] = [];
  if (survey.designWallId !== site.designWall.id) messages.push('The field worksheet belongs to a different selected wall.');
  if (survey.wallLengthMm !== site.designWall.lengthMm) messages.push('The design-wall length changed after the field worksheet was recorded.');
  if (survey.wallHeightMm !== site.designWall.wallHeightMm) messages.push('The wall height changed after the field worksheet was recorded.');
  if (survey.houseDepthMm !== site.houseDepthMm) messages.push('The house depth changed after the field worksheet was recorded.');
  if (survey.verticalDatum.label !== site.terrain.datum.label || survey.verticalDatum.elevationMm !== site.terrain.datum.elevationMm) messages.push('The project vertical datum changed after the field worksheet was recorded.');
  const currentById = new Map(site.designWall.openings.map((opening) => [opening.id, opening]));
  if (survey.openings.length !== site.designWall.openings.length) messages.push('The wall opening list changed after the field worksheet was recorded.');
  for (const measured of survey.openings) {
    const current = currentById.get(measured.openingId);
    if (!current || current.kind !== measured.kind || current.offsetMm !== measured.offsetMm || current.widthMm !== measured.widthMm || current.sillHeightMm !== measured.sillHeightMm || (current.heightMm ?? provisionalHeight(current.kind)) !== measured.heightMm) messages.push(`${measured.openingId} geometry changed after the field worksheet was recorded.`);
  }
  if (site.designWall.selectionStatus !== 'field-measured') messages.push('The selected wall is no longer marked field measured.');
  if (site.designWall.openings.some((opening) => opening.evidenceStatus !== 'field-measured' && opening.evidenceStatus !== 'professional-verified')) messages.push('At least one wall opening no longer has field or professional measurement status.');
  if (messages.length) return { status: 'stale', current: false, messages: [...new Set(messages)] };
  return { status: survey.status === 'professional-verified' ? 'current-professional-verified' : 'current-homeowner-unverified', current: true, messages: [survey.status === 'professional-verified' ? 'The current wall model matches the professionally verified worksheet.' : 'The current wall model matches the homeowner field worksheet; professional acceptance remains separate.'] };
}

function validateRecordIdentity(input: RecordExistingConditionFieldSurveyInput): void {
  if (!input.id.trim()) throw new Error('Field worksheet requires a stable record ID.');
  if (!input.recordedBy.trim()) throw new Error('Identify who recorded the field measurements.');
  if (!/^\d{4}-\d{2}-\d{2}/.test(input.recordedAt)) throw new Error('Field worksheet requires a recorded date.');
  if (!['tape-measure', 'laser-distance-meter', 'survey-instrument'].includes(input.instrument)) throw new Error('Select the measurement instrument used in the field.');
}
function validateOpeningMeasurement(measurement: FieldOpeningMeasurement, openings: HouseOpening[], wallLengthMm: number, wallHeightMm: number): void {
  const opening = openings.find((candidate) => candidate.id === measurement.openingId);
  if (!opening || opening.kind !== measurement.kind) throw new Error(`${measurement.openingId} kind does not match the wall model.`);
  validateDimension(measurement.offsetMm, 0, wallLengthMm, `${measurement.openingId} wall offset`);
  validateDimension(measurement.widthMm, 300, 5000, `${measurement.openingId} width`);
  validateDimension(measurement.sillHeightMm, 0, wallHeightMm, `${measurement.openingId} sill/threshold`);
  validateDimension(measurement.heightMm, 300, 5000, `${measurement.openingId} height`);
  if (measurement.offsetMm + measurement.widthMm > wallLengthMm) throw new Error(`${measurement.openingId} extends beyond the measured wall length.`);
  if (measurement.sillHeightMm + measurement.heightMm > wallHeightMm) throw new Error(`${measurement.openingId} extends above the measured wall height.`);
}
function normalizeOpeningMeasurement(opening: FieldOpeningMeasurement): FieldOpeningMeasurement { return { ...opening, offsetMm: Math.round(opening.offsetMm), widthMm: Math.round(opening.widthMm), sillHeightMm: Math.round(opening.sillHeightMm), heightMm: Math.round(opening.heightMm) }; }
function validateDimension(value: number, minimum: number, maximum: number, label: string): void { if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum.toLocaleString()} mm and ${maximum.toLocaleString()} mm.`); }
function provisionalHeight(kind: HouseOpening['kind']): number { return kind === 'door' ? 2100 : 1200; }
