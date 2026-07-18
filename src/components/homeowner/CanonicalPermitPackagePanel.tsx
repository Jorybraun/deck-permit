import { CheckCircle2, Download, FileSignature, LoaderCircle, LockKeyhole, PackageCheck, Send, ShieldAlert, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PermitSubmissionRecord, ProfessionalReviewCycle, Property, SidneyApplicationData, SubmissionReadiness, VerificationEvidence } from '../../types';
import type { CanonicalReviewIssue } from '../../services/canonicalReviewIssue';
import { buildCanonicalPermitBundle, downloadCanonicalPermitBundle, type CanonicalPermitBundleArtifact } from '../../services/canonicalPermitBundle';
import { getMunicipalDeliveryCapabilities, deliverSidneyPermitPackage, type MunicipalDeliveryCapabilities } from '../../services/municipalSubmission';
import { saveReviewEvidenceFile } from '../../services/reviewEvidenceStorage';
import { sha256File } from '../../services/fileDigest';
import { validateSidneyApplication } from '../../services/sidneyApplication';

interface CanonicalPermitPackagePanelProps {
  issue: CanonicalReviewIssue;
  property: Property;
  application: SidneyApplicationData;
  readiness: SubmissionReadiness;
  evidence: VerificationEvidence[];
  reviewCycles: ProfessionalReviewCycle[];
  submissionHistory: PermitSubmissionRecord[];
  onUpdateApplication: (changes: Partial<SidneyApplicationData>) => void;
  onRecordEvidence: (evidence: VerificationEvidence) => void;
  onSubmission: (record: PermitSubmissionRecord) => void;
}

const APPLICATION_FIELDS: Array<{ key: keyof SidneyApplicationData; label: string; placeholder?: string; type?: string }> = [
  { key: 'ownerName', label: 'Property owner name' },
  { key: 'ownerAddress', label: 'Owner mailing address' },
  { key: 'ownerCityProvince', label: 'City and province', placeholder: 'Sidney, BC' },
  { key: 'ownerPostalCode', label: 'Postal code', placeholder: 'V8L 1A1' },
  { key: 'ownerPhone', label: 'Phone', type: 'tel' },
  { key: 'ownerEmail', label: 'Email', type: 'email' },
  { key: 'constructionValue', label: 'Estimated construction value (CAD)', placeholder: '25000' },
];

/** Owns the final homeowner handoff from one canonical issue to a controlled municipal package. */
export function CanonicalPermitPackagePanel(props: CanonicalPermitPackagePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [ownerAuthorized, setOwnerAuthorized] = useState(false);
  const [artifact, setArtifact] = useState<CanonicalPermitBundleArtifact | null>(null);
  const [capabilities, setCapabilities] = useState<MunicipalDeliveryCapabilities | null>(null);
  const [error, setError] = useState('');
  const missing = useMemo(() => validateSidneyApplication(props.application), [props.application]);
  const signedEvidence = props.evidence.find((item) => item.gateId === 'signed-application' && item.designFingerprint === props.issue.manifest.designFingerprint);
  const latestReceipt = [...props.submissionHistory].reverse().find((item) => item.designFingerprint === props.issue.manifest.designFingerprint);
  const ready = props.readiness.status === 'ready-to-submit';
  useEffect(() => { void getMunicipalDeliveryCapabilities().then(setCapabilities).catch(() => setCapabilities(null)); }, []);
  useEffect(() => { setArtifact(null); setOwnerAuthorized(false); }, [props.issue.manifest.designFingerprint]);

  const bundleInput = () => ({ issue: props.issue, property: props.property, application: props.application, readiness: props.readiness, evidence: props.evidence, reviewCycles: props.reviewCycles });
  const download = async () => {
    if (missing.length || busy) return;
    setBusy(true); setError(''); setArtifact(null);
    try { setArtifact(await downloadCanonicalPermitBundle(bundleInput())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The controlled package could not be assembled.'); }
    finally { setBusy(false); }
  };
  const uploadSignedApplication = async (file?: File) => {
    if (!file || uploadBusy) return;
    setError('');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('Upload the signed application as a PDF.'); return; }
    if (file.size > 10_000_000) { setError('The signed application PDF must be 10 MB or smaller.'); return; }
    setUploadBusy(true);
    try {
      const id = `signed-application-${props.issue.manifest.designFingerprint}`;
      const sha256 = await sha256File(file);
      await saveReviewEvidenceFile(id, file);
      props.onRecordEvidence({ id, gateId: 'signed-application', kind: 'application-checklist', fileName: file.name, mimeType: file.type || 'application/pdf', byteSize: file.size, sha256, issuerName: props.application.ownerName || 'Property owner', issuerRole: 'owner', designFingerprint: props.issue.manifest.designFingerprint, recordedAt: new Date().toISOString(), status: 'recorded-unverified' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The signed application could not be stored on this device.'); }
    finally { setUploadBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const deliver = async () => {
    if (!ready || !ownerAuthorized || !capabilities?.configured || deliveryBusy) return;
    setDeliveryBusy(true); setError('');
    try {
      const packageArtifact = await buildCanonicalPermitBundle(bundleInput());
      props.onSubmission(await deliverSidneyPermitPackage({ artifact: packageArtifact, manifest: props.issue.manifest, readiness: props.readiness, ownerEmail: props.application.applicantEmail || props.application.ownerEmail, address: props.issue.manifest.address, pid: props.issue.manifest.pid, ownerAuthorized }));
      setOwnerAuthorized(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Municipal delivery could not be completed.'); }
    finally { setDeliveryBusy(false); }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="canonical-package-heading">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><span className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-700">Submission control</span><h3 id="canonical-package-heading" className="mt-1 font-[Manrope] text-xl font-bold text-slate-950">One canonical permit package</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Complete the Town application, attach the owner-signed copy, and package this exact drawing fingerprint with its calculations, DXF, field evidence, and professional resolutions.</p></div><span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase ${ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{ready ? 'Ready to submit' : 'Professional review only'}</span></div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <div className="grid content-start gap-4">
        <article className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2"><FileSignature size={17} className="text-emerald-700" /><h4 className="text-sm font-bold text-slate-900">Town of Sidney application data</h4></div><p className="mt-1 text-xs leading-5 text-slate-500">These values fill the current official application. The generated copy remains unsigned.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{APPLICATION_FIELDS.map((field) => <Field key={field.key} label={field.label} value={props.application[field.key]} type={field.type} placeholder={field.placeholder} onChange={(value) => props.onUpdateApplication({ [field.key]: value })} />)}<label className="sm:col-span-2"><span className="text-[10px] font-bold uppercase tracking-[.08em] text-slate-500">Project description</span><textarea value={props.application.projectDescription} onChange={(event) => props.onUpdateApplication({ projectDescription: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label></div>{missing.length > 0 && <p className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-950">Still required: {missing.join(', ')}.</p>}</article>

        <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-start gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${signedEvidence ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{signedEvidence ? <CheckCircle2 size={18} /> : <Upload size={18} />}</div><div className="flex-1"><h4 className="text-sm font-bold text-slate-900">Owner-signed application</h4><p className="mt-1 text-xs leading-5 text-slate-500">Download and review the package, sign the official form, then attach that PDF to this exact fingerprint.</p>{signedEvidence && <p className="mt-2 text-xs font-semibold text-emerald-800">Recorded locally · {signedEvidence.fileName} · SHA-256 {signedEvidence.sha256.slice(0, 12)}…</p>}</div></div><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void uploadSignedApplication(event.target.files?.[0])} /><button type="button" onClick={() => inputRef.current?.click()} disabled={uploadBusy} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-50">{uploadBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}{signedEvidence ? 'Replace signed application PDF' : 'Attach signed application PDF'}</button><p className="mt-2 text-[10px] leading-4 text-slate-500">Stored only in this browser and recorded as unverified owner evidence. Uploading does not prove municipal acceptance.</p></article>
      </div>

      <div className="grid content-start gap-4">
        <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldAlert size={17} className={ready ? 'text-emerald-700' : 'text-amber-700'} />Submission gates</h4><span className="text-xs font-bold text-slate-500">{props.readiness.confirmedCount}/{props.readiness.requiredCount}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{props.readiness.summary}</p><ul className="mt-3 grid gap-2">{props.readiness.gates.map((gate) => <li key={gate.id} className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2"><span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-black ${gate.status === 'confirmed' ? 'bg-emerald-700 text-white' : 'bg-amber-200 text-amber-950'}`}>{gate.status === 'confirmed' ? '✓' : '!'}</span><span className="min-w-0"><strong className="block text-xs text-slate-800">{gate.label}</strong><span className="block text-[10px] leading-4 text-slate-500">{gate.detail}</span></span></li>)}</ul></article>

        <article className={`rounded-lg border p-4 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-3"><PackageCheck size={20} className={ready ? 'text-emerald-800' : 'text-amber-800'} /><div><h4 className="text-sm font-bold text-slate-900">Validated ZIP archive</h4><p className="mt-1 text-xs leading-5 text-slate-600">{ready ? 'The archive may be labelled ready to submit after exact-path and evidence-integrity validation.' : 'You can assemble a clearly marked professional-review package while submission gates remain open.'}</p></div></div><button type="button" onClick={() => void download()} disabled={busy || missing.length > 0} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-40">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}{busy ? 'Validating files and assembling…' : ready ? 'Download permit submission ZIP' : 'Download professional review ZIP'}</button>{artifact && <p role="status" className="mt-3 text-xs font-semibold text-emerald-800">Downloaded {artifact.fileNames.length} files · {formatBytes(artifact.byteSize)} · {artifact.designFingerprint}</p>}</article>

        <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-bold text-slate-900"><LockKeyhole size={16} />Municipal delivery</h4><span className="text-[10px] font-bold uppercase text-slate-400">Owner controlled</span></div>{!ready ? <p className="mt-2 text-xs leading-5 text-slate-500">Locked until all six canonical gates match this fingerprint.</p> : capabilities?.configured ? <><label className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600"><input type="checkbox" checked={ownerAuthorized} onChange={(event) => setOwnerAuthorized(event.target.checked)} className="mt-1" /><span>I am the owner or authorized applicant and authorize delivery of Rev {props.issue.manifest.revision} · {props.issue.manifest.designFingerprint} to {capabilities.recipient}.</span></label><button type="button" onClick={() => void deliver()} disabled={!ownerAuthorized || deliveryBusy} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">{deliveryBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{deliveryBusy ? 'Delivering controlled package…' : 'Submit to Town of Sidney'}</button></> : <p className="mt-2 text-xs leading-5 text-slate-500">Secure direct delivery is not configured. Download the validated ZIP and submit it through the Town’s accepted channel.</p>}{latestReceipt && <p role="status" className="mt-3 rounded-md bg-emerald-100 px-3 py-2 text-xs text-emerald-900">Recorded delivery receipt {latestReceipt.providerMessageId} · {new Date(latestReceipt.submittedAt).toLocaleString()}. This confirms provider delivery only, not permit acceptance.</p>}</article>
      </div>
    </div>{error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">{error}</p>}
  </section>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) { return <label><span className="text-[10px] font-bold uppercase tracking-[.08em] text-slate-500">{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>; }
function formatBytes(value: number): string { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1000))} kB`; }
