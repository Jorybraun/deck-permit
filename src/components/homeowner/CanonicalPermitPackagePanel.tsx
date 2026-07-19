import { CheckCircle2, Download, ExternalLink, FileSearch, FileSignature, Flame, LoaderCircle, LockKeyhole, PackageCheck, Send, ShieldAlert, Upload, UserRoundCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
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
  const offsetInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const firePlanInputRef = useRef<HTMLInputElement>(null);
  const ownerAuthorizationInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [offsetUploadBusy, setOffsetUploadBusy] = useState(false);
  const [intakeUploadBusy, setIntakeUploadBusy] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [ownerAuthorized, setOwnerAuthorized] = useState(false);
  const [artifact, setArtifact] = useState<CanonicalPermitBundleArtifact | null>(null);
  const [capabilities, setCapabilities] = useState<MunicipalDeliveryCapabilities | null>(null);
  const [error, setError] = useState('');
  const missing = useMemo(() => validateSidneyApplication(props.application), [props.application]);
  const signedEvidence = props.evidence.find((item) => item.gateId === 'signed-application' && item.designFingerprint === props.issue.manifest.designFingerprint);
  const offsetEvidence = props.evidence.find((item) => item.gateId === 'property-offsets' && item.designFingerprint === props.issue.manifest.designFingerprint);
  const titleEvidence = props.evidence.find((item) => item.gateId === 'land-title-search' && item.designFingerprint === props.issue.manifest.designFingerprint);
  const firePlanEvidence = props.evidence.find((item) => item.gateId === 'construction-fire-safety-plan' && item.designFingerprint === props.issue.manifest.designFingerprint);
  const ownerAuthorizationEvidence = props.evidence.find((item) => item.gateId === 'owner-authorization' && item.designFingerprint === props.issue.manifest.designFingerprint);
  const applicantRequiresAuthorization = Boolean(props.application.applicantName.trim() && props.application.applicantName.trim().toLocaleLowerCase() !== props.application.ownerName.trim().toLocaleLowerCase());
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
  const uploadPropertyOffsets = async (file?: File) => {
    if (!file || offsetUploadBusy) return;
    setError('');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('Attach the dimensioned site record as a PDF.'); return; }
    if (file.size > 10_000_000) { setError('The dimensioned site record must be 10 MB or smaller.'); return; }
    setOffsetUploadBusy(true);
    try {
      const id = `property-offsets-${props.issue.manifest.designFingerprint}`;
      const sha256 = await sha256File(file);
      await saveReviewEvidenceFile(id, file);
      props.onRecordEvidence({ id, gateId: 'property-offsets', kind: 'field-report', fileName: file.name, mimeType: file.type || 'application/pdf', byteSize: file.size, sha256, issuerName: props.application.ownerName || 'Property owner', issuerRole: 'owner', designFingerprint: props.issue.manifest.designFingerprint, recordedAt: new Date().toISOString(), status: 'recorded-unverified' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The dimensioned site record could not be stored on this device.'); }
    finally { setOffsetUploadBusy(false); if (offsetInputRef.current) offsetInputRef.current.value = ''; }
  };
  const uploadIntakeEvidence = async (file: File | undefined, input: { gateId: string; kind: VerificationEvidence['kind']; label: string; ref: RefObject<HTMLInputElement> }) => {
    if (!file || intakeUploadBusy) return;
    setError('');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError(`Attach ${input.label} as a PDF.`); return; }
    if (file.size > 10_000_000) { setError(`${input.label} must be 10 MB or smaller.`); return; }
    setIntakeUploadBusy(input.gateId);
    try {
      const id = `${input.gateId}-${props.issue.manifest.designFingerprint}`;
      const sha256 = await sha256File(file);
      await saveReviewEvidenceFile(id, file);
      props.onRecordEvidence({ id, gateId: input.gateId, kind: input.kind, fileName: file.name, mimeType: file.type || 'application/pdf', byteSize: file.size, sha256, issuerName: props.application.ownerName || 'Property owner', issuerRole: 'owner', designFingerprint: props.issue.manifest.designFingerprint, recordedAt: new Date().toISOString(), status: 'recorded-unverified' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : `${input.label} could not be stored on this device.`); }
    finally { setIntakeUploadBusy(''); if (input.ref.current) input.ref.current.value = ''; }
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
        <article className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2"><FileSignature size={17} className="text-emerald-700" /><h4 className="text-sm font-bold text-slate-900">Town of Sidney application data</h4></div><p className="mt-1 text-xs leading-5 text-slate-500">These values fill the official April 2026 application. The generated copy remains unsigned.</p><a href="https://www.sidney.ca/wp-content/uploads/Building-Permit-Application-SF-2F-Demo-Accessory.pdf" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800"><ExternalLink size={11} />Official Town form and checklist</a><div className="mt-4 grid gap-3 sm:grid-cols-2">{APPLICATION_FIELDS.map((field) => <Field key={field.key} label={field.label} value={props.application[field.key] as string} type={field.type} placeholder={field.placeholder} onChange={(value) => props.onUpdateApplication({ [field.key]: value })} />)}<label className="sm:col-span-2"><span className="text-[10px] font-bold uppercase tracking-[.08em] text-slate-500">Project description</span><textarea value={props.application.projectDescription} onChange={(event) => props.onUpdateApplication({ projectDescription: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600"><input type="checkbox" checked={props.application.authorizeTownTitleSearch} onChange={(event) => props.onUpdateApplication({ authorizeTownTitleSearch: event.target.checked })} className="mt-1" /><span><strong className="block text-slate-800">Authorize the Town to obtain the title search and registered charges</strong>The April 2026 form states $16 + GST per title and $26 + GST per individual charge. Leave this unchecked if you will attach a title search completed within 30 days.</span></label></div>{missing.length > 0 && <p className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-950">Still required: {missing.join(', ')}.</p>}</article>

        <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-start gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${signedEvidence ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{signedEvidence ? <CheckCircle2 size={18} /> : <Upload size={18} />}</div><div className="flex-1"><h4 className="text-sm font-bold text-slate-900">Owner-signed application</h4><p className="mt-1 text-xs leading-5 text-slate-500">Download and review the package, sign the official form, then attach that PDF to this exact fingerprint.</p>{signedEvidence && <p className="mt-2 text-xs font-semibold text-emerald-800">Recorded locally · {signedEvidence.fileName} · SHA-256 {signedEvidence.sha256.slice(0, 12)}…</p>}</div></div><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void uploadSignedApplication(event.target.files?.[0])} /><button type="button" onClick={() => inputRef.current?.click()} disabled={uploadBusy} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-50">{uploadBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}{signedEvidence ? 'Replace signed application PDF' : 'Attach signed application PDF'}</button><p className="mt-2 text-[10px] leading-4 text-slate-500">Stored only in this browser and recorded as unverified owner evidence. Uploading does not prove municipal acceptance.</p></article>

        <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-start gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${offsetEvidence ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{offsetEvidence ? <CheckCircle2 size={18} /> : <Upload size={18} />}</div><div className="flex-1"><h4 className="text-sm font-bold text-slate-900">Measured property offsets</h4><p className="mt-1 text-xs leading-5 text-slate-500">A1.0 now writes deck-to-parcel dimensions from municipal GIS. Attach a dimensioned survey or field-measurement PDF confirming the deck and footing offsets for this exact design.</p>{offsetEvidence && <p className="mt-2 text-xs font-semibold text-emerald-800">Recorded locally · {offsetEvidence.fileName} · SHA-256 {offsetEvidence.sha256.slice(0, 12)}…</p>}</div></div><input ref={offsetInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void uploadPropertyOffsets(event.target.files?.[0])} /><button type="button" onClick={() => offsetInputRef.current?.click()} disabled={offsetUploadBusy} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-50">{offsetUploadBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}{offsetEvidence ? 'Replace measured site record' : 'Attach measured site plan PDF'}</button><p className="mt-2 text-[10px] leading-4 text-slate-500">An owner upload is recorded as unverified field evidence; it is not represented as a legal survey. The file is fingerprint-bound and included in the controlled ZIP.</p></article>

        <IntakeEvidenceCard icon={<FileSearch size={18} />} title="Land title search and registered charges" description={props.application.authorizeTownTitleSearch ? 'The Town-search election is selected on the generated official form. You may still attach a current title search here.' : 'Attach a title search completed within 30 days, or select the Town-search election above.'} evidence={titleEvidence} busy={intakeUploadBusy === 'land-title-search'} inputRef={titleInputRef} buttonLabel="Attach current title search PDF" onFile={(file) => void uploadIntakeEvidence(file, { gateId: 'land-title-search', kind: 'land-title-search', label: 'The title-search record', ref: titleInputRef })} />
        <IntakeEvidenceCard icon={<Flame size={18} />} title="Construction fire safety plan" description="The Town says most permit applications now require a construction fire safety plan. Attach the completed plan, or written Town confirmation that it is not required." evidence={firePlanEvidence} busy={intakeUploadBusy === 'construction-fire-safety-plan'} inputRef={firePlanInputRef} buttonLabel="Attach fire safety plan PDF" onFile={(file) => void uploadIntakeEvidence(file, { gateId: 'construction-fire-safety-plan', kind: 'construction-fire-safety-plan', label: 'The construction fire safety plan', ref: firePlanInputRef })} />
        {applicantRequiresAuthorization && <IntakeEvidenceCard icon={<UserRoundCheck size={18} />} title="Owner authorization" description={`${props.application.applicantName} differs from the property owner. Attach the signed Town owner-authorization form.`} evidence={ownerAuthorizationEvidence} busy={intakeUploadBusy === 'owner-authorization'} inputRef={ownerAuthorizationInputRef} buttonLabel="Attach owner authorization PDF" onFile={(file) => void uploadIntakeEvidence(file, { gateId: 'owner-authorization', kind: 'owner-authorization', label: 'The owner authorization', ref: ownerAuthorizationInputRef })} />}
      </div>

      <div className="grid content-start gap-4">
        <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldAlert size={17} className={ready ? 'text-emerald-700' : 'text-amber-700'} />Submission gates</h4><span className="text-xs font-bold text-slate-500">{props.readiness.confirmedCount}/{props.readiness.requiredCount}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{props.readiness.summary}</p><ul className="mt-3 grid gap-2">{props.readiness.gates.map((gate) => <li key={gate.id} className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2"><span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-black ${gate.status === 'confirmed' ? 'bg-emerald-700 text-white' : gate.status === 'not-applicable' ? 'bg-slate-200 text-slate-600' : 'bg-amber-200 text-amber-950'}`}>{gate.status === 'confirmed' ? '✓' : gate.status === 'not-applicable' ? '—' : '!'}</span><span className="min-w-0"><strong className="block text-xs text-slate-800">{gate.label}{gate.status === 'not-applicable' ? ' · Not applicable' : ''}</strong><span className="block text-[10px] leading-4 text-slate-500">{gate.detail}</span></span></li>)}</ul></article>

        <article className={`rounded-lg border p-4 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-3"><PackageCheck size={20} className={ready ? 'text-emerald-800' : 'text-amber-800'} /><div><h4 className="text-sm font-bold text-slate-900">Validated ZIP archive</h4><p className="mt-1 text-xs leading-5 text-slate-600">{ready ? 'The archive may be labelled ready to submit after exact-path and evidence-integrity validation.' : 'You can assemble a clearly marked professional-review package while submission gates remain open.'}</p></div></div><button type="button" onClick={() => void download()} disabled={busy || missing.length > 0} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-40">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}{busy ? 'Validating files and assembling…' : ready ? 'Download permit submission ZIP' : 'Download professional review ZIP'}</button>{artifact && <p role="status" className="mt-3 text-xs font-semibold text-emerald-800">Downloaded {artifact.fileNames.length} files · {formatBytes(artifact.byteSize)} · {artifact.designFingerprint}</p>}</article>

        <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-bold text-slate-900"><LockKeyhole size={16} />Town completeness-review email</h4><span className="text-[10px] font-bold uppercase text-slate-400">Owner controlled</span></div>{!ready ? <p className="mt-2 text-xs leading-5 text-slate-500">Locked until all {props.readiness.requiredCount} fingerprint-bound intake gates are recorded.</p> : capabilities?.configured ? <><label className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600"><input type="checkbox" checked={ownerAuthorized} onChange={(event) => setOwnerAuthorized(event.target.checked)} className="mt-1" /><span>I am the owner or authorized applicant and authorize email delivery of Rev {props.issue.manifest.revision} · {props.issue.manifest.designFingerprint} to {capabilities.recipient} for the Town’s completeness review.</span></label><button type="button" onClick={() => void deliver()} disabled={!ownerAuthorized || deliveryBusy} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">{deliveryBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{deliveryBusy ? 'Emailing controlled package…' : 'Email package for Town completeness review'}</button></> : <p className="mt-2 text-xs leading-5 text-slate-500">Secure email delivery is not configured. Download the validated ZIP and email it to the Town’s accepted digital-submission address.</p>}{latestReceipt && <p role="status" className="mt-3 rounded-md bg-emerald-100 px-3 py-2 text-xs text-emerald-900">Email-provider receipt {latestReceipt.providerMessageId} · {new Date(latestReceipt.submittedAt).toLocaleString()}. This is not a Town receipt, file number, completeness decision, or permit approval.</p>}</article>
      </div>
    </div>{error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">{error}</p>}
  </section>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) { return <label><span className="text-[10px] font-bold uppercase tracking-[.08em] text-slate-500">{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>; }
function IntakeEvidenceCard({ icon, title, description, evidence, busy, inputRef, buttonLabel, onFile }: { icon: ReactNode; title: string; description: string; evidence?: VerificationEvidence; busy: boolean; inputRef: RefObject<HTMLInputElement>; buttonLabel: string; onFile: (file?: File) => void }) { return <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-start gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${evidence ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{evidence ? <CheckCircle2 size={18} /> : icon}</div><div className="flex-1"><h4 className="text-sm font-bold text-slate-900">{title}</h4><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>{evidence && <p className="mt-2 text-xs font-semibold text-emerald-800">Recorded locally · {evidence.fileName} · SHA-256 {evidence.sha256.slice(0, 12)}…</p>}</div></div><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} /><button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}{evidence ? `Replace ${title.toLocaleLowerCase()} PDF` : buttonLabel}</button><p className="mt-2 text-[10px] leading-4 text-slate-500">Stored in this browser, hash-indexed, fingerprint-bound, and included in the controlled ZIP. The Town still determines completeness.</p></article>; }
function formatBytes(value: number): string { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1000))} kB`; }
