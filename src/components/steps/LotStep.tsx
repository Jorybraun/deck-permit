import { useStore } from '../../state/store';

export function LotStep() {
  const property = useStore((s) => s.property);
  const setStep = useStore((s) => s.setStep);
  const markStepComplete = useStore((s) => s.markStepComplete);

  if (!property.address || !property.parcel) {
    return <div className="p-6 text-text-secondary">No property data. Go back and enter an address.</div>;
  }

  const { address, parcel, zoning, snowLoad } = property;

  const handleContinue = () => {
    markStepComplete('lot');
    setStep('vision');
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-1">Your Lot</h2>
        <p className="text-sm text-text-secondary">
          Municipal parcel facts and rooflines are shown with their source and confidence. Confirm them against your survey before submission.
        </p>
      </div>

      {/* Property summary */}
      <div className="space-y-3">
        <DataRow label="Address" value={address.fullAddress} />
        <DataRow label="PID" value={parcel.pid} />
        <DataRow label="Plan Number" value={parcel.planNumber} />
        {parcel.legalDescription && <DataRow label="Legal Description" value={parcel.legalDescription} />}
        <DataRow label="Municipality" value={parcel.municipality} />
        <DataRow label="Lot Area" value={`${parcel.areaSqm.toFixed(0)} m² (${(parcel.areaSqm * 10.764).toFixed(0)} sq ft)`} />
        {parcel.yearBuilt && <DataRow label="Municipal Year Built" value={parcel.yearBuilt} />}
        <DataRow label="Building Rooflines" value={`${property.buildings.length} found${property.buildings.length ? ' (largest treated as house)' : ''}`} />
      </div>

      {parcel.geometrySource === 'pilot-estimate' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <strong className="block">Pilot parcel estimate</strong>
          ParcelMap BC did not return a boundary for this address, so the canvas uses an approximate lot for the demo. Verify the survey and legal parcel before submission.
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Evidence & confidence</h3>
        {property.evidence.map((source) => (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-border bg-white p-3 hover:border-primary/40"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-text-primary">{source.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${source.status === 'authoritative' ? 'bg-emerald-50 text-emerald-700' : source.status === 'reference' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800'}`}>
                {source.status}
              </span>
            </div>
            {source.notes && <p className="mt-1 text-xs leading-5 text-text-secondary">{source.notes}</p>}
          </a>
        ))}
        {property.buildings.length > 0 && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            The house shape comes from a municipal roofline layer. It may include eaves and does not prove wall or foundation locations. The CAD model treats it as reference geometry.
          </p>
        )}
      </div>

      {/* Zoning */}
      {zoning && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Zoning & Setbacks</h3>
          <div className="bg-surface rounded-lg p-4 space-y-2">
            <DataRow label="Zone" value={zoning.zone} />
            <DataRow label="Front Setback" value={`${zoning.setbacks.front} m`} />
            <DataRow label="Rear Setback" value={`${zoning.setbacks.rear} m`} />
            <DataRow label="Side Setback" value={`${zoning.setbacks.side} m`} />
            <DataRow label="Max Lot Coverage" value={`${zoning.maxLotCoverage}%`} />
            <DataRow label="Max Height" value={`${zoning.maxHeight} m`} />
          </div>
          <div className="text-xs text-text-secondary bg-surface rounded-lg p-3">
            <p className="font-medium mb-1">Source:</p>
            <p>{zoning.source}</p>
            {zoning.notes.map((note, i) => (
              <p key={i} className="mt-1">• {note}</p>
            ))}
          </div>
        </div>
      )}

      {/* Snow load */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Design Loads</h3>
        <div className="bg-surface rounded-lg p-4">
          <DataRow label="Snow Load" value={`${snowLoad} kPa`} />
          <DataRow label="Occupancy Load" value="1.9 kPa (BCBC 9.4.2.3)" />
          <DataRow label="Design Load" value={`${Math.max(snowLoad, 1.9)} kPa (greater of snow/occupancy)`} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setStep('land')}
          className="px-4 py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          className="flex-1 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover text-sm"
        >
          Looks right — continue
        </button>
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary font-medium">{value}</span>
    </div>
  );
}
