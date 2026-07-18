import { ClipboardCheck, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Deck, ExistingHouseConditions, Property } from '../types';
import { assessExistingConditions, createExistingConditionsDraft, deriveHouseReference } from '../services/existingConditions';

interface ExistingConditionsPanelProps {
  property: Property;
  deck: Deck;
  value: ExistingHouseConditions | null;
  onSave: (conditions: ExistingHouseConditions) => void;
}

/** Edits a complete field-input record without asserting professional verification. */
export function ExistingConditionsPanel({ property, deck, value, onSave }: ExistingConditionsPanelProps) {
  const initial = useMemo(() => value || createExistingConditionsDraft(property, deck), [property, deck, value]);
  const reference = useMemo(() => deriveHouseReference(property), [property]);
  const [draft, setDraft] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(initial); }, [initial]);
  const assessment = useMemo(() => assessExistingConditions(draft, deck), [draft, deck]);
  const update = <K extends keyof ExistingHouseConditions>(key: K, next: ExistingHouseConditions[K]) => {
    setDraft((current) => ({ ...current, [key]: next }));
    setSaved(false);
  };
  const save = () => {
    setAttempted(true);
    if (assessment.errors.length) return;
    onSave({ ...draft, measuredBy: draft.measuredBy.trim(), notes: draft.notes.trim(), updatedAt: new Date().toISOString() });
    setSaved(true);
  };

  return (
    <div className="rounded-lg border border-primary/25 bg-white p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><ClipboardCheck size={18} /></div>
        <div>
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-text-primary">Existing house & ledger field input</h3><span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">Evidence required</span></div>
          <p className="mt-1 text-xs leading-5 text-text-secondary">Replace schematic roofline dimensions with measured inputs for coordination. Saving changes the design revision; it does not confirm the field-verification gate.</p>
        </div>
      </div>

      <div className="rounded-md bg-surface px-3 py-2 text-[10px] text-text-secondary">
        Starting reference: {reference.source === 'municipal-roofline' ? 'municipal roofline' : 'estimated context'} · {reference.widthM.toFixed(2)} × {reference.depthM.toFixed(2)} m · not a wall survey
      </div>

      <FieldGroup title="House geometry">
        <NumberField label="House width" value={draft.houseWidthM} unit="m" step={0.01} onChange={(next) => update('houseWidthM', next)} />
        <NumberField label="House depth" value={draft.houseDepthM} unit="m" step={0.01} onChange={(next) => update('houseDepthM', next)} />
        <NumberField label="Wall height" value={draft.wallHeightM} unit="m" step={0.01} onChange={(next) => update('wallHeightM', next)} />
      </FieldGroup>

      <div className="grid grid-cols-2 gap-2">
        <SelectField label="Attachment wall" value={draft.attachmentWall} onChange={(next) => update('attachmentWall', next as ExistingHouseConditions['attachmentWall'])} options={['north', 'south', 'east', 'west']} />
        <NumberField label="Measured wall length" value={draft.attachmentWallLengthM} unit="m" step={0.01} onChange={(next) => update('attachmentWallLengthM', next)} />
        <NumberField label="Proposed ledger length" value={draft.proposedLedgerLengthM} unit="m" step={0.01} onChange={(next) => update('proposedLedgerLengthM', next)} />
        <SelectField label="Continuous flashing" value={draft.flashingFeasible} onChange={(next) => update('flashingFeasible', next as ExistingHouseConditions['flashingFeasible'])} options={['unknown', 'yes', 'no']} />
      </div>

      <FieldGroup title="Wall assembly">
        <SelectField label="Rim / band material" value={draft.rimBoardMaterial} onChange={(next) => update('rimBoardMaterial', next as ExistingHouseConditions['rimBoardMaterial'])} options={['unknown', 'solid-sawn', 'engineered-wood', 'concrete']} />
        <NumberField label="Rim / band depth" value={draft.rimBoardDepthMm || 0} unit="mm" step={1} onChange={(next) => update('rimBoardDepthMm', next > 0 ? next : null)} />
        <SelectField label="Cladding" value={draft.cladding} onChange={(next) => update('cladding', next as ExistingHouseConditions['cladding'])} options={['unknown', 'wood-siding', 'fiber-cement', 'vinyl', 'stucco', 'brick-veneer', 'other']} />
      </FieldGroup>

      <FieldGroup title="Door opening on attachment wall">
        <NumberField label="Offset from left" value={draft.doorOpeningOffsetM} unit="m" step={0.01} onChange={(next) => update('doorOpeningOffsetM', next)} />
        <NumberField label="Opening width" value={draft.doorOpeningWidthM} unit="m" step={0.01} onChange={(next) => update('doorOpeningWidthM', next)} />
        <NumberField label="Threshold above grade" value={draft.doorThresholdHeightMm} unit="mm" step={1} onChange={(next) => update('doorThresholdHeightMm', next)} />
      </FieldGroup>

      <div className="grid grid-cols-2 gap-2">
        <TextField label="Measured / recorded by" value={draft.measuredBy} onChange={(next) => update('measuredBy', next)} placeholder="Name and role" />
        <label className="block text-xs text-text-secondary">Measurement date<input type="date" value={draft.measuredAt} onChange={(event) => update('measuredAt', event.target.value)} className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" /></label>
      </div>
      <label className="block text-xs text-text-secondary">Field notes<textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} rows={2} placeholder="Openings, utilities, overhangs, damaged framing, access limits…" className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" /></label>

      {attempted && assessment.errors.length > 0 && <Message tone="error" title="Correct before saving" items={assessment.errors} />}
      {assessment.warnings.length > 0 && <Message tone="warning" title="Professional review remains blocked by" items={assessment.warnings} />}
      {saved && <div className="rounded-md bg-success/10 px-3 py-2 text-xs text-success">Existing-condition inputs saved. Regenerate drawings and attach field-verification evidence for the new revision.</div>}
      <button onClick={save} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-white"><Save size={15} /> Save as revision input</button>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-2 text-xs font-semibold text-text-primary">{title}</h4><div className="grid grid-cols-3 gap-2">{children}</div></div>;
}

function NumberField({ label, value, unit, step, onChange }: { label: string; value: number; unit: string; step: number; onChange: (value: number) => void }) {
  return <label className="block text-xs text-text-secondary">{label}<span className="mt-1 flex rounded-md border border-border bg-white"><input type="number" min="0" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 rounded-l-md px-2.5 py-2 text-sm text-text-primary outline-none" /><i className="flex items-center border-l border-border px-2 text-[10px] not-italic">{unit}</i></span></label>;
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="block text-xs text-text-secondary">{label}<input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="block text-xs text-text-secondary">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-white px-2.5 py-2 text-sm text-text-primary">{options.map((option) => <option key={option} value={option}>{option.replace(/-/g, ' ')}</option>)}</select></label>;
}

function Message({ tone, title, items }: { tone: 'error' | 'warning'; title: string; items: string[] }) {
  return <div className={`rounded-md px-3 py-2 text-xs ${tone === 'error' ? 'bg-danger/5 text-danger' : 'bg-warning/5 text-text-secondary'}`}><strong>{title}</strong><ul className="mt-1 list-disc space-y-0.5 pl-4">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
