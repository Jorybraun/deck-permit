import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ID_PATTERN = /^rvw_[a-f0-9]{24}$/;
const FINGERPRINT_PATTERN = /^DP-[A-F0-9]{8}$/;

export class ReviewExchangeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ReviewExchangeStore {
  #locks = new Map();

  constructor(dataDirectory) {
    this.dataDirectory = dataDirectory;
  }

  async create(reviewPackage) {
    validateReviewPackage(reviewPackage);
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    const id = `rvw_${randomBytes(12).toString('hex')}`;
    const ownerToken = randomBytes(32).toString('base64url');
    const reviewerToken = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const record = {
      schema: 'deck-permit-review-exchange/v2', id, createdAt: now, updatedAt: now, expiresAt,
      ownerTokenHash: tokenHash(ownerToken), reviewerTokenHash: tokenHash(reviewerToken),
      reviewPackage, review: null,
    };
    await this.#write(record);
    return { id, ownerToken, reviewerToken, createdAt: now, expiresAt };
  }

  async getForReviewer(id, token) {
    const record = await this.#readAuthorized(id, token, 'reviewer');
    return { id: record.id, createdAt: record.createdAt, expiresAt: record.expiresAt, reviewPackage: record.reviewPackage, review: record.review ? publicReview(record.review) : null };
  }

  async getForOwner(id, token) {
    const record = await this.#readAuthorized(id, token, 'owner');
    return { id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt, expiresAt: record.expiresAt, reviewPackage: record.reviewPackage, review: record.review };
  }

  async submitReview(id, token, review) {
    return this.#withLock(id, async () => {
      const record = await this.#readAuthorized(id, token, 'reviewer');
      validateReview(review, record.reviewPackage.manifest.designFingerprint, record.reviewPackage.planset.map((sheet) => sheet.id), record.reviewPackage.calculationReport);
      const updated = { ...record, updatedAt: new Date().toISOString(), review };
      await this.#write(updated);
      return publicReview(review);
    });
  }

  async #readAuthorized(id, token, scope) {
    const record = await this.#read(id);
    if (new Date(record.expiresAt).getTime() < Date.now()) throw new ReviewExchangeError(410, 'expired', 'This private review link has expired.');
    const storedHash = scope === 'owner' ? record.ownerTokenHash : record.reviewerTokenHash;
    if (!validToken(token, storedHash)) throw new ReviewExchangeError(401, 'invalid-token', 'The review credential is invalid.');
    return record;
  }

  async #read(id) {
    if (!ID_PATTERN.test(id)) throw new ReviewExchangeError(404, 'not-found', 'Review package not found.');
    try {
      return JSON.parse(await readFile(join(this.dataDirectory, `${id}.json`), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') throw new ReviewExchangeError(404, 'not-found', 'Review package not found.');
      if (error instanceof SyntaxError) throw new ReviewExchangeError(500, 'corrupt-record', 'The stored review package is corrupt.');
      throw error;
    }
  }

  async #write(record) {
    const finalPath = join(this.dataDirectory, `${record.id}.json`);
    const temporaryPath = join(this.dataDirectory, `${record.id}.${randomBytes(6).toString('hex')}.tmp`);
    await writeFile(temporaryPath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporaryPath, finalPath);
  }

  async #withLock(id, operation) {
    const previous = this.#locks.get(id) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.#locks.set(id, current);
    try { return await current; } finally { if (this.#locks.get(id) === current) this.#locks.delete(id); }
  }
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function validToken(token, storedHash) {
  if (typeof token !== 'string' || token.length < 32 || typeof storedHash !== 'string') return false;
  const supplied = Buffer.from(tokenHash(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return supplied.length === stored.length && timingSafeEqual(supplied, stored);
}

function validateReviewPackage(value) {
  if (!value || typeof value !== 'object') throw new ReviewExchangeError(400, 'invalid-package', 'A review package is required.');
  if (!value.manifest || !FINGERPRINT_PATTERN.test(value.manifest.designFingerprint)) throw new ReviewExchangeError(400, 'invalid-fingerprint', 'A valid design fingerprint is required.');
  if (!value.property || typeof value.property.address !== 'string' || !value.property.address.trim()) throw new ReviewExchangeError(400, 'invalid-property', 'A project address is required.');
  if (!value.deck || !Number.isFinite(value.deck.area) || value.deck.area <= 0) throw new ReviewExchangeError(400, 'invalid-deck', 'Deck geometry is required.');
  if (!Array.isArray(value.planset) || value.planset.length < 1 || value.planset.length > 20) throw new ReviewExchangeError(400, 'invalid-planset', 'One to twenty drawing sheets are required.');
  if (value.planset.some((sheet) => typeof sheet?.svg !== 'string' || sheet.svg.length < 20 || sheet.svg.length > 1_500_000)) throw new ReviewExchangeError(400, 'invalid-sheet', 'Each drawing sheet must contain a bounded SVG document.');
  if (value.cadExchange !== undefined) validateCadExchange(value.cadExchange, value.manifest.designFingerprint);
  if (value.calculationReport !== undefined) validateCalculationReport(value.calculationReport, value.manifest.designFingerprint);
  if (!value.report || !Array.isArray(value.report.checks)) throw new ReviewExchangeError(400, 'invalid-report', 'A design-basis report is required.');
  if (value.priorReviewCycles !== undefined && (!Array.isArray(value.priorReviewCycles) || value.priorReviewCycles.length > 10)) throw new ReviewExchangeError(400, 'invalid-review-history', 'The review history may contain up to ten cycles.');
}

function validateCadExchange(value, expectedFingerprint) {
  if (!value || typeof value !== 'object' || value.schema !== 'permitly-project-cad-exchange/v1' || value.units !== 'mm' || value.coordinateSystem !== 'local-house-wall' || value.notForConstruction !== true) {
    throw new ReviewExchangeError(400, 'invalid-cad-exchange', 'The CAD exchange contract is invalid.');
  }
  if (value.designFingerprint !== expectedFingerprint) throw new ReviewExchangeError(409, 'cad-revision-mismatch', 'The CAD exchange does not match the published drawing revision.');
  if (typeof value.dxf !== 'string' || value.dxf.length < 100 || value.dxf.length > 5_000_000 || !/^(?:\uFEFF)?0\r?\nSECTION\r?\n/.test(value.dxf) || !/0\r?\nEOF\r?\n?$/.test(value.dxf)) {
    throw new ReviewExchangeError(400, 'invalid-cad-payload', 'The CAD exchange must contain a bounded ASCII DXF document.');
  }
  if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 50 || value.layers.some((layer) => typeof layer?.id !== 'string' || !/^[A-Z0-9-]{2,40}$/.test(layer.id) || !Number.isInteger(layer.entityCount) || layer.entityCount < 1 || layer.entityCount > 100_000)) {
    throw new ReviewExchangeError(400, 'invalid-cad-layers', 'The CAD exchange layer index is invalid.');
  }
}

function validateCalculationReport(value, expectedFingerprint) {
  if (!value || typeof value !== 'object' || value.schema !== 'permitly-canonical-calculation-report/v1' || value.issuePurpose !== 'professional-review' || value.notForConstruction !== true) {
    throw new ReviewExchangeError(400, 'invalid-calculation-report', 'The calculation report contract is invalid.');
  }
  if (value.designFingerprint !== expectedFingerprint) throw new ReviewExchangeError(409, 'calculation-revision-mismatch', 'The calculation report does not match the published drawing revision.');
  if (!Number.isInteger(value.revision) || value.revision < 1 || value.revision > 10_000 || typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) {
    throw new ReviewExchangeError(400, 'invalid-calculation-issue', 'The calculation report issue control is invalid.');
  }
  const boundedArrays = [
    ['platformSystems', 1, 100], ['joistGroups', 0, 500], ['beams', 0, 500], ['postFootingChecks', 0, 1_000],
    ['stairs', 0, 200], ['connections', 0, 2_000], ['checks', 1, 500], ['reviewGates', 0, 500], ['sources', 1, 100], ['limitations', 1, 100],
  ];
  for (const [key, minimum, maximum] of boundedArrays) {
    if (!Array.isArray(value[key]) || value[key].length < minimum || value[key].length > maximum) throw new ReviewExchangeError(400, 'invalid-calculation-content', `The calculation report ${key} collection is invalid.`);
  }
  const basis = value.designBasis;
  if (!basis || ![basis.deadLoadKpa, basis.liveLoadKpa, basis.snowLoadKpa, basis.governingAreaLoadKpa, basis.assumedSoilBearingKpa].every((number) => Number.isFinite(number) && number >= 0 && number <= 10_000)) {
    throw new ReviewExchangeError(400, 'invalid-calculation-basis', 'The calculation report design basis is invalid.');
  }
  const numericKeys = ['spacingMm', 'governingSpanMm', 'lineLoadKnM', 'momentDemandKnM', 'shearDemandKn'];
  if (value.joistGroups.some((group) => !group || typeof group !== 'object' || numericKeys.some((key) => !Number.isFinite(group[key]) || group[key] < 0 || group[key] > 10_000_000))) {
    throw new ReviewExchangeError(400, 'invalid-calculation-demand', 'The calculation report member demands are invalid.');
  }
  const beamNumericKeys = ['lengthMm', 'tributaryWidthMm', 'lineLoadKnM', 'governingBayMm', 'momentDemandKnM', 'shearDemandKn', 'governingPostReactionKn'];
  if (value.beams.some((beam) => !beam || typeof beam !== 'object' || beamNumericKeys.some((key) => !Number.isFinite(beam[key]) || beam[key] < 0 || beam[key] > 10_000_000))) {
    throw new ReviewExchangeError(400, 'invalid-calculation-beam-demand', 'The calculation report beam demands are invalid.');
  }
  if (value.postFootingChecks.some((item) => !item || typeof item !== 'object' || ![item.reactionKn, item.requiredBearingAreaSqM, item.providedBearingAreaSqM, item.bearingPressureKpa].every((number) => Number.isFinite(number) && number >= 0 && number <= 10_000_000) || item.footingDepth !== 'unresolved' || item.status !== 'review-required')) {
    throw new ReviewExchangeError(400, 'invalid-calculation-footing', 'The calculation report footing screens are invalid.');
  }
  if (value.connections.some((connection) => !connection || typeof connection.id !== 'string' || connection.id.length < 2 || connection.id.length > 100 || connection.status !== 'design-required')) {
    throw new ReviewExchangeError(400, 'invalid-calculation-connections', 'The calculation report connection work packages are invalid.');
  }
}

function validateReview(review, expectedFingerprint, publishedSheetIds, calculationReport) {
  if (!review || typeof review !== 'object') throw new ReviewExchangeError(400, 'invalid-review', 'A review decision is required.');
  if (review.designFingerprint !== expectedFingerprint) throw new ReviewExchangeError(409, 'revision-mismatch', 'The review does not match the published design revision.');
  if (!['accepted', 'changes-requested'].includes(review.decision)) throw new ReviewExchangeError(400, 'invalid-decision', 'The review decision is invalid.');
  if (!['engineer', 'architect'].includes(review.issuerRole) || typeof review.issuerName !== 'string' || !review.issuerName.trim() || typeof review.licenseNumber !== 'string' || !review.licenseNumber.trim()) throw new ReviewExchangeError(400, 'invalid-professional', 'A named licensed engineer or architect is required.');
  const expectedRegistry = review.issuerRole === 'engineer' ? 'egbc' : 'aibc';
  const expectedRegistryUrl = expectedRegistry === 'egbc' ? 'https://www.egbc.ca/registrant-directory' : 'https://aibc.ca/resources/online-directory-test/';
  const registryCheckedAt = new Date(review.registryCheckedAt);
  const registryAge = Date.now() - registryCheckedAt.getTime();
  if (review.professionalRegistry !== expectedRegistry || review.registryUrl !== expectedRegistryUrl || review.registryStatus !== 'directory-confirmed-by-user' || !Number.isFinite(registryCheckedAt.getTime()) || registryAge < -60_000 || registryAge > 30 * 86_400_000) throw new ReviewExchangeError(400, 'registry-unconfirmed', 'A current check of the correct official professional directory is required.');
  if (typeof review.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(review.sha256)) throw new ReviewExchangeError(400, 'invalid-digest', 'A SHA-256 digest is required.');
  if (review.mimeType !== 'application/pdf' || typeof review.pdfBase64 !== 'string' || review.pdfBase64.length < 20 || review.pdfBase64.length > 14_000_000) throw new ReviewExchangeError(400, 'invalid-pdf', 'A PDF up to 10 MB is required.');
  const pdf = Buffer.from(review.pdfBase64, 'base64');
  if (pdf.length < 12 || pdf.length > 10_000_000 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new ReviewExchangeError(400, 'invalid-pdf', 'The uploaded document is not a valid PDF payload.');
  if (review.byteSize !== pdf.length) throw new ReviewExchangeError(400, 'size-mismatch', 'The PDF byte size does not match its metadata.');
  if (tokenHashBytes(pdf) !== review.sha256.toLowerCase()) throw new ReviewExchangeError(400, 'digest-mismatch', 'The PDF digest does not match its bytes.');
  validateRedlines(review.redlines || [], expectedFingerprint, review.decision, publishedSheetIds);
  validateStructuralResolutions(review.structuralResolutions || [], calculationReport, expectedFingerprint, review.decision);
}

function validateStructuralResolutions(resolutions, report, expectedFingerprint, decision) {
  if (!Array.isArray(resolutions) || resolutions.length > 2_000) throw new ReviewExchangeError(400, 'invalid-structural-resolutions', 'A review may contain up to 2,000 structural work-package resolutions.');
  if (!report) {
    if (resolutions.length) throw new ReviewExchangeError(400, 'unexpected-structural-resolutions', 'This legacy review package has no structural work-package contract.');
    return;
  }
  const expected = new Map();
  report.platformSystems.forEach((system) => expected.set(`SYS:${system.platformId}`, 'platform-system'));
  [...new Set(report.postFootingChecks.map((item) => item.platformId))].forEach((platformId) => expected.set(`FND:${platformId}`, 'foundation-system'));
  report.stairs.forEach((stair) => expected.set(`STAIR:${stair.id}`, 'stair-system'));
  report.connections.forEach((connection) => expected.set(connection.id, 'connection'));
  const ids = new Set(); const workPackageIds = new Set();
  for (const resolution of resolutions) {
    if (!resolution || resolution.schema !== 'permitly-professional-work-resolution/v1' || typeof resolution.id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(resolution.id) || ids.has(resolution.id)) throw new ReviewExchangeError(400, 'invalid-structural-resolution-id', 'Every structural resolution requires a unique valid identifier.');
    ids.add(resolution.id);
    if (!expected.has(resolution.workPackageId) || expected.get(resolution.workPackageId) !== resolution.kind || workPackageIds.has(resolution.workPackageId)) throw new ReviewExchangeError(400, 'invalid-structural-work-package', 'Every structural resolution must target one unique work package in this review issue.');
    workPackageIds.add(resolution.workPackageId);
    if (resolution.designFingerprint !== expectedFingerprint) throw new ReviewExchangeError(409, 'structural-resolution-revision-mismatch', 'A structural resolution does not match the published design revision.');
    if (!['specified', 'covered-by-sealed-document', 'not-applicable'].includes(resolution.disposition)) throw new ReviewExchangeError(400, 'invalid-structural-disposition', 'A structural resolution disposition is invalid.');
    if (!boundedText(resolution.documentReference, 3, 200)) throw new ReviewExchangeError(400, 'missing-structural-reference', 'Each structural resolution needs a drawing, calculation, or sealed-document reference.');
    if (resolution.disposition === 'specified' && (!boundedText(resolution.specification, 5, 2_000) || !boundedText(resolution.capacityBasis, 5, 2_000))) throw new ReviewExchangeError(400, 'incomplete-structural-specification', 'A specified resolution needs both a specification and capacity basis.');
    if (resolution.disposition !== 'specified' && !boundedText(resolution.notes, 5, 2_000)) throw new ReviewExchangeError(400, 'incomplete-structural-note', 'A deferred or not-applicable resolution needs an explanatory note.');
    const recordedAt = Date.parse(resolution.recordedAt);
    if (!Number.isFinite(recordedAt) || recordedAt > Date.now() + 60_000) throw new ReviewExchangeError(400, 'invalid-structural-resolution-date', 'A structural resolution timestamp is invalid.');
  }
  if (decision === 'accepted' && workPackageIds.size !== expected.size) throw new ReviewExchangeError(400, 'unresolved-structural-work-packages', `An accepted review must resolve all ${expected.size} structural work packages; ${expected.size - workPackageIds.size} remain unanswered.`);
}

function boundedText(value, minimum, maximum) { return typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum; }

function validateRedlines(redlines, expectedFingerprint, decision, publishedSheetIds) {
  if (!Array.isArray(redlines) || redlines.length > 100) throw new ReviewExchangeError(400, 'invalid-redlines', 'A review may contain up to 100 sheet redlines.');
  const ids = new Set();
  const sheetIds = new Set(publishedSheetIds);
  const categories = new Set(['code', 'structure', 'site', 'coordination', 'documentation']);
  for (const redline of redlines) {
    if (!redline || typeof redline !== 'object' || typeof redline.id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(redline.id) || ids.has(redline.id)) throw new ReviewExchangeError(400, 'invalid-redline-id', 'Every redline requires a unique identifier.');
    ids.add(redline.id);
    if (redline.designFingerprint !== expectedFingerprint || !sheetIds.has(redline.sheetId)) throw new ReviewExchangeError(409, 'redline-revision-mismatch', 'A redline does not match the published drawing revision.');
    if (!categories.has(redline.category) || !['required', 'advisory'].includes(redline.severity)) throw new ReviewExchangeError(400, 'invalid-redline-type', 'A redline category or severity is invalid.');
    if (typeof redline.title !== 'string' || redline.title.trim().length < 3 || redline.title.trim().length > 120 || typeof redline.comment !== 'string' || redline.comment.trim().length < 5 || redline.comment.trim().length > 2_000) throw new ReviewExchangeError(400, 'invalid-redline-text', 'Every redline requires bounded title and comment text.');
    if (!Number.isFinite(redline.anchor?.xPercent) || !Number.isFinite(redline.anchor?.yPercent) || redline.anchor.xPercent < 0 || redline.anchor.xPercent > 100 || redline.anchor.yPercent < 0 || redline.anchor.yPercent > 100) throw new ReviewExchangeError(400, 'invalid-redline-anchor', 'Every redline marker must fall within its drawing sheet.');
  }
  const requiredCount = redlines.filter((redline) => redline.severity === 'required').length;
  if (decision === 'changes-requested' && requiredCount === 0) throw new ReviewExchangeError(400, 'missing-required-redline', 'A change request requires at least one required sheet redline.');
  if (decision === 'accepted' && requiredCount > 0) throw new ReviewExchangeError(400, 'accepted-with-required-redline', 'An accepted review may contain advisory redlines only.');
}

function tokenHashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function publicReview(review) {
  const { pdfBase64: _pdf, ...metadata } = review;
  return metadata;
}
