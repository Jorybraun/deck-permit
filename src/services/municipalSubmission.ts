import type { PermitManifest, PermitSubmissionRecord, SubmissionReadiness } from '../types';
import { sha256Blob } from './fileDigest';

export interface MunicipalPackageArtifact {
  blob: Blob;
  kind: 'professional-review' | 'ready-to-submit';
  fileNames?: string[];
  byteSize?: number;
}

export interface MunicipalDeliveryCapabilities {
  configured: boolean;
  provider: 'resend';
  jurisdiction: string;
  recipient: string;
  maxPackageBytes: number;
  authorizationRequired: true;
  deliveryMeaning: string;
}

export async function getMunicipalDeliveryCapabilities(fetcher: typeof fetch = fetch): Promise<MunicipalDeliveryCapabilities> {
  const response = await fetcher('/api/municipal-submission/capabilities', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Municipal delivery capability could not be confirmed.');
  return response.json();
}

export async function deliverSidneyPermitPackage(input: {
  artifact: MunicipalPackageArtifact;
  manifest: PermitManifest;
  readiness: SubmissionReadiness;
  ownerEmail: string;
  address: string;
  pid: string;
  ownerAuthorized: boolean;
}, fetcher: typeof fetch = fetch): Promise<PermitSubmissionRecord> {
  if (input.artifact.kind !== 'ready-to-submit' || input.readiness.status !== 'ready-to-submit') throw new Error('Only a package with every recorded evidence gate satisfied can be delivered.');
  const packageSha256 = await sha256Blob(input.artifact.blob);
  const fileName = `sidney-deck-permit-${safePart(input.address)}-${input.manifest.designFingerprint.toLowerCase()}.zip`;
  const response = await fetcher('/api/municipal-submission/sidney', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      ownerAuthorized: input.ownerAuthorized,
      ownerEmail: input.ownerEmail,
      readinessStatus: input.readiness.status,
      manifest: { designFingerprint: input.manifest.designFingerprint, revision: input.manifest.revision, issueId: input.manifest.issueId },
      subject: `Building permit application — ${input.address} — Rev ${input.manifest.revision} ${input.manifest.designFingerprint}`,
      message: `Town of Sidney Development Services,\n\nAttached is the controlled building permit application package for a proposed residential deck at ${input.address} (PID ${input.pid}).\n\nDrawing issue: Rev ${input.manifest.revision} · ${input.manifest.designFingerprint}\nPackage SHA-256: ${packageSha256}\n\nPlease reply to the authorized applicant email with the municipal file number, fee instructions, and any completeness comments.`,
      package: { fileName, mimeType: 'application/zip', byteSize: input.artifact.blob.size, sha256: packageSha256, base64: await blobToBase64(input.artifact.blob) },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'The municipal delivery service did not accept the package.');
  return result as PermitSubmissionRecord;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

function safePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'project';
}
