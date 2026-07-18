import { useState } from 'react';
import { useStore } from '../../state/store';
import { lookupProperty, PropertyLookupError } from '../../services/propertyLookup';
import { lookupZoning, computeBuildableEnvelope, lookupSnowLoad } from '../../services/zoning';

export function LandStep() {
  const setProperty = useStore((s) => s.setProperty);
  const setStep = useStore((s) => s.setStep);
  const setLoading = useStore((s) => s.setLoading);
  const setError = useStore((s) => s.setError);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);

  const [address, setAddress] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleStart = async (addressOverride?: string) => {
    const requestedAddress = addressOverride || address;
    if (!requestedAddress.trim()) return;
    if (addressOverride) setAddress(addressOverride);
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const { address: addr, parcel, buildings, evidence } = await lookupProperty(requestedAddress.trim());
      const zoning = lookupZoning(parcel);
      const envelope = computeBuildableEnvelope(parcel, zoning);
      const snowLoad = lookupSnowLoad(addr.coordinates[1], addr.coordinates[0]);

      setProperty({
        address: addr,
        parcel,
        zoning,
        buildableEnvelope: envelope,
        snowLoad,
        buildings,
        evidence,
      });
      setStep('lot');
    } catch (err) {
      if (err instanceof PropertyLookupError) setSuggestions(err.suggestions);
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Get a permit-ready deck plan in about 10 minutes.
        </h2>
        <p className="text-text-secondary mb-8">
          Enter your address. We'll pull your lot data, check the bylaws, and guide you through the rest.
        </p>

        <div className="space-y-3">
          <input
            aria-label="Property address"
            type="text"
            value={address}
            onChange={(e) => { setAddress(e.target.value); if (error) setError(null); if (suggestions.length) setSuggestions([]); }}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleStart()}
            placeholder="2423 Lovell Ave, Sidney, BC"
            className="w-full px-4 py-3 rounded-lg border border-border text-base focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
            disabled={loading}
          />
          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}
          {suggestions.length > 0 && <div className="space-y-2" aria-label="Verified address suggestions">
            {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void handleStart(suggestion)} disabled={loading} className="w-full rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-primary/10">Use {suggestion}</button>)}
          </div>}
          <button
            onClick={() => void handleStart()}
            disabled={loading || !address.trim()}
            className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Looking up your property...' : 'Start'}
          </button>
        </div>

        <div className="mt-8 text-xs text-text-secondary">
          <p>Currently supporting: Sidney, BC</p>
          <p className="mt-1">Data: BC Address Geocoder + municipal GIS (open data)</p>
        </div>
      </div>
    </div>
  );
}
