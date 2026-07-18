import { useEffect, useMemo, useState } from 'react';
import type { PermitManifest, ReviewGate, VerificationEvidence, VerificationEvidenceKind } from '../types';
import { sha256File } from '../services/fileDigest';
import { saveEvidenceFile } from '../services/projectPersistence';
import { PROFESSIONAL_REGISTRIES, registryForRole } from '../services/professionalRegistry';

const KIND_BY_GATE: Record<string, VerificationEvidenceKind> = {
  'legal-survey': 'legal-survey',
  'yard-orientation': 'municipal-confirmation',
  'house-field-check': 'field-report',
  'soil-frost': 'soil-report',
  'structural-review': 'sealed-structural-review',
  stormwater: 'municipal-confirmation',
  application: 'application-checklist',
};

export function VerificationEvidenceForm({
  gates,
  manifest,
  onRecord,
}: {
  gates: ReviewGate[];
  manifest: PermitManifest;
  onRecord: (evidence: VerificationEvidence) => void;
}) {
  const availableGates = useMemo(() => gates.filter((gate) => gate.status === 'required'), [gates]);
  const [gateId, setGateId] = useState(availableGates[0]?.id || '');
  const [issuerName, setIssuerName] = useState('');
  const [issuerRole, setIssuerRole] = useState<VerificationEvidence['issuerRole']>('owner');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [decision, setDecision] = useState<'accepted' | 'changes-requested'>('accepted');
  const [registryConfirmed, setRegistryConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedGate = gates.find((gate) => gate.id === gateId);
  const professionalRegistry = registryForRole(issuerRole);

  useEffect(() => {
    if (!selectedGate) return;
    setIssuerRole(selectedGate.responsibleParty);
    setRegistryConfirmed(false);
  }, [selectedGate]);

  const handleRecord = async () => {
    if (!selectedGate || !file || !issuerName.trim()) {
      setError('Choose a gate, identify the issuer, and attach the supporting PDF.');
      return;
    }
    if (file.type !== 'application/pdf') {
      setError('Evidence must be a PDF document.');
      return;
    }
    if (professionalRegistry && !registryConfirmed) {
      setError(`Check the issuer in the ${PROFESSIONAL_REGISTRIES[professionalRegistry].label} before recording this evidence.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const sha256 = await sha256File(file);
      const id = crypto.randomUUID();
      await saveEvidenceFile(id, file);
      onRecord({
        id,
        gateId,
        kind: KIND_BY_GATE[gateId],
        fileName: file.name,
        mimeType: file.type,
        byteSize: file.size,
        sha256,
        issuerName: issuerName.trim(),
        issuerRole,
        licenseNumber: licenseNumber.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        decision: gateId === 'structural-review' ? decision : undefined,
        designFingerprint: gateId === 'structural-review' || gateId === 'house-field-check' ? manifest.designFingerprint : undefined,
        professionalRegistry: professionalRegistry || undefined,
        registryUrl: professionalRegistry ? PROFESSIONAL_REGISTRIES[professionalRegistry].url : undefined,
        registryCheckedAt: professionalRegistry ? new Date().toISOString() : undefined,
        registryStatus: professionalRegistry ? 'directory-confirmed-by-user' : undefined,
        recordedAt: new Date().toISOString(),
        status: 'recorded-unverified',
      });
      setFile(null);
      setIssuerName('');
      setLicenseNumber('');
      setReferenceNumber('');
    } catch {
      setError('The PDF could not be hashed or saved on this device. Check browser storage and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Record verification evidence</h3>
        <p className="mt-1 text-xs text-text-secondary">PDFs and hashes are saved in this browser and are not transmitted. The municipality still validates the document and issuer.</p>
      </div>
      <label className="block text-xs text-text-secondary">Gate
        <select value={gateId} onChange={(event) => setGateId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary">
          {availableGates.map((gate) => <option key={gate.id} value={gate.id}>{gate.label}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-text-secondary">Issuer name
          <input value={issuerName} onChange={(event) => setIssuerName(event.target.value)} placeholder="Name or department" className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm text-text-primary" />
        </label>
        <label className="block text-xs text-text-secondary">Issuer role
          <select value={issuerRole} onChange={(event) => { setIssuerRole(event.target.value as VerificationEvidence['issuerRole']); setRegistryConfirmed(false); }} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary">
            {['owner', 'designer', 'surveyor', 'engineer', 'architect', 'municipality'].map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>
      </div>
      {professionalRegistry && (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs text-text-secondary">
          <a href={PROFESSIONAL_REGISTRIES[professionalRegistry].url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Open {PROFESSIONAL_REGISTRIES[professionalRegistry].label} →</a>
          <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={registryConfirmed} onChange={(event) => setRegistryConfirmed(event.target.checked)} className="mt-0.5" /><span>I matched the issuer’s name and licence number and confirmed their current registration in the official directory today.</span></label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-text-secondary">Licence number
          <input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} placeholder="Required for professionals" className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm text-text-primary" />
        </label>
        <label className="block text-xs text-text-secondary">Official reference
          <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Required for Town records" className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm text-text-primary" />
        </label>
      </div>
      {gateId === 'structural-review' && (
        <label className="block text-xs text-text-secondary">Review decision
          <select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary">
            <option value="accepted">Accepted for this revision</option>
            <option value="changes-requested">Changes requested</option>
          </select>
        </label>
      )}
      <label className="block text-xs text-text-secondary">Supporting PDF
        <input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary" />
      </label>
      <div className="rounded-md bg-surface px-3 py-2 text-[10px] text-text-secondary">Current revision: {manifest.designFingerprint} · Rev {manifest.revision}</div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button onClick={handleRecord} disabled={busy || !availableGates.length} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Hashing evidence…' : 'Record evidence'}</button>
    </div>
  );
}
