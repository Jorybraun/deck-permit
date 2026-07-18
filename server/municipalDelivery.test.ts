import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MunicipalDeliveryError, MunicipalDeliveryService, SIDNEY_PERMIT_RECIPIENT } from './municipalDelivery.mjs';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function service(fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'provider-123' }), { status: 200, headers: { 'content-type': 'application/json' } }))) {
  const directory = await mkdtemp(join(tmpdir(), 'permit-delivery-'));
  directories.push(directory);
  return { delivery: new MunicipalDeliveryService({ apiKey: 'secret', fromEmail: 'permits@example.com', dataDirectory: directory, fetcher }), fetcher };
}

function validInput() {
  const bytes = Buffer.from('validated permit zip');
  return {
    ownerAuthorized: true, ownerEmail: 'owner@example.com', readinessStatus: 'ready-to-submit',
    manifest: { designFingerprint: 'DP-ABCDEF12', revision: 2, issueId: 'ISSUE-02-DP-ABCDEF12' },
    subject: 'Building permit application — 12 Test St — Rev 2 DP-ABCDEF12',
    message: 'Town of Sidney Development Services, attached is the controlled permit application package for review.',
    package: { fileName: 'permit.zip', mimeType: 'application/zip', byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') },
  };
}

describe('municipal delivery boundary', () => {
  it('reports unavailable unless both provider credentials are configured', () => {
    const delivery = new MunicipalDeliveryService({ apiKey: '', fromEmail: '', dataDirectory: 'unused' });
    expect(delivery.capabilities()).toMatchObject({ configured: false, recipient: SIDNEY_PERMIT_RECIPIENT, authorizationRequired: true });
  });

  it('requires explicit owner authorization and a ready package', async () => {
    const { delivery } = await service();
    await expect(delivery.submit({ ...validInput(), ownerAuthorized: false })).rejects.toMatchObject({ code: 'owner-authorization-required' } satisfies Partial<MunicipalDeliveryError>);
    await expect(delivery.submit({ ...validInput(), readinessStatus: 'review-package' })).rejects.toMatchObject({ code: 'package-not-ready' } satisfies Partial<MunicipalDeliveryError>);
  });

  it('verifies package bytes, sends only to Sidney, and reuses the immutable receipt', async () => {
    const { delivery, fetcher } = await service();
    const first = await delivery.submit(validInput());
    const repeated = await delivery.submit(validInput());
    expect(first).toMatchObject({ providerMessageId: 'provider-123', status: 'delivered-to-email-provider', recipient: SIDNEY_PERMIT_RECIPIENT });
    expect(repeated).toMatchObject({ id: first.id, duplicatePrevented: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(request.to).toEqual([SIDNEY_PERMIT_RECIPIENT]);
  });

  it('rejects altered attachment bytes before provider delivery', async () => {
    const { delivery, fetcher } = await service();
    const input = validInput();
    input.package.base64 = Buffer.from('altered').toString('base64');
    await expect(delivery.submit(input)).rejects.toMatchObject({ code: 'invalid-package-size' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
