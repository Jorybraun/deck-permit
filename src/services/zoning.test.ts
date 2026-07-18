import { describe, expect, it } from 'vitest';
import type { Parcel } from '../types';
import { lookupZoning } from './zoning';

const parcel: Parcel = {
  pid: '007-952-449', pidRaw: '007952449', parcelName: '', planNumber: '1197', municipality: 'Town of Sidney',
  ownerType: '', parcelClass: '', areaSqm: 465, zoningCode: 'R2', center: [-123.399, 48.659], geometrySource: 'live',
  polygon: [[-123.400, 48.658], [-123.398, 48.658], [-123.398, 48.660], [-123.400, 48.660], [-123.400, 48.658]],
};

describe('Sidney zoning rules', () => {
  it('uses current Bylaw 2275 R2 spatial regulations', () => {
    expect(lookupZoning(parcel)).toMatchObject({
      zone: 'R2',
      setbacks: { front: 4.5, rear: 4.5, side: 2, exteriorSide: 3 },
      maxLotCoverage: 45,
      maxHeight: 10.5,
    });
  });
});
