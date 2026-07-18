import { useEffect, useMemo, useState } from 'react';
import type { Deck, Property, SidneyApplicationData } from '../types';
import { downloadSidneyApplication, SIDNEY_APPLICATION_EDITION, SIDNEY_APPLICATION_URL, validateSidneyApplication } from '../services/sidneyApplication';
import { useStore } from '../state/store';

export function SidneyApplicationForm({ property, deck }: { property: Property; deck: Deck }) {
  const initial = useMemo<SidneyApplicationData>(() => ({
    civicAddress: property.address?.fullAddress || '',
    ownerName: '', ownerCompany: '', ownerAddress: '', ownerCityProvince: 'Sidney, BC', ownerPostalCode: '', ownerPhone: '', ownerEmail: '',
    applicantName: '', applicantCompany: '', applicantBusinessLicence: '', applicantAddress: '', applicantCityProvince: '', applicantPostalCode: '', applicantPhone: '', applicantEmail: '',
    projectDescription: `Construct an attached ${deck.dimensions.width.toFixed(2)} m × ${deck.dimensions.depth.toFixed(2)} m residential wood deck (${deck.area.toFixed(1)} m²), ${deck.footprint.heightAboveGrade.toFixed(2)} m above grade, with ${deck.stairs.enabled ? 'stairs and ' : ''}${deck.guard.enabled ? `${deck.guard.height} mm guards` : 'guards as required'}.`,
    constructionValue: '', existingFloorAreaSqm: '', deckAreaSqm: deck.area.toFixed(1),
  }), [property, deck]);
  const storedData = useStore((state) => state.sidneyApplication);
  const setSidneyApplication = useStore((state) => state.setSidneyApplication);
  const data = storedData || initial;
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!storedData) setSidneyApplication(initial); }, [initial, setSidneyApplication, storedData]);
  const set = (key: keyof SidneyApplicationData) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSidneyApplication({ ...data, [key]: event.target.value });
  const generate = async () => {
    const missing = validateSidneyApplication(data);
    if (missing.length) return setError(`Complete: ${missing.join(', ')}.`);
    setError(''); setBusy(true);
    try { await downloadSidneyApplication(data); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not generate the application.'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4 space-y-3">
      <div>
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-text-primary">Official Sidney application prefill</h3><span className="text-[10px] uppercase tracking-wide text-text-secondary">{SIDNEY_APPLICATION_EDITION}</span></div>
        <p className="mt-1 text-xs text-text-secondary">Fills Sidney’s current PDF while preserving its digital-signature field. The owner must review, sign, and confirm the checklist.</p>
      </div>
      <Field label="Civic address" value={data.civicAddress} onChange={set('civicAddress')} />
      <div className="grid grid-cols-2 gap-2"><Field label="Property owner" value={data.ownerName} onChange={set('ownerName')} /><Field label="Company (optional)" value={data.ownerCompany} onChange={set('ownerCompany')} /></div>
      <Field label="Owner mailing address" value={data.ownerAddress} onChange={set('ownerAddress')} />
      <div className="grid grid-cols-2 gap-2"><Field label="City & province" value={data.ownerCityProvince} onChange={set('ownerCityProvince')} /><Field label="Postal code" value={data.ownerPostalCode} onChange={set('ownerPostalCode')} /></div>
      <div className="grid grid-cols-2 gap-2"><Field label="Owner phone" value={data.ownerPhone} onChange={set('ownerPhone')} /><Field label="Owner email" type="email" value={data.ownerEmail} onChange={set('ownerEmail')} /></div>
      <label className="block text-xs text-text-secondary">Project description<textarea value={data.projectDescription} onChange={set('projectDescription')} rows={3} className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" /></label>
      <div className="grid grid-cols-2 gap-2"><Field label="Construction value ($)" inputMode="decimal" value={data.constructionValue} onChange={set('constructionValue')} /><Field label="Existing floor area (m², optional)" inputMode="decimal" value={data.existingFloorAreaSqm} onChange={set('existingFloorAreaSqm')} /></div>
      <button onClick={() => setAdvanced((value) => !value)} className="text-xs font-medium text-primary">{advanced ? 'Hide contractor/applicant fields' : 'Applicant differs from owner?'}</button>
      {advanced && <div className="space-y-2 border-l-2 border-border pl-3">
        <div className="grid grid-cols-2 gap-2"><Field label="Applicant name" value={data.applicantName} onChange={set('applicantName')} /><Field label="Company" value={data.applicantCompany} onChange={set('applicantCompany')} /></div>
        <Field label="Business licence / municipality" value={data.applicantBusinessLicence} onChange={set('applicantBusinessLicence')} />
        <Field label="Applicant address" value={data.applicantAddress} onChange={set('applicantAddress')} />
        <div className="grid grid-cols-2 gap-2"><Field label="City & province" value={data.applicantCityProvince} onChange={set('applicantCityProvince')} /><Field label="Postal code" value={data.applicantPostalCode} onChange={set('applicantPostalCode')} /></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Phone" value={data.applicantPhone} onChange={set('applicantPhone')} /><Field label="Email" type="email" value={data.applicantEmail} onChange={set('applicantEmail')} /></div>
      </div>}
      {error && <div className="rounded-md bg-danger/5 px-3 py-2 text-xs text-danger">{error}</div>}
      <button onClick={generate} disabled={busy} className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Preparing official PDF…' : 'Download prefilled official application'}</button>
      <div className="flex flex-col gap-1 text-xs"><a href={SIDNEY_APPLICATION_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open blank official form →</a><span className="text-text-secondary">No signature is applied. Reopen the downloaded PDF in Acrobat or Preview to review and sign.</span></div>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...input } = props;
  return <label className="block text-xs text-text-secondary">{label}<input {...input} className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" /></label>;
}
