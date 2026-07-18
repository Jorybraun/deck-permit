import type { Address } from '../../types';
import type { PropertyDataProvider } from './types';
import { SidneyPropertyProvider } from './sidneyProvider';
import { VancouverPropertyProvider } from './vancouverProvider';

const providers: PropertyDataProvider[] = [new SidneyPropertyProvider(), new VancouverPropertyProvider()];

export function findPropertyDataProvider(address: Address): PropertyDataProvider | null {
  return providers.find((provider) => provider.supports(address)) || null;
}
