import { useEffect, useMemo, useState } from 'react';
import type { Deck, DeckSitePlacement, Property } from '../types';
import { rebuildDeck } from '../services/deckSizing';
import { assessSitePlacement, createDefaultSitePlacement } from '../services/sitePlacement';

interface SitePlacementPanelProps {
  property: Property;
  deck: Deck;
  onChange: (deck: Deck) => void;
}

type Wall = Deck['footprint']['houseWall'];

export function SitePlacementPanel({ property, deck, onChange }: SitePlacementPanelProps) {
  const initial = deck.sitePlacement || createDefaultSitePlacement(property, deck.dimensions.width, deck.footprint.attachedToHouse, deck.footprint.houseWall);
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(deck.sitePlacement || createDefaultSitePlacement(property, deck.dimensions.width, deck.footprint.attachedToHouse, deck.footprint.houseWall));
  }, [deck]);

  const candidate = useMemo<DeckSitePlacement>(() => ({ ...draft, status: 'field-input-unverified', referenceSource: 'field-measurement', outwardGapM: deck.footprint.attachedToHouse ? 0 : draft.outwardGapM }), [draft, deck.footprint.attachedToHouse]);
  const preview = useMemo(() => rebuildDeck(deck, property, { sitePlacement: candidate }), [deck, property, candidate]);
  const assessment = assessSitePlacement(property, preview);

  const selectWall = (wall: Wall) => {
    const next = rebuildDeck(deck, property, { houseWall: wall });
    onChange(next);
  };

  const update = <K extends keyof DeckSitePlacement>(key: K, value: DeckSitePlacement[K]) => {
    setDraft((current) => ({ ...current, [key]: value, updatedAt: new Date().toISOString() }));
  };

  const save = () => {
    const placement: DeckSitePlacement = {
      ...candidate,
      updatedAt: new Date().toISOString(),
    };
    const next = rebuildDeck(deck, property, { sitePlacement: placement });
    if (assessSitePlacement(property, next).errors.length) return;
    onChange(next);
  };

  return (
    <section className="rounded-lg border border-border bg-white p-4 space-y-4" aria-labelledby="site-placement-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="site-placement-heading" className="text-sm font-semibold text-text-primary">House-wall placement</h3>
          <p className="mt-1 text-xs text-text-secondary">Dimension the deck from one end of the selected wall. This controls the site plan and 3D house context.</p>
        </div>
        <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase ${initial.status === 'field-input-unverified' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
          {initial.status === 'field-input-unverified' ? 'field input · unverified' : 'generated · unverified'}
        </span>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-text-primary">Attachment / reference wall</legend>
        <div className="grid grid-cols-4 gap-2">
          {(['north', 'south', 'east', 'west'] as Wall[]).map((wall) => <button key={wall} type="button" onClick={() => selectWall(wall)} className={`rounded-md px-2 py-2 text-xs font-medium capitalize ${deck.footprint.houseWall === wall ? 'bg-primary text-white' : 'border border-border text-text-secondary'}`}>{wall}</button>)}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-text-secondary">Offset from wall start (m)
          <input aria-label="Offset from wall start" type="number" min="0" step="0.05" value={draft.wallStartOffsetM} onChange={(event) => update('wallStartOffsetM', Number(event.target.value))} className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" />
        </label>
        <label className="text-xs text-text-secondary">House gap (m)
          <input aria-label="House gap" type="number" min="0" step="0.05" disabled={deck.footprint.attachedToHouse} value={deck.footprint.attachedToHouse ? 0 : draft.outwardGapM} onChange={(event) => update('outwardGapM', Number(event.target.value))} className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary disabled:bg-surface" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-md bg-surface p-3 text-center">
        <Metric label="Wall reference" value={assessment.wallLengthM === null ? 'Unconfirmed' : `${assessment.wallLengthM.toFixed(2)} m`} />
        <Metric label="Far-end offset" value={assessment.wallEndOffsetM === null ? 'Unconfirmed' : `${assessment.wallEndOffsetM.toFixed(2)} m`} />
        <Metric label="Nearest parcel edge" value={assessment.nearestParcelEdgeM === null ? 'Unconfirmed' : `${assessment.nearestParcelEdgeM.toFixed(2)} m*`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-text-secondary">Measured / recorded by
          <input aria-label="Placement recorded by" value={draft.recordedBy} onChange={(event) => update('recordedBy', event.target.value)} placeholder="Name or company" className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" />
        </label>
        <label className="text-xs text-text-secondary">Measurement date
          <input aria-label="Placement measurement date" type="text" inputMode="numeric" pattern="\d{4}-\d{2}-\d{2}" placeholder="YYYY-MM-DD" value={draft.recordedAt} onChange={(event) => update('recordedAt', event.target.value)} className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" />
        </label>
      </div>
      <label className="block text-xs text-text-secondary">Placement notes
        <textarea aria-label="Placement notes" value={draft.notes} onChange={(event) => update('notes', event.target.value)} rows={2} placeholder="Reference corner, wall face, tape/laser method, obstructions…" className="mt-1 w-full rounded-md border border-border px-2.5 py-2 text-sm text-text-primary" />
      </label>

      {assessment.errors.length > 0 && <div className="rounded-md bg-danger/10 p-3 text-xs text-danger">{assessment.errors.join(' ')}</div>}
      {assessment.warnings.length > 0 && <div className="rounded-md bg-amber-50 p-3 text-[11px] text-amber-800">{assessment.warnings.join(' ')}</div>}
      <p className="text-[10px] text-text-secondary">* GIS screening distance only. It is not a legal setback or survey dimension.</p>
      <button type="button" onClick={save} disabled={assessment.errors.length > 0} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Apply measured placement</button>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs font-semibold text-text-primary">{value}</div><div className="mt-0.5 text-[9px] uppercase tracking-wide text-text-secondary">{label}</div></div>;
}
