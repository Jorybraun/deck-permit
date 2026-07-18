import { useStore } from '../../state/store';
import { VerificationEvidenceForm } from '../VerificationEvidenceForm';
import { assessVerificationEvidence } from '../../services/verificationEvidence';
import { downloadSubmissionManifest } from '../../services/submissionManifest';
import { SidneyApplicationForm } from '../SidneyApplicationForm';
import { downloadEvidenceFile, removeEvidenceFile } from '../../services/projectPersistence';
import { ReviewExchangePanel } from '../ReviewExchangePanel';
import { PermitBundlePanel } from '../PermitBundlePanel';
import { ProfessionalRedlinePanel } from '../ProfessionalRedlinePanel';

export function SubmitStep() {
  const property = useStore((state) => state.property);
  const deck = useStore((state) => state.deck);
  const planset = useStore((state) => state.planset);
  const readiness = useStore((state) => state.submissionReadiness);
  const manifest = useStore((state) => state.permitManifest);
  const report = useStore((state) => state.structuralReport);
  const evidence = useStore((state) => state.verificationEvidence);
  const addVerificationEvidence = useStore((state) => state.addVerificationEvidence);
  const removeVerificationEvidence = useStore((state) => state.removeVerificationEvidence);
  const reset = useStore((state) => state.reset);
  const reviewExchange = useStore((state) => state.reviewExchange);
  const setReviewExchange = useStore((state) => state.setReviewExchange);
  const professionalReviewCycles = useStore((state) => state.professionalReviewCycles);
  const drawingIssueHistory = useStore((state) => state.drawingIssueHistory);
  const upsertProfessionalReviewCycle = useStore((state) => state.upsertProfessionalReviewCycle);
  const resolveReviewRedline = useStore((state) => state.resolveReviewRedline);
  const sidneyApplication = useStore((state) => state.sidneyApplication);
  const submissionHistory = useStore((state) => state.permitSubmissionHistory);
  const recordPermitSubmission = useStore((state) => state.recordPermitSubmission);

  if (!deck || !property.address || !planset || !readiness || !manifest || !report) {
    return <div className="p-6 text-text-secondary">Generate and review the drawing package first.</div>;
  }

  const ready = readiness.status === 'ready-to-submit';
  const assessment = assessVerificationEvidence(report.gates, evidence, manifest.designFingerprint);
  const submissionEmail = `mailto:developmentservices@sidney.ca?subject=${encodeURIComponent(`Building permit application — ${property.address.fullAddress} — ${manifest.designFingerprint}`)}&body=${encodeURIComponent(`Town of Sidney Development Services,\n\nPlease find the complete digital building permit application package for a proposed residential deck at ${property.address.fullAddress} (PID ${property.parcel?.pid || 'unconfirmed'}).\n\nPackage revision: ${manifest.designFingerprint}\nDrawing sheets: ${planset.length}\n\nApplicant contact and attachments to be added before sending.`)}`;
  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-bold text-text-primary">Professional review & submission</h2>
          <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-1 ${ready ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
            {ready ? 'Ready to submit' : 'Review required'}
          </span>
        </div>
        <p className="text-sm text-text-secondary">{readiness.summary}</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-text-primary">Professional sign-off checklist</h3><span className="text-[10px] uppercase tracking-wide text-text-secondary">{report.professionalChecklist.filter((item) => item.status === 'ready-for-review').length}/{report.professionalChecklist.length} ready for review</span></div>
        <div className="grid gap-2">
          {report.professionalChecklist.map((item) => (
            <div key={item.id} className={`rounded-lg border p-3 ${item.status === 'ready-for-review' ? 'border-success/30 bg-success/5' : item.status === 'design-required' ? 'border-danger/30 bg-danger/5' : 'border-warning/30 bg-warning/5'}`}>
              <div className="flex items-start justify-between gap-3"><div className="text-xs font-semibold text-text-primary">{item.label}</div><span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide ${item.status === 'ready-for-review' ? 'text-success' : item.status === 'design-required' ? 'text-danger' : 'text-warning'}`}>{item.status.replace(/-/g, ' ')}</span></div>
              <div className="mt-1 text-[10px] text-text-secondary">{item.evidence}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Verification gates</h3>
        {readiness.gates.filter((gate) => gate.status !== 'not-applicable').map((gate) => (
          <div key={gate.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-white">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${gate.status === 'confirmed' ? 'bg-success text-white' : 'border-2 border-warning'}`}>
              {gate.status === 'confirmed' ? '✓' : ''}
            </span>
            <div>
              <div className="text-sm font-medium text-text-primary">{gate.label}</div>
              <div className="text-[10px] uppercase tracking-wide text-text-secondary my-0.5">Responsible: {gate.responsibleParty}</div>
              <div className="text-xs text-text-secondary">{gate.detail}</div>
              {evidence.filter((record) => record.gateId === gate.id).map((record) => {
                const rejection = assessment.rejected.find((item) => item.evidenceId === record.id);
                return (
                  <div key={record.id} className={`mt-2 rounded-md px-2 py-1.5 text-[10px] ${rejection ? 'bg-danger/5 text-danger' : 'bg-success/10 text-success'}`}>
                    <div className="flex items-center justify-between gap-2"><span className="truncate">{record.fileName} · {record.sha256.slice(0, 10)}…</span><span className="flex gap-2"><button onClick={() => void downloadEvidenceFile(record.id, record.fileName)} className="font-semibold">Download</button><button onClick={() => { removeVerificationEvidence(record.id); void removeEvidenceFile(record.id); }} className="font-semibold">Remove</button></span></div>
                    {rejection && <div className="mt-0.5">{rejection.reason}</div>}
                    {!rejection && <div className="mt-0.5">Recorded evidence satisfies the app gate; external validation remains.</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!ready && <VerificationEvidenceForm gates={readiness.gates} manifest={manifest} onRecord={addVerificationEvidence} />}

      <ProfessionalRedlinePanel cycles={professionalReviewCycles} currentDesignFingerprint={manifest.designFingerprint} onResolve={resolveReviewRedline} />

      <ReviewExchangePanel property={property} deck={deck} planset={planset} report={report} manifest={manifest} publication={reviewExchange} reviewCycles={professionalReviewCycles} onPublish={setReviewExchange} onImport={addVerificationEvidence} onImportCycle={upsertProfessionalReviewCycle} />

      <SidneyApplicationForm property={property} deck={deck} />

      <PermitBundlePanel
        property={property}
        deck={deck}
        planset={planset}
        report={report}
        readiness={readiness}
        manifest={manifest}
        evidence={evidence}
        application={sidneyApplication}
        sources={property.evidence}
        professionalReviewCycles={professionalReviewCycles}
        drawingIssueHistory={drawingIssueHistory}
        submissionHistory={submissionHistory}
        onSubmission={recordPermitSubmission}
      />

      {evidence.length > 0 && (
        <div className="bg-surface rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">Evidence ledger</h3>
          <SummaryRow label="Recorded files" value={`${evidence.length}`} />
          <SummaryRow label="Accepted gates" value={`${assessment.confirmedGateIds.size}`} />
          <SummaryRow label="Rejected or stale" value={`${assessment.rejected.length}`} />
          <SummaryRow label="Design revision" value={manifest.designFingerprint} />
        </div>
      )}

      <div className="bg-surface rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">Town of Sidney submission</h3>
        <p className="text-sm text-text-secondary">Submit complete digital applications to Development Services.</p>
        <p className="text-sm text-text-primary">developmentservices@sidney.ca · 250-656-1725</p>
        <p className="text-xs text-text-secondary">Town Hall, 2440 Sidney Avenue, Sidney, BC V8L 1Y7</p>
        <div className="flex flex-col gap-1 pt-1">
          <a href="https://www.sidney.ca/planning-building/building-renovations-and-development/building-permits-and-inspections/" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">Current permit instructions and forms →</a>
          <a href="https://www.sidney.ca/wp-content/uploads/Residential-Deck-Construction.pdf" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">Sidney residential deck guide →</a>
        </div>
        <button
          onClick={() => downloadSubmissionManifest({ manifest, readiness, report, evidence, sources: property.evidence, professionalReviewCycles, drawingIssueHistory })}
          className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface"
        >
          Download submission manifest (.json)
        </button>
        {ready ? (
          <a href={submissionEmail} className="block w-full rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-medium text-white">Prepare Sidney submission email</a>
        ) : (
          <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-text-secondary">Submission email unlocks only after every evidence gate is satisfied for this design revision.</div>
        )}
      </div>

      <div className="bg-surface rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">Project summary</h3>
        <SummaryRow label="Address" value={property.address.fullAddress} />
        <SummaryRow label="PID" value={property.parcel?.pid || 'Unconfirmed'} />
        <SummaryRow label="Deck" value={`${deck.dimensions.width.toFixed(2)} × ${deck.dimensions.depth.toFixed(2)} m · ${deck.area.toFixed(1)} m²`} />
        <SummaryRow label="Height" value={`${(deck.footprint.heightAboveGrade * 1000).toFixed(0)} mm`} />
        <SummaryRow label="Package" value={`${planset.length} sheets · professional review`} />
        <SummaryRow label="Revision" value={`${manifest.designFingerprint} · Rev ${manifest.revision}`} />
      </div>

      <button onClick={reset} className="w-full py-2.5 rounded-lg border border-border text-text-secondary hover:bg-surface font-medium text-sm">Start over with a new address</button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 text-sm"><span className="text-text-secondary">{label}</span><span className="text-text-primary font-medium text-right">{value}</span></div>;
}
