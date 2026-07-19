import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SIDNEY_PERMIT_RECIPIENT = 'developmentservices@sidney.ca';
const MAX_PACKAGE_BYTES = 14_000_000;

export class MunicipalDeliveryError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Owner-authorized email delivery with idempotent, immutable provider receipts. */
export class MunicipalDeliveryService {
  constructor({ apiKey, fromEmail, dataDirectory, fetcher = fetch }) {
    this.apiKey = apiKey || '';
    this.fromEmail = fromEmail || '';
    this.dataDirectory = dataDirectory;
    this.fetcher = fetcher;
  }

  capabilities() {
    return {
      configured: Boolean(this.apiKey && this.fromEmail),
      provider: 'resend',
      jurisdiction: 'Town of Sidney',
      recipient: SIDNEY_PERMIT_RECIPIENT,
      maxPackageBytes: MAX_PACKAGE_BYTES,
      authorizationRequired: true,
      deliveryMeaning: 'Accepted by the email provider for transmission; Town receipt, completeness review, file number, fees, and permit status remain unconfirmed.',
    };
  }

  async submit(input) {
    if (!this.capabilities().configured) throw new MunicipalDeliveryError(503, 'delivery-not-configured', 'Secure municipal email delivery is not configured on this server.');
    validateSubmission(input);
    const packageBytes = Buffer.from(input.package.base64, 'base64');
    if (packageBytes.length !== input.package.byteSize || packageBytes.length > MAX_PACKAGE_BYTES) throw new MunicipalDeliveryError(400, 'invalid-package-size', 'The attached permit package size is invalid or exceeds the delivery limit.');
    const packageSha256 = createHash('sha256').update(packageBytes).digest('hex');
    if (packageSha256 !== input.package.sha256.toLowerCase()) throw new MunicipalDeliveryError(400, 'package-integrity-failed', 'The attached permit package failed its SHA-256 integrity check.');

    const receiptKey = createHash('sha256').update(`${input.manifest.designFingerprint}:${packageSha256}:${input.ownerEmail.toLowerCase()}`).digest('hex');
    const existing = await this.readReceipt(receiptKey);
    if (existing) return { ...existing, duplicatePrevented: true };

    const result = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', 'idempotency-key': `permit-${receiptKey}` },
      body: JSON.stringify({
        from: `Permitly permit delivery <${this.fromEmail}>`,
        to: [SIDNEY_PERMIT_RECIPIENT],
        reply_to: input.ownerEmail,
        subject: input.subject,
        text: input.message,
        attachments: [{ filename: input.package.fileName, content: input.package.base64 }],
      }),
    });
    const responseBody = await result.json().catch(() => ({}));
    if (!result.ok || typeof responseBody.id !== 'string') throw new MunicipalDeliveryError(502, 'delivery-provider-failed', 'The email delivery provider did not accept the permit package. No submission receipt was recorded.');

    const receipt = {
      id: `SUB-${receiptKey.slice(0, 12).toUpperCase()}`,
      provider: 'resend',
      providerMessageId: responseBody.id,
      recipient: SIDNEY_PERMIT_RECIPIENT,
      submittedAt: new Date().toISOString(),
      designFingerprint: input.manifest.designFingerprint,
      revision: input.manifest.revision,
      packageFileName: input.package.fileName,
      packageByteSize: packageBytes.length,
      packageSha256,
      status: 'delivered-to-email-provider',
      deliveryMeaning: 'Accepted by the email provider for transmission; Town receipt, completeness review, file number, fees, and permit status remain unconfirmed.',
    };
    await this.writeReceipt(receiptKey, receipt);
    return receipt;
  }

  async readReceipt(key) {
    try { return JSON.parse(await readFile(join(this.dataDirectory, 'municipal-submissions', `${key}.json`), 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  }

  async writeReceipt(key, receipt) {
    const directory = join(this.dataDirectory, 'municipal-submissions');
    await mkdir(directory, { recursive: true });
    try { await writeFile(join(directory, `${key}.json`), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
}

function validateSubmission(input) {
  if (!input || input.ownerAuthorized !== true) throw new MunicipalDeliveryError(400, 'owner-authorization-required', 'The property owner or authorized applicant must explicitly authorize delivery.');
  if (input.readinessStatus !== 'ready-to-submit') throw new MunicipalDeliveryError(409, 'package-not-ready', 'Only a package with every recorded evidence gate satisfied can be delivered.');
  if (!/^DP-[A-F0-9]{8}$/i.test(input.manifest?.designFingerprint || '') || !Number.isInteger(input.manifest?.revision) || input.manifest.revision < 1) throw new MunicipalDeliveryError(400, 'invalid-manifest', 'The controlled drawing manifest is invalid.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ownerEmail || '')) throw new MunicipalDeliveryError(400, 'invalid-owner-email', 'A valid owner or applicant reply-to email is required.');
  if (typeof input.subject !== 'string' || input.subject.length < 12 || input.subject.length > 180 || typeof input.message !== 'string' || input.message.length < 40 || input.message.length > 5000) throw new MunicipalDeliveryError(400, 'invalid-message', 'The municipal delivery subject or message is invalid.');
  const attachment = input.package;
  if (!attachment || attachment.mimeType !== 'application/zip' || !/\.zip$/i.test(attachment.fileName || '') || !/^[a-f0-9]{64}$/i.test(attachment.sha256 || '') || typeof attachment.base64 !== 'string') throw new MunicipalDeliveryError(400, 'invalid-package', 'A valid ZIP permit package and SHA-256 digest are required.');
}
