import { ExternalLink } from 'lucide-react';
import { useStore } from '../../state/store';
import { rebuildDeck, sizeStructure } from '../../services/deckSizing';
import { runComplianceCheck } from '../../services/compliance';
import { ExistingConditionsPanel } from '../ExistingConditionsPanel';
import { ledgerConditionSummary } from '../../services/existingConditions';
import { analyzeStructure } from '../../services/structuralAnalysis';
import { FramingLayoutPanel } from '../FramingLayoutPanel';

export function StructureStep() {
  const deck = useStore((state) => state.deck);
  const property = useStore((state) => state.property);
  const setDeck = useStore((state) => state.setDeck);
  const setCompliance = useStore((state) => state.setCompliance);
  const setExistingConditions = useStore((state) => state.setExistingConditions);
  const setStep = useStore((state) => state.setStep);
  const markStepComplete = useStore((state) => state.markStepComplete);

  if (!deck) return <div className="p-6 text-text-secondary">Design your deck first.</div>;

  const selection = deck.structure.selection;
  const supported = selection.status === 'table-supported';
  const report = analyzeStructure(property, deck);
  const requiredFootingSideMm = Math.ceil(Math.sqrt(report.quantities.requiredFootingAreaSqm) * 1000 / 25) * 25;
  const footingBearingPass = report.quantities.providedFootingAreaSqm >= report.quantities.requiredFootingAreaSqm;

  const selectTreatment = (treatment: 'incised' | 'not-incised') => {
    const nextStructure = sizeStructure(
      deck.dimensions.depth,
      deck.dimensions.width,
      deck.footprint.heightAboveGrade,
      property.snowLoad,
      { treatment, shape: deck.footprint.shape, attachedToHouse: deck.footprint.attachedToHouse }
    );
    nextStructure.deckingMaterial = deck.structure.deckingMaterial;
    nextStructure.deckingThickness = deck.structure.deckingThickness;
    const nextDeck = { ...deck, structure: nextStructure };
    setDeck(nextDeck);
    setCompliance(runComplianceCheck(nextDeck, property));
  };

  const handleContinue = () => {
    markStepComplete('structure');
    setStep('safety');
  };

  const applyBearingFooting = () => {
    const nextDeck = { ...deck, structure: { ...deck.structure, footingSize: Math.max(300, requiredFootingSideMm) } };
    setDeck(nextDeck);
    setCompliance(runComplianceCheck(nextDeck, property));
  };

  const applyLayout = (nextDeck: typeof deck) => {
    setDeck(nextDeck);
    setCompliance(runComplianceCheck(nextDeck, property));
  };

  const saveExistingConditions = (conditions: import('../../types').ExistingHouseConditions) => {
    if (!property.parcel) return;
    const nextDeck = rebuildDeck(deck, property, { attachedToHouse: true, houseWall: conditions.attachmentWall });
    nextDeck.structure.ledgerAttachment = ledgerConditionSummary(conditions);
    setDeck(nextDeck);
    setExistingConditions(conditions);
    setCompliance(runComplianceCheck(nextDeck, { ...property, existingConditions: conditions }));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-1">Traceable structure</h2>
        <p className="text-sm text-text-secondary">
          Joists, beam, and posts are selected only inside the published Canadian Wood Council table scope. Excluded systems stay visible for professional review.
        </p>
      </div>

      {deck.footprint.attachedToHouse && (
        <ExistingConditionsPanel property={property} deck={deck} value={property.existingConditions || null} onSave={saveExistingConditions} />
      )}

      <div className={`rounded-lg border p-4 ${supported ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${supported ? 'text-success' : 'text-danger'}`}>
              {supported ? 'CWC table supported' : 'Engineering required'}
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {supported
                ? `${selection.joistTable} joists · ${selection.beamTable} beam · ${selection.sourceEdition}`
                : selection.reason}
            </p>
          </div>
          <a href={selection.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary" aria-label="Open CWC deck span guide"><ExternalLink size={16} /></a>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-text-primary mb-2 block">Structural lumber treatment</label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => selectTreatment('incised')} className={`px-3 py-2 rounded-lg border text-sm font-medium ${deck.structure.lumberTreatment === 'incised' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-secondary'}`}>Incised treated</button>
          <button onClick={() => selectTreatment('not-incised')} className={`px-3 py-2 rounded-lg border text-sm font-medium ${deck.structure.lumberTreatment === 'not-incised' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-secondary'}`}>Not incised</button>
        </div>
        <p className="text-xs text-text-secondary mt-2">Confirm the grade stamp and whether preservative treatment has incised the lumber. This selects different CWC tables.</p>
      </div>

      <div className="bg-surface rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Framing schedule</h3>
        <StructRow label="Joists" value={`${deck.structure.joistSize} @ ${deck.structure.joistSpacing} mm o.c.`} sub={`${deck.structure.joistSpecies}${selection.joistMaxSpanM ? ` · max table span ${selection.joistMaxSpanM.toFixed(2)} m` : ''}`} />
        <StructRow label="Beam" value={deck.structure.beamSize} sub={selection.beamLookupSpanM ? `${selection.beamTable} lookup at ${selection.beamLookupSpanM.toFixed(2)} m joist span` : 'Engineer design'} />
        <StructRow label="Posts" value={deck.structure.postSize} sub={`@ ≤ ${deck.structure.postSpacing} m spacing`} />
        <StructRow label="Footings" value={`${deck.structure.footingSize}×${deck.structure.footingSize} mm preliminary pad`} sub="Excluded from CWC span guide; soil and frost review required" />
        <StructRow label="Ledger" value={deck.footprint.attachedToHouse ? deck.structure.ledgerAttachment : 'Freestanding support system'} sub="Excluded from CWC span guide" />
      </div>

      <FramingLayoutPanel deck={deck} onChange={applyLayout} />

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-text-primary">Live load path</h3><p className="mt-0.5 text-xs text-text-secondary">Demand values update with the parametric geometry. Table capacity and unresolved professional criteria remain separate.</p></div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${footingBearingPass ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{footingBearingPass ? 'Bearing screen passes' : 'Footing undersized'}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LoadMetric label="Total gravity load" value={`${report.quantities.totalDesignLoadKn.toFixed(2)} kN`} />
          <LoadMetric label="Joist table use" value={report.quantities.joistSpanUtilization === null ? 'No table capacity' : `${(report.quantities.joistSpanUtilization * 100).toFixed(1)}%`} caution={report.quantities.joistSpanUtilization === null || report.quantities.joistSpanUtilization > 1} />
          <LoadMetric label="Beam supports" value={`${report.quantities.postsPerBeam}/beam @ ${report.quantities.actualPostSpacingM.toFixed(3)} m`} />
          <LoadMetric label="Governing post reaction" value={`${report.quantities.governingPostReactionKn.toFixed(2)} kN`} />
          <LoadMetric label="House ledger reaction" value={deck.footprint.attachedToHouse ? `${report.quantities.ledgerReactionKn.toFixed(2)} kN` : 'Not applicable'} caution={deck.footprint.attachedToHouse} />
          <LoadMetric label="Bearing-only footing side" value={`${requiredFootingSideMm} mm calculated`} caution={!footingBearingPass} />
        </div>
        {!footingBearingPass && <button onClick={applyBearingFooting} className="w-full rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">Increase model pad to {Math.max(300, requiredFootingSideMm)} × {Math.max(300, requiredFootingSideMm)} mm</button>}
        <p className="text-[10px] leading-relaxed text-text-secondary">Footing result uses {report.designBasis.assumedSoilBearingKpa} kPa assumed soil bearing and does not establish soil, frost, thickness, reinforcement, uplift, or lateral adequacy.</p>
      </div>

      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
        <h3 className="text-sm font-semibold text-text-primary">Outside the table pass</h3>
        <p className="mt-1 text-xs text-text-secondary">{selection.exclusions.join(' · ')}. These require verified details and qualified review before submission.</p>
      </div>

      {deck.stairs.enabled && (
        <div className="bg-surface rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Stairs</h3>
          <StructRow label="Risers" value={`${deck.stairs.numRisers} @ ${deck.stairs.riserHeight} mm`} />
          <StructRow label="Treads" value={`${deck.stairs.treadRun} mm deep`} />
          <StructRow label="Width" value={`${(deck.stairs.width * 1000).toFixed(0)} mm`} />
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={() => setStep('shape')} className="px-4 py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm">Back</button>
        <button onClick={handleContinue} className="flex-1 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover text-sm">
          Continue to code check
        </button>
      </div>
    </div>
  );
}

function StructRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="flex justify-between items-start gap-4"><span className="text-sm text-text-secondary">{label}</span><div className="text-right"><div className="text-sm text-text-primary font-medium">{value}</div>{sub && <div className="text-xs text-text-secondary">{sub}</div>}</div></div>;
}

function LoadMetric({ label, value, caution = false }: { label: string; value: string; caution?: boolean }) {
  return <div className={`rounded-md p-2 ${caution ? 'bg-warning/5' : 'bg-surface'}`}><div className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</div><div className={`mt-0.5 text-sm font-semibold ${caution ? 'text-warning' : 'text-text-primary'}`}>{value}</div></div>;
}
