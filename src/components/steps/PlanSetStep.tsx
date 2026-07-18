import { useState } from 'react';
import { useStore } from '../../state/store';
import { downloadPrintablePackage, openPrintablePackage } from '../../services/printablePackage';
import { downloadVectorPlanPdf } from '../../services/vectorPlanPdf';

export function PlanSetStep() {
  const property = useStore((state) => state.property);
  const deck = useStore((state) => state.deck);
  const compliance = useStore((state) => state.compliance);
  const planset = useStore((state) => state.planset);
  const report = useStore((state) => state.structuralReport);
  const readiness = useStore((state) => state.submissionReadiness);
  const setPlanset = useStore((state) => state.setPlanset);
  const setStructuralReport = useStore((state) => state.setStructuralReport);
  const setSubmissionReadiness = useStore((state) => state.setSubmissionReadiness);
  const setPermitManifest = useStore((state) => state.setPermitManifest);
  const issueDrawingPackage = useStore((state) => state.issueDrawingPackage);
  const manifest = useStore((state) => state.permitManifest);
  const setStep = useStore((state) => state.setStep);
  const markStepComplete = useStore((state) => state.markStepComplete);
  const [printError, setPrintError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

  if (!deck || !property.parcel) {
    return <div className="p-6 text-text-secondary">Complete the previous steps first.</div>;
  }

  const unresolvedErrors = compliance.filter((issue) => issue.severity === 'error' && !issue.resolved);
  const unresolvedWarnings = compliance.filter((issue) => issue.severity === 'warning' && !issue.resolved);

  const handleGenerate = () => {
    issueDrawingPackage();
  };

  const handlePrint = () => {
    if (!planset) return;
    setPrintError(openPrintablePackage(property, planset) ? '' : 'Your browser blocked the print window. Allow pop-ups and try again.');
  };

  const handlePdf = async () => {
    if (!planset) return;
    setPdfBusy(true); setPrintError(''); setPdfReady(false);
    try { await downloadVectorPlanPdf(property, planset, manifest); setPdfReady(true); }
    catch (reason) { setPrintError(reason instanceof Error ? reason.message : 'The vector PDF could not be generated.'); }
    finally { setPdfBusy(false); }
  };

  const handleContinue = () => {
    markStepComplete('planset');
    setStep('submit');
  };

  if (!planset || !report || !readiness) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">Architectural plan set</h2>
          <p className="text-sm text-text-secondary">
            Generate seven coordinated 11×17 drawings from the editable model, including measured framing, elevation, connection/guard/stair criteria, and traceable calculations.
          </p>
        </div>

        <div className="bg-surface rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Deck" value={`${deck.dimensions.width.toFixed(2)} × ${deck.dimensions.depth.toFixed(2)} m`} />
            <Metric label="Height" value={`${(deck.footprint.heightAboveGrade * 1000).toFixed(0)} mm`} />
            <Metric label="Code errors" value={`${unresolvedErrors.length}`} caution={unresolvedErrors.length > 0} />
            <Metric label="Review notes" value={`${unresolvedWarnings.length}`} caution={unresolvedWarnings.length > 0} />
          </div>
          <p className="text-xs text-text-secondary">
            The generated artifact is issued for professional review. It will disclose—not silently assume—survey, soil, house-connection, stormwater, and structural-review requirements.
          </p>
          <button
            onClick={handleGenerate}
            disabled={unresolvedErrors.length > 0}
            className="w-full px-6 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50 text-sm"
          >
            {unresolvedErrors.length > 0 ? 'Resolve code errors first' : 'Generate review package'}
          </button>
        </div>

        <button onClick={() => setStep('safety')} className="px-4 py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-bold text-text-primary">Review package generated</h2>
          <span className="text-[10px] uppercase tracking-wide rounded-full bg-warning/15 text-warning px-2 py-1">Not for construction</span>
        </div>
        <p className="text-sm text-text-secondary">Seven drawing sheets plus a transparent design-basis report. Written dimensions govern.</p>
      </div>

      <div className="space-y-2">
        {planset.map((sheet, index) => (
          <div key={sheet.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-white">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-7 h-7 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{index + 1}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{sheet.title}</div>
                <div className="text-xs text-text-secondary">{sheet.number} · {sheet.scale} · Rev {sheet.revision}</div>
              </div>
            </div>
            <span className="text-success text-sm">✓</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
        <div className="text-sm font-semibold text-text-primary mb-1">{readiness.summary}</div>
        <p className="text-xs text-text-secondary">{report.checks.filter((check) => check.status === 'review').length} design checks require review; {readiness.requiredCount} submission gates remain.</p>
      </div>

      <div className="space-y-2">
        <button onClick={handlePdf} disabled={pdfBusy} className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover text-sm disabled:opacity-50">
          {pdfBusy ? 'Building vector PDF…' : 'Download 11×17 vector PDF'}
        </button>
        <button onClick={handlePrint} className="w-full py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm">Print / Save as PDF fallback</button>
        <button onClick={() => downloadPrintablePackage(property, planset)} className="w-full py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm">
          Download printable package (.html)
        </button>
        {pdfReady && <p className="text-xs text-success">Vector PDF generated with {planset.length} coordinated 11×17 sheets.</p>}
        {printError && <p className="text-xs text-danger">{printError}</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={() => { setPlanset(null); setStructuralReport(null); setSubmissionReadiness(null); setPermitManifest(null); setStep('safety'); }} className="px-4 py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm">
          Back
        </button>
        <button onClick={handleContinue} className="flex-1 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover text-sm">
          Review submission gates
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, caution = false }: { label: string; value: string; caution?: boolean }) {
  return <div><div className="text-xs text-text-secondary">{label}</div><div className={`font-semibold ${caution ? 'text-warning' : 'text-text-primary'}`}>{value}</div></div>;
}
