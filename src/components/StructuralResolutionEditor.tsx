import { CheckCircle2, ClipboardCheck, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { CanonicalCalculationReport } from '../services/canonicalCalculationReport';
import { buildProfessionalWorkPackages, PROFESSIONAL_WORK_RESOLUTION_SCHEMA, type ProfessionalWorkPackage, type ProfessionalWorkResolution } from '../services/professionalWorkResolution';

export function StructuralResolutionEditor({ report, resolutions, onChange }: {
  report: CanonicalCalculationReport;
  resolutions: ProfessionalWorkResolution[];
  onChange: (resolutions: ProfessionalWorkResolution[]) => void;
}) {
  const packages = buildProfessionalWorkPackages(report);
  const resolvedIds = new Set(resolutions.map((item) => item.workPackageId));
  const [sealedReference, setSealedReference] = useState('');
  const [sealedNote, setSealedNote] = useState('');
  const update = (workPackage: ProfessionalWorkPackage, changes: Partial<ProfessionalWorkResolution>) => {
    const existing = resolutions.find((item) => item.workPackageId === workPackage.id);
    const next: ProfessionalWorkResolution = {
      schema: PROFESSIONAL_WORK_RESOLUTION_SCHEMA,
      id: existing?.id || crypto.randomUUID(),
      designFingerprint: report.designFingerprint,
      workPackageId: workPackage.id,
      kind: workPackage.kind,
      disposition: existing?.disposition || 'specified',
      specification: existing?.specification || '',
      capacityBasis: existing?.capacityBasis || '',
      documentReference: existing?.documentReference || '',
      notes: existing?.notes || '',
      recordedAt: new Date().toISOString(),
      ...changes,
    };
    onChange([...resolutions.filter((item) => item.workPackageId !== workPackage.id), next]);
  };
  const coverAllBySealedDocument = () => {
    const recordedAt = new Date().toISOString();
    onChange(packages.map((workPackage) => {
      const existing = resolutions.find((item) => item.workPackageId === workPackage.id);
      return {
        schema: PROFESSIONAL_WORK_RESOLUTION_SCHEMA,
        id: existing?.id || crypto.randomUUID(),
        designFingerprint: report.designFingerprint,
        workPackageId: workPackage.id,
        kind: workPackage.kind,
        disposition: 'covered-by-sealed-document',
        specification: '', capacityBasis: '', documentReference: sealedReference.trim(), notes: sealedNote.trim(), recordedAt,
      };
    }));
  };

  return <section className="rounded-lg border border-border bg-white p-4">
    <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck size={17} className="text-primary" /> Structural work-package resolutions</h2><p className="mt-1 text-xs leading-5 text-text-secondary">An accepted decision must address every generated member, foundation, stair, and connection package. These records supplement the sealed PDF; they do not apply a software-generated seal.</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${resolvedIds.size === packages.length ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{resolvedIds.size}/{packages.length}</span></div>
    <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3"><strong className="text-xs">Resolve all packages from one sealed schedule</strong><p className="mt-1 text-[10px] leading-4 text-text-secondary">Use this only when the attached sealed drawings/calculations explicitly cover every package below. Individual records remain editable afterward.</p><div className="mt-2 grid gap-2"><input aria-label="Sealed document reference for all work packages" value={sealedReference} onChange={(event) => setSealedReference(event.target.value)} placeholder="Example: Sealed SK-01 to SK-04 and calculations §1–8" className="min-h-9 rounded-md border border-border bg-white px-3 text-xs" /><input aria-label="Professional scope note for all work packages" value={sealedNote} onChange={(event) => setSealedNote(event.target.value)} placeholder="Confirm the sealed documents resolve all listed member, foundation, stair, and connection packages." className="min-h-9 rounded-md border border-border bg-white px-3 text-xs" /><button type="button" onClick={coverAllBySealedDocument} disabled={sealedReference.trim().length < 3 || sealedNote.trim().length < 5} className="min-h-9 rounded-md bg-primary px-3 text-xs font-semibold text-white disabled:opacity-40">Apply sealed-document reference to all {packages.length} packages</button></div></div>
    <div className="mt-3 space-y-2">{packages.map((workPackage) => {
      const resolution = resolutions.find((item) => item.workPackageId === workPackage.id);
      return <details key={workPackage.id} className={`rounded-md border ${resolution ? 'border-success/30 bg-success/5' : 'border-border bg-surface'}`}>
        <summary className="flex cursor-pointer list-none items-start gap-2 p-3"><span className="mt-0.5">{resolution ? <CheckCircle2 size={15} className="text-success" /> : <TriangleAlert size={15} className="text-warning" />}</span><span className="min-w-0 flex-1"><strong className="block text-xs">{workPackage.title}</strong><span className="mt-0.5 block text-[10px] leading-4 text-text-secondary">{workPackage.demandSummary}</span></span><span className="rounded bg-white px-1.5 py-0.5 font-mono text-[9px] text-text-secondary">{workPackage.id}</span></summary>
        <div className="space-y-2 border-t border-border p-3">
          <p className="text-[10px] leading-4 text-text-secondary">{workPackage.requirementSummary}</p>
          <label className="block text-xs text-text-secondary">Resolution route<select value={resolution?.disposition || 'specified'} onChange={(event) => update(workPackage, { disposition: event.target.value as ProfessionalWorkResolution['disposition'] })} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"><option value="specified">Specified in this record</option><option value="covered-by-sealed-document">Covered by sealed document</option><option value="not-applicable">Not applicable</option></select></label>
          {(resolution?.disposition || 'specified') === 'specified' && <><Field label="Member / assembly / hardware specification" value={resolution?.specification || ''} onChange={(value) => update(workPackage, { specification: value })} placeholder="Example: HUCQ-series hanger with manufacturer fastener schedule…" /><Field label="Capacity and design basis" value={resolution?.capacityBasis || ''} onChange={(value) => update(workPackage, { capacityBasis: value })} placeholder="Calculation section, table, tested product value, demand/capacity ratio…" /></>}
          <Field label="Drawing / calculation / sealed-document reference" value={resolution?.documentReference || ''} onChange={(value) => update(workPackage, { documentReference: value })} placeholder="Example: SK-03 detail 5 / calculations §4.2" />
          {(resolution?.disposition || 'specified') !== 'specified' && <Field label="Professional note" value={resolution?.notes || ''} onChange={(value) => update(workPackage, { notes: value })} placeholder="Explain precisely where this work is resolved or why it is not applicable." multiline />}
        </div>
      </details>;
    })}</div>
  </section>;
}

function Field({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <label className="block text-xs text-text-secondary">{label}{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" />}</label>;
}
