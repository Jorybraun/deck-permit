import { describe, expect, it, vi } from 'vitest';
import { deliverSidneyPermitPackage, getMunicipalDeliveryCapabilities } from './municipalSubmission';

describe('municipal submission client', () => {
  it('reads server capability without claiming configuration', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ configured: false, provider: 'resend', jurisdiction: 'Town of Sidney', recipient: 'developmentservices@sidney.ca', maxPackageBytes: 1, authorizationRequired: true, deliveryMeaning: 'provider only' }), { status: 200 }));
    await expect(getMunicipalDeliveryCapabilities(fetcher as typeof fetch)).resolves.toMatchObject({ configured: false, jurisdiction: 'Town of Sidney' });
  });

  it('fails locally before upload when the package is not ready', async () => {
    const fetcher = vi.fn();
    await expect(deliverSidneyPermitPackage({
      artifact: { blob: new Blob(['zip'], { type: 'application/zip' }), kind: 'professional-review', fileNames: [], byteSize: 3 },
      manifest: { issueId: 'i', revision: 1, designFingerprint: 'DP-ABCDEF12', generatedAt: '', issuePurpose: 'professional-review', address: '12 Test St', pid: '1', sheetIds: [], status: 'professional-review' },
      readiness: { status: 'review-package', confirmedCount: 0, requiredCount: 1, gates: [], summary: '' }, ownerEmail: 'owner@example.com', address: '12 Test St', pid: '1', ownerAuthorized: true,
    }, fetcher as typeof fetch)).rejects.toThrow('every recorded evidence gate');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
