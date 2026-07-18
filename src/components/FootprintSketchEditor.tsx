import { useRef } from 'react';
import type { Deck, DeckShape } from '../types';
import type { HouseModelContext } from './DeckModel3D';

interface FootprintSketchEditorProps {
  deck: Deck;
  houseContext: HouseModelContext | null;
  onResize: (dimensions: { width: number; depth: number; height: number }) => void;
  onShapeChange: (shape: DeckShape) => void;
}

type DragKind = 'width' | 'depth' | 'both';
interface DragState { kind: DragKind; x: number; y: number; width: number; depth: number; scale: number }

export function FootprintSketchEditor({ deck, houseContext, onResize, onShapeChange }: FootprintSketchEditorProps) {
  const drag = useRef<DragState | null>(null);
  const wallWidth = Math.max(deck.dimensions.width + (deck.sitePlacement?.wallStartOffsetM || 0) + 1, houseContext?.width || 7);
  const scale = Math.min(72, 640 / wallWidth, 360 / Math.max(deck.dimensions.depth, 4));
  const houseX = 80;
  const houseY = 45;
  const houseHeight = 92;
  const wallOffset = deck.sitePlacement?.wallStartOffsetM || Math.max(0, (wallWidth - deck.dimensions.width) / 2);
  const deckX = houseX + wallOffset * scale;
  const deckY = houseY + houseHeight;
  const deckWidth = deck.dimensions.width * scale;
  const deckDepth = deck.dimensions.depth * scale;
  const points = localShapePoints(deck.footprint.shape, deckWidth, deckDepth).map(([x, y]) => `${deckX + x},${deckY + y}`).join(' ');
  const rightX = deckX + deckWidth;
  const bottomY = deckY + deckDepth;
  const doorX = houseX + (houseContext?.doorOpeningOffsetM || wallWidth * .55) * scale;
  const doorWidth = (houseContext?.doorOpeningWidthM || .9) * scale;

  const startDrag = (kind: DragKind) => (event: React.PointerEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, x: event.clientX, y: event.clientY, width: deck.dimensions.width, depth: deck.dimensions.depth, scale };
  };
  const moveDrag = (event: React.PointerEvent<SVGCircleElement>) => {
    const active = drag.current;
    if (!active) return;
    const width = active.kind === 'depth' ? active.width : clamp(active.width + (event.clientX - active.x) / active.scale, 2, 8);
    const depth = active.kind === 'width' ? active.depth : clamp(active.depth + (event.clientY - active.y) / active.scale, 1.5, 6);
    onResize({ width: round(width, 2), depth: round(depth, 2), height: deck.footprint.heightAboveGrade });
  };
  const endDrag = (event: React.PointerEvent<SVGCircleElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };

  return <div className="absolute inset-0 overflow-hidden bg-[#edf2ef]" data-testid="footprint-sketch-editor">
    <div className="absolute left-5 top-5 z-10 max-w-sm rounded-xl border border-slate-300 bg-white/95 p-4 shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-emerald-700">Edit footprint</div>
      <h3 className="mt-1 text-base font-semibold text-slate-900">Drag the green grips</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">Pull an edge to extend the deck. Pull the corner to change width and depth together. Dimensions update the structural model live.</p>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Deck shape">
        {(['rectangle','l-shape','wraparound'] as DeckShape[]).map((shape) => <button key={shape} onClick={() => onShapeChange(shape)} className={`rounded-md px-2 py-2 text-xs font-semibold ${deck.footprint.shape === shape ? 'bg-emerald-700 text-white' : 'border border-slate-300 bg-white text-slate-600'}`}>{shape === 'l-shape' ? 'L-shape' : shape === 'wraparound' ? 'Wrap' : 'Rectangle'}</button>)}
      </div>
    </div>

    <svg viewBox="0 0 800 600" className="h-full w-full select-none" style={{ touchAction: 'none' }} aria-label="Touch deck footprint editor">
      <defs><pattern id="sketch-grid" width={scale} height={scale} patternUnits="userSpaceOnUse"><path d={`M ${scale} 0 L 0 0 0 ${scale}`} fill="none" stroke="#cbd7d0" strokeWidth="1" /></pattern></defs>
      <rect width="800" height="600" fill="url(#sketch-grid)" />
      <rect x={houseX} y={houseY} width={wallWidth * scale} height={houseHeight} rx="4" fill="#d8dedb" stroke="#33443b" strokeWidth="2" />
      <text x={houseX + 14} y={houseY + 28} fontSize="13" fontWeight="700" fill="#33443b">EXISTING HOUSE · {deck.footprint.houseWall.toUpperCase()} WALL</text>
      <rect x={doorX} y={deckY - 48} width={doorWidth} height="48" fill="#8db6b0" stroke="#315e57" strokeWidth="2" />
      <text x={doorX + doorWidth / 2} y={deckY - 17} textAnchor="middle" fontSize="8" fill="#183e38">DOOR</text>
      <polygon points={points} fill="#d9a06b" stroke="#174f3a" strokeWidth="3" />
      <text x={deckX + deckWidth / 2} y={deckY + Math.min(deckDepth / 2, 75)} textAnchor="middle" fontSize="15" fontWeight="700" fill="#174f3a">PROPOSED DECK</text>

      <Dimension x1={deckX} y1={bottomY + 35} x2={rightX} y2={bottomY + 35} label={`${deck.dimensions.width.toFixed(2)} m`} />
      <Dimension x1={rightX + 35} y1={deckY} x2={rightX + 35} y2={bottomY} label={`${deck.dimensions.depth.toFixed(2)} m`} vertical />
      <line x1={houseX} y1={deckY - 12} x2={deckX} y2={deckY - 12} stroke="#49645a" strokeDasharray="4 3" />
      <text x={(houseX + deckX) / 2} y={deckY - 18} textAnchor="middle" fontSize="9" fill="#49645a">{wallOffset.toFixed(2)} m wall offset</text>

      <Grip x={rightX} y={deckY + deckDepth / 2} label="WIDTH" onPointerDown={startDrag('width')} onPointerMove={moveDrag} onPointerUp={endDrag} />
      <Grip x={deckX + deckWidth / 2} y={bottomY} label="DEPTH" onPointerDown={startDrag('depth')} onPointerMove={moveDrag} onPointerUp={endDrag} />
      <Grip x={rightX} y={bottomY} label="BOTH" onPointerDown={startDrag('both')} onPointerMove={moveDrag} onPointerUp={endDrag} corner />
    </svg>

    <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-slate-300 bg-white/95 px-4 py-3 shadow-lg">
      <NumberInput label="Width" value={deck.dimensions.width} min={2} max={8} onChange={(width) => onResize({ width, depth: deck.dimensions.depth, height: deck.footprint.heightAboveGrade })} />
      <NumberInput label="Depth" value={deck.dimensions.depth} min={1.5} max={6} onChange={(depth) => onResize({ width: deck.dimensions.width, depth, height: deck.footprint.heightAboveGrade })} />
      <NumberInput label="Height" value={deck.footprint.heightAboveGrade} min={.1} max={3} onChange={(height) => onResize({ width: deck.dimensions.width, depth: deck.dimensions.depth, height })} />
      <span className="text-[10px] text-slate-500">metres</span>
    </div>
  </div>;
}

function Grip(props: { x: number; y: number; label: string; corner?: boolean; onPointerDown: React.PointerEventHandler<SVGCircleElement>; onPointerMove: React.PointerEventHandler<SVGCircleElement>; onPointerUp: React.PointerEventHandler<SVGCircleElement> }) {
  return <g><circle cx={props.x} cy={props.y} r="18" fill="white" stroke="#0f7a56" strokeWidth="3" {...props} /><circle cx={props.x} cy={props.y} r="7" fill="#0f7a56" pointerEvents="none" /><text x={props.x} y={props.y - 25} textAnchor="middle" fontSize="8" fontWeight="700" fill="#0f7a56" pointerEvents="none">{props.corner ? 'RESIZE' : props.label}</text></g>;
}

function Dimension({ x1, y1, x2, y2, label, vertical = false }: { x1: number; y1: number; x2: number; y2: number; label: string; vertical?: boolean }) {
  return <g><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#315e57" strokeWidth="1.5" /><line x1={x1 - (vertical ? 5 : 0)} y1={y1 - (vertical ? 0 : 5)} x2={x1 + (vertical ? 5 : 0)} y2={y1 + (vertical ? 0 : 5)} stroke="#315e57" /><line x1={x2 - (vertical ? 5 : 0)} y1={y2 - (vertical ? 0 : 5)} x2={x2 + (vertical ? 5 : 0)} y2={y2 + (vertical ? 0 : 5)} stroke="#315e57" /><rect x={(x1 + x2) / 2 - 25} y={(y1 + y2) / 2 - 10} width="50" height="18" rx="4" fill="white" /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#174f3a">{label}</text></g>;
}

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">{label}<input aria-label={`${label} metres`} type="number" min={min} max={max} step="0.05" value={Number(value.toFixed(2))} onChange={(event) => onChange(clamp(Number(event.target.value), min, max))} className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>;
}

function localShapePoints(shape: DeckShape, width: number, depth: number): Array<[number, number]> {
  if (shape === 'l-shape') return [[0,0],[width * .6,0],[width * .6,depth * .5],[width,depth * .5],[width,depth],[0,depth]];
  if (shape === 'wraparound') return [[0,0],[width,0],[width,depth],[width * .7,depth],[width * .7,depth * .3],[0,depth * .3]];
  return [[0,0],[width,0],[width,depth],[0,depth]];
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function round(value: number, decimals: number): number { const power = 10 ** decimals; return Math.round(value * power) / power; }
