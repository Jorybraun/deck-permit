import { Download, LoaderCircle, PackageCheck, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Deck, DrawingIssueRecord, EvidenceSource, PermitManifest, PermitSubmissionRecord, PlanSheet, ProfessionalReviewCycle, Property, SidneyApplicationData, SubmissionReadiness, StructuralReport, VerificationEvidence } from '../types';
import { buildPermitBundle, downloadPermitBundle, type PermitBundleArtifact } from '../services/permitBundle';
import { validateSidneyApplication } from '../services/sidneyApplication';
import { deliverSidneyPermitPackage, getMunicipalDeliveryCapabilities, type MunicipalDeliveryCapabilities } from '../services/municipalSubmission';

interface PermitBundlePanelProps {
  property: Property;
  deck: Deck;
  planset: PlanSheet[];
  report: StructuralReport;
  readiness: SubmissionReadiness;
  manifest: PermitManifest;
  evidence: VerificationEvidence[];
  application: SidneyApplicationData | null;
  sources: EvidenceSource[];
  professionalReviewCycles: ProfessionalReviewCycle[];
  drawingIssueHistory: DrawingIssueRecord[];
  submissionHistory: PermitSubmissionRecord[];
  onSubmission: (record: PermitSubmissionRecord) => void;
}

/** Presents one honest, local-only handoff from project records to a municipal ZIP. */
export function PermitBundlePanel(props: PermitBundlePanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [artifact, setArtifact] = useState<PermitBundleArtifact | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [ownerAuthorized, setOwnerAuthorized] = useState(false);
  const [capabilities, setCapabilities] = useState<MunicipalDeliveryCapabilities | null>(null);
  const missing = useMemo(() => props.application ? validateSidneyApplication(props.application) : ['permit application details'], [props.application]);
  const ready = props.readiness.status === 'ready-to-submit';
  useEffect(() => { void getMunicipalDeliveryCapabilities().then(setCapabilities).catch(() => setCapabilities(null)); }, []);

  const bundleInput = () => ({
    property: props.property, deck: props.deck, planset: props.planset, report: props.report, readiness: props.readiness,
    manifest: props.manifest, evidence: props.evidence, application: props.application!, sources: props.sources,
    professionalReviewCycles: props.professionalReviewCycles, drawingIssueHistory: props.drawingIssueHistory,
  });

  const assemble = async () => {
    if (!props.application || missing.length) return;
    setBusy(true);
    setError('');
    setArtifact(null);
    try {
      setArtifact(await downloadPermitBundle(bundleInput()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The permit package could not be assembled.');
    } finally {
      setBusy(false);
    }
  };

  const deliver = async () => {
    if (!props.application || !ready || !ownerAuthorized || !capabilities?.configured) return;
    setDeliveryBusy(true); setError('');
    try {
      const packageArtifact = await buildPermitBundle(bundleInput());
      const receipt = await deliverSidneyPermitPackage({
        artifact: packageArtifact, manifest: props.manifest, readiness: props.readiness,
        ownerEmail: props.application.applicantEmail || props.application.ownerEmail,
        address: props.property.address?.fullAddress || props.manifest.address, pid: props.manifest.pid, ownerAuthorized,
      });
      props.onSubmission(receipt);
      setOwnerAuthorized(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The municipal delivery could not be completed.'); }
    finally { setDeliveryBusy(false); }
  };

  return (
    <div className={`rounded-lg border bg-white p-4 space-y-3 ${ready ? 'border-success/35' : 'border-warning/35'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg p-2 ${ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}><PackageCheck size={18} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text-primary">One-file municipal package</h3>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              {ready ? 'Submission state' : 'Review state'}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {ready
              ? 'Assembles the current official application, seven coordinated drawings, evidence PDFs, and revision records into one validated ZIP.'
              : 'Assembles an explicitly marked professional review package. It will list every outstanding gate and will not represent the project as ready to submit.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface p-3 text-center">
        <Metric value={`${props.planset.length}`} label="drawing sheets" />
        <Metric value={`${props.evidence.length}`} label="evidence PDFs" />
        <Metric value={`Rev ${props.manifest.revision}`} label={props.manifest.designFingerprint} compact />
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
          Complete the application fields above before assembly: {missing.join(', ')}.
        </div>
      )}
      {error && <div className="rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">{error}</div>}
      {artifact && (
        <div className="rounded-md bg-success/10 px-3 py-2 text-xs text-success">
          ZIP validated and downloaded: {artifact.fileNames.length} files · {formatBytes(artifact.byteSize)} · {artifact.kind === 'ready-to-submit' ? 'submission state' : 'professional review state'}.
        </div>
      )}

      <button
        onClick={assemble}
        disabled={busy || !props.application || missing.length > 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
        {busy ? 'Validating and assembling…' : ready ? 'Download permit submission package (.zip)' : 'Assemble professional review package (.zip)'}
      </button>
      <p className="text-[10px] leading-relaxed text-text-secondary">Assembly happens on this device. The generated application remains unsigned, and no project or evidence files are uploaded by this action.</p>

      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-text-primary">Owner-authorized municipal delivery</h4><span className="text-[10px] text-text-secondary">Town of Sidney email channel</span></div>
        {!ready && <p className="text-[10px] text-text-secondary">Delivery unlocks only when the current issue is ready to submit and every evidence gate is satisfied.</p>}
        {ready && capabilities && !capabilities.configured && <p className="rounded-md bg-warning/5 px-3 py-2 text-[10px] text-text-secondary">Secure server delivery is not configured. Download the validated ZIP and use the submission email action below; do not record it as submitted until your mail provider confirms sending.</p>}
        {ready && capabilities?.configured && (
          <>
            <label className="flex items-start gap-2 rounded-md border border-border p-2 text-[10px] text-text-secondary"><input type="checkbox" checked={ownerAuthorized} onChange={(event) => setOwnerAuthorized(event.target.checked)} className="mt-0.5"/><span>I am the property owner or authorized applicant, I reviewed the unsigned application and current Rev {props.manifest.revision} package, and I authorize delivery to {capabilities.recipient}.</span></label>
            <button onClick={() => void deliver()} disabled={!ownerAuthorized || deliveryBusy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {deliveryBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{deliveryBusy ? 'Delivering controlled package…' : 'Submit package to Town of Sidney'}
            </button>
            <p className="text-[10px] text-text-secondary">A successful receipt proves acceptance by the email provider only. It does not prove municipal completeness, acceptance, or permit approval.</p>
          </>
        )}
        {props.submissionHistory.length > 0 && <div className="space-y-1">{[...props.submissionHistory].reverse().map((record) => <div key={record.id} className="rounded-md bg-success/10 px-3 py-2 text-[10px] text-success"><div className="font-semibold">{record.id} · Rev {record.revision} · {record.designFingerprint}</div><div>{new Date(record.submittedAt).toLocaleString()} · provider receipt {record.providerMessageId}</div><div>{record.deliveryMeaning}</div></div>)}</div>}
      </div>
    </div>
  );
}

function Metric({ value, label, compact = false }: { value: string; label: string; compact?: boolean }) {
  return <div className="min-w-0"><div className={`truncate font-semibold text-text-primary ${compact ? 'font-mono text-[10px]' : 'text-sm'}`}>{value}</div><div className="mt-0.5 text-[10px] text-text-secondary">{label}</div></div>;
}

function formatBytes(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1_000))} kB`;
}
