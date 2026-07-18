import { useEffect, useMemo, useState } from 'react';
import type { Deck, DeckLayout } from '../types';
import { assessDeckLayout, normalizeDeckLayout } from '../services/deckLayout';

export function FramingLayoutPanel({ deck, onChange }: { deck: Deck; onChange: (deck: Deck) => void }) {
  const current = normalizeDeckLayout(deck);
  const [beamText, setBeamText] = useState(current.beamOffsetsFromHouseM.join(', '));
  const [postText, setPostText] = useState(current.postStationsM.join(', '));
  const [stairOffset, setStairOffset] = useState(current.stairOffsetM);
  const [landingDepth, setLandingDepth] = useState(current.stairLandingDepthM);
  const [stairEdge, setStairEdge] = useState(deck.stairs.edge);

  useEffect(() => {
    const next = normalizeDeckLayout(deck);
    setBeamText(next.beamOffsetsFromHouseM.join(', '));
    setPostText(next.postStationsM.join(', '));
    setStairOffset(next.stairOffsetM);
    setLandingDepth(next.stairLandingDepthM);
    setStairEdge(deck.stairs.edge);
  }, [deck]);

  const layout = useMemo<DeckLayout>(() => ({
    schema: 'deck-layout/v1',
    beamOffsetsFromHouseM: parseStations(beamText),
    postStationsM: parseStations(postText),
    stairOffsetM: stairOffset,
    stairLandingDepthM: landingDepth,
    updatedAt: new Date().toISOString(),
  }), [beamText, postText, stairOffset, landingDepth]);
  const candidate = useMemo<Deck>(() => ({ ...deck, layout, stairs: { ...deck.stairs, edge: stairEdge } }), [deck, layout, stairEdge]);
  const assessment = assessDeckLayout(candidate);

  return <section className="rounded-lg border border-border bg-white p-4 space-y-4" aria-labelledby="framing-layout-heading">
    <div><h3 id="framing-layout-heading" className="text-sm font-semibold text-text-primary">Dimensioned construction layout</h3><p className="mt-1 text-xs text-text-secondary">Local origin: house-side left deck corner. Coordinates drive the framing plan, calculations, 3D model, and footing schedule.</p></div>
    <label className="block text-xs text-text-secondary">Beam offsets from house side (m)
      <input aria-label="Beam offsets from house side" value={beamText} onChange={(event) => setBeamText(event.target.value)} placeholder={deck.footprint.attachedToHouse ? '2.650' : '0.350, 2.650'} className="mt-1 w-full rounded-md border border-border px-2.5 py-2 font-mono text-sm text-text-primary" />
    </label>
    <label className="block text-xs text-text-secondary">Post / footing stations from left edge (m)
      <input aria-label="Post and footing stations" value={postText} onChange={(event) => setPostText(event.target.value)} placeholder="0.000, 1.333, 2.667, 4.000" className="mt-1 w-full rounded-md border border-border px-2.5 py-2 font-mono text-sm text-text-primary" />
    </label>
    <div className="grid grid-cols-3 gap-3">
      <label className="text-xs text-text-secondary">Stair edge<select aria-label="Stair edge" value={stairEdge} onChange={(event) => setStairEdge(event.target.value as Deck['stairs']['edge'])} className="mt-1 w-full rounded-md border border-border bg-white px-2 py-2 text-sm text-text-primary">{['north','south','east','west'].map((edge) => <option key={edge}>{edge}</option>)}</select></label>
      <NumberField label="Stair offset (m)" ariaLabel="Stair offset" value={stairOffset} onChange={setStairOffset} />
      <NumberField label="Landing depth (m)" ariaLabel="Bottom landing depth" value={landingDepth} onChange={setLandingDepth} />
    </div>
    <div className="grid grid-cols-3 gap-2 rounded-md bg-surface p-3 text-center">
      <Metric label="Beam lines" value={String(layout.beamOffsetsFromHouseM.length)} />
      <Metric label="Supports / beam" value={String(layout.postStationsM.length)} />
      <Metric label="Maximum bay" value={`${assessment.maxPostBayM.toFixed(3)} m`} />
    </div>
    {assessment.errors.length > 0 && <div className="rounded-md bg-danger/10 p-3 text-xs text-danger">{assessment.errors.join(' ')}</div>}
    {assessment.warnings.length > 0 && <div className="rounded-md bg-warning/10 p-3 text-xs text-warning">{assessment.warnings.join(' ')}</div>}
    <button type="button" disabled={assessment.errors.length > 0} onClick={() => onChange(candidate)} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Apply construction coordinates</button>
  </section>;
}

function parseStations(value: string): number[] {
  return value.split(',').map((part) => Number(part.trim())).filter((number) => Number.isFinite(number));
}

function NumberField({ label, ariaLabel, value, onChange }: { label: string; ariaLabel: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-xs text-text-secondary">{label}<input aria-label={ariaLabel} type="number" min="0" step="0.05" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full rounded-md border border-border px-2 py-2 text-sm text-text-primary" /></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs font-semibold text-text-primary">{value}</div><div className="mt-0.5 text-[9px] uppercase tracking-wide text-text-secondary">{label}</div></div>;
}
