import type { Address, BuildingFootprint, EvidenceSource, Parcel } from '../../types';

export interface PropertyDataResult {
  parcel: Parcel;
  buildings: BuildingFootprint[];
  evidence: EvidenceSource[];
}

export interface PropertyDataProvider {
  readonly id: string;
  readonly version: string;
  supports(address: Address): boolean;
  lookup(address: Address): Promise<PropertyDataResult>;
  suggestAddresses?(address: Address, requestedAddress: string): Promise<string[]>;
}

export type PropertyDataErrorCode = 'unsupported-jurisdiction' | 'not-found' | 'provider-unavailable' | 'invalid-response';

export class PropertyDataError extends Error {
  constructor(
    public readonly code: PropertyDataErrorCode,
    message: string,
    public readonly providerId: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = 'PropertyDataError';
    if (options?.cause !== undefined) {
      Object.defineProperty(this, 'cause', { value: options.cause, enumerable: false });
    }
  }
}
