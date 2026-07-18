import { MoveVertical, Ruler, RotateCw } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DeckDesign, DeckPlatform, PointMm, VerticalEndpoint } from '../../domain/deckDesign';
import {
  createOrthographicProjection,
  projectPoint,
  projectionAxisForView,
  type OrthographicProjection,
  type OrthographicViewKey,
  type ProjectionAxis,
} from '../../domain/architecturalViews';
import type { SiteModel } from '../../domain/siteModel';

interface DeckElevationEditorProps {
  design: DeckDesign;
  site: SiteModel;
  onSelectObject: (objectId: string | null) => void;
  onSetElevation: (platformId: string, elevationMm: number) => void;
}

type ElevationViewKey = OrthographicViewKey;
type Axis = ProjectionAxis;
type ElevationDrag = { platformId: string; originalElevationMm: number; previewElevationMm: number; startScreenY: number };

const VIEW_WIDTH = 1000;
const DRAWING_SCALE_PX_PER_MM = .07;
const TOP_PADDING = 62;
const GRADE_PADDING = 92;

/** Orthographic design view: edits platform height without duplicating canonical geometry. */
export function DeckElevationEditor({ design, site, onSelectObject, onSetElevation }: DeckElevationEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewKey, setViewKey] = useState<ElevationViewKey>('yard-section');
  const [drag, setDrag] = useState<ElevationDrag | null>(null);
  const selectedPlatform = design.platforms.find((platform) => platform.id === design.selectedObjectId) ?? null;
  const axis = useMemo(() => elevationAxis(viewKey, design), [viewKey, design]);
  const model = useMemo(() => createElevationViewModel(design, site, axis, drag), [design, site, axis, drag]);

  const beginElevationDrag = (event: ReactPointerEvent<SVGCircleElement>, platform: DeckPlatform) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const screenY = svgScreenPoint(svgRef.current, event.clientX, event.clientY)[1];
    setDrag({ platformId: platform.id, originalElevationMm: platform.elevationMm, previewElevationMm: platform.elevationMm, startScreenY: screenY });
    onSelectObject(platform.id);
  };

  const moveElevation = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const screenY = svgScreenPoint(svgRef.current, event.clientX, event.clientY)[1];
    const deltaMm = Math.round((drag.startScreenY - screenY) / model.elevationScale / 10) * 10;
    setDrag({ ...drag, previewElevationMm: Math.max(0, Math.min(5000, drag.originalElevationMm + deltaMm)) });
  };

  const finishElevation = () => {
    if (!drag) return;
    if (drag.previewElevationMm !== drag.originalElevationMm) onSetElevation(drag.platformId, drag.previewElevationMm);
    setDrag(null);
  };

  return <div className="absolute inset-0 flex flex-col bg-[#edf2ef]" data-testid="deck-elevation-editor">
    <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-300 bg-white px-4 py-2">
      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500"><RotateCw size={14} /> Look horizontally from
        <select aria-label="Elevation view direction" value={viewKey} onChange={(event) => setViewKey(event.target.value as ElevationViewKey)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-slate-800">
          <option value="yard-section">House → yard section</option>
          <option value="house-wall">Along selected house wall</option>
          {selectedPlatform?.edges.map((edge, index) => <option key={edge.id} value={`edge:${selectedPlatform.id}:${index}`}>Along {selectedPlatform.name} edge E{index + 1}</option>)}
        </select>
      </label>
      <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500"><MoveVertical size={14} className="text-emerald-700" /><strong className="text-slate-700">Select a platform, then drag its green height handle.</strong></div>
    </div>

    <div className="relative min-h-0 flex-1 overflow-auto">
      <svg ref={svgRef} width={model.contentWidth} height={model.contentHeight} viewBox={`0 0 ${model.contentWidth} ${model.contentHeight}`} role="application" aria-label="Deck side elevation editor" className="block shrink-0 touch-none select-none" onPointerMove={moveElevation} onPointerUp={finishElevation} onPointerCancel={finishElevation}>
        <defs><pattern id="elevation-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#d5ded8" strokeWidth=".7" /></pattern></defs>
        <rect width={model.contentWidth} height={model.contentHeight} fill="url(#elevation-grid)" />
        <line x1="45" y1={model.groundY} x2={model.contentWidth - 45} y2={model.groundY} stroke="#43564c" strokeWidth="3" />
        <text x="52" y={model.groundY + 20} fontSize="10" fontWeight="800" fill="#43564c">PROJECT DATUM / LOCAL GRADE · EL. {site.terrain.datum.elevationMm} mm</text>
        <HouseElevation model={model} />
        {model.platforms.map((item) => <PlatformElevation key={item.platform.id} item={item} selected={item.platform.id === selectedPlatform?.id} model={model} axis={axis} onSelect={() => onSelectObject(item.platform.id)} onBeginDrag={(event) => beginElevationDrag(event, item.platform)} />)}
        {design.stairs.map((stair) => <StairElevation key={stair.id} stair={stair} design={design} model={model} axis={axis} onSelect={() => onSelectObject(stair.id)} />)}
        <g pointerEvents="none"><line x1={model.contentWidth - 60} y1={model.groundY} x2={model.contentWidth - 60} y2={model.groundY - 1000 * model.elevationScale} stroke="#166534" strokeWidth="1.5" /><line x1={model.contentWidth - 66} y1={model.groundY} x2={model.contentWidth - 54} y2={model.groundY} stroke="#166534" strokeWidth="2" /><line x1={model.contentWidth - 66} y1={model.groundY - 1000 * model.elevationScale} x2={model.contentWidth - 54} y2={model.groundY - 1000 * model.elevationScale} stroke="#166534" strokeWidth="2" /><text x={model.contentWidth - 70} y={model.groundY - 500 * model.elevationScale} textAnchor="end" fontSize="9" fontWeight="800" fill="#166534">1000 mm</text></g>
      </svg>
      <div className="sticky bottom-4 left-4 ml-4 w-fit max-w-md rounded-lg border border-blue-200 bg-white/95 px-3 py-2 text-[10px] leading-4 text-blue-950 shadow-lg"><strong className="flex items-center gap-1.5"><Ruler size={13} /> Linked orthographic view · one consistent scale</strong> 1 metre is {Math.round(DRAWING_SCALE_PX_PER_MM * 1000)} px in both directions. Long sections scroll horizontally. Framing graphics remain preliminary until spans, soil, attachment, and load path pass review.</div>
      {drag && <div aria-live="polite" className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-emerald-400 bg-white px-4 py-2 text-xs font-bold text-emerald-900 shadow-lg">{design.platforms.find((platform) => platform.id === drag.platformId)?.name} · EL. {drag.previewElevationMm} mm</div>}
    </div>
  </div>;
}

interface ElevationPlatformItem {
  platform: DeckPlatform;
  min: number;
  max: number;
  elevationMm: number;
  gradeMm: number;
  joistDepthMm: number;
  beamDepthMm: number;
  joistLabel: string;
  beamLabel: string;
}

interface ElevationViewModel {
  minProjection: number;
  projectionScale: number;
  elevationScale: number;
  contentWidth: number;
  contentHeight: number;
  groundY: number;
  x: (projection: number) => number;
  y: (elevationMm: number) => number;
  platforms: ElevationPlatformItem[];
  projection: OrthographicProjection;
}

export function createElevationViewModel(design: DeckDesign, site: SiteModel, axis: Axis, drag: ElevationDrag | null = null): ElevationViewModel {
  const elevationOverrides = drag ? { [drag.platformId]: drag.previewElevationMm } : undefined;
  const projection = createOrthographicProjection({ design, site, axis, elevationOverrides });
  const minProjection = Math.min(projection.minimumProjectionMm, 0);
  const maxProjection = Math.max(projection.maximumProjectionMm, 1000);
  const projectionScale = DRAWING_SCALE_PX_PER_MM;
  const elevationScale = DRAWING_SCALE_PX_PER_MM;
  const contentWidth = Math.max(VIEW_WIDTH, Math.ceil((maxProjection - minProjection) * projectionScale + 150));
  const platforms = projection.platforms.map((projected): ElevationPlatformItem => {
    const platform = design.platforms.find((candidate) => candidate.id === projected.id)!;
    return {
      platform,
      min: projected.minimumProjectionMm,
      max: projected.maximumProjectionMm,
      elevationMm: projected.surfaceElevationMm,
      gradeMm: projected.localGradeElevationMm,
      joistDepthMm: projected.joistDepthMm,
      beamDepthMm: projected.beamDepthMm,
      joistLabel: projected.joistLabel,
      beamLabel: projected.beamLabel,
    };
  });
  const selectedHandleElevation = Math.max(site.terrain.datum.elevationMm, ...platforms.filter((item) => item.platform.id === design.selectedObjectId).map((item) => item.elevationMm + 1100));
  const maxVisualElevation = Math.max(projection.maximumElevationMm, selectedHandleElevation);
  const groundY = TOP_PADDING + (maxVisualElevation - site.terrain.datum.elevationMm) * elevationScale;
  const contentHeight = Math.max(360, Math.ceil(groundY + GRADE_PADDING));
  const x = (value: number) => 75 + (value - minProjection) * projectionScale;
  const y = (value: number) => groundY - (value - site.terrain.datum.elevationMm) * elevationScale;
  return { minProjection, projectionScale, elevationScale, contentWidth, contentHeight, groundY, x, y, platforms, projection };
}

function PlatformElevation({ item, selected, model, axis, onSelect, onBeginDrag }: { item: ElevationPlatformItem; selected: boolean; model: ElevationViewModel; axis: Axis; onSelect: () => void; onBeginDrag: (event: ReactPointerEvent<SVGCircleElement>) => void }) {
  const x1 = model.x(item.min); const x2 = model.x(item.max); const surfaceY = model.y(item.elevationMm);
  const decking = Math.max(5, item.platform.finish.deckingThicknessMm * model.elevationScale);
  const joists = Math.max(12, item.joistDepthMm * model.elevationScale);
  const beam = Math.max(9, item.beamDepthMm * model.elevationScale);
  const framingBottom = surfaceY + decking + joists + beam;
  const gradeY = model.y(item.gradeMm);
  const postXs = x2 - x1 < 90 ? [(x1 + x2) / 2] : [x1 + (x2 - x1) * .18, x2 - (x2 - x1) * .18];
  const guardHeightMm = item.elevationMm - item.gradeMm > 1800 ? 1070 : 900;
  return <g role="button" tabIndex={0} aria-label={`${item.platform.name} side elevation, ${item.elevationMm} millimetres`} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }} className="cursor-pointer">
    {postXs.map((postX, index) => <g key={index} pointerEvents="none"><line x1={postX} y1={framingBottom} x2={postX} y2={gradeY} stroke="#76512f" strokeWidth="10" /><rect x={postX - 18} y={gradeY} width="36" height="12" fill="#d3d7d4" stroke="#5d6962" strokeWidth="2" /><text x={postX + 9} y={(framingBottom + gradeY) / 2} transform={`rotate(-90 ${postX + 9} ${(framingBottom + gradeY) / 2})`} textAnchor="middle" fontSize="7" fontWeight="800" fill="#6f4d30">PRELIM. POST</text></g>)}
    <rect x={x1} y={surfaceY} width={Math.max(3, x2 - x1)} height={decking} fill="#b87942" stroke={selected ? '#087553' : '#60472f'} strokeWidth={selected ? 4 : 2} />
    <rect x={x1} y={surfaceY + decking} width={Math.max(3, x2 - x1)} height={joists} fill="#e2bc8e" stroke="#76512f" strokeWidth="2" />
    <line x1={x1} y1={surfaceY + decking + joists + beam / 2} x2={x2} y2={surfaceY + decking + joists + beam / 2} stroke="#34473d" strokeWidth={beam} />
    <text x={(x1 + x2) / 2} y={surfaceY - 12} textAnchor="middle" fontSize="11" fontWeight="900" fill="#174f3a">{item.platform.name.toUpperCase()} · TOP EL. {item.elevationMm} mm</text>
    <text x={(x1 + x2) / 2} y={surfaceY + decking + joists / 2 + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#61401f">JOISTS {item.joistLabel} · PRELIMINARY</text>
    <text x={(x1 + x2) / 2} y={surfaceY + decking + joists + beam + 14} textAnchor="middle" fontSize="7" fontWeight="800" fill="#34473d">BEAM {item.beamLabel}</text>
    {item.platform.edges.map((edge, index) => {
      if (edge.role !== 'guard') return null;
      const start = item.platform.boundary.vertices[index]; const end = item.platform.boundary.vertices[(index + 1) % item.platform.boundary.vertices.length];
      const guardX1 = model.x(projectPoint([start.xMm, start.yMm], axis)); const guardX2 = model.x(projectPoint([end.xMm, end.yMm], axis));
      const left = Math.min(guardX1, guardX2); const right = Math.max(guardX1, guardX2); const top = surfaceY - guardHeightMm * model.elevationScale;
      const balusters = Math.max(1, Math.ceil(Math.max(1, right - left) / 70));
      return <g key={edge.id} pointerEvents="none"><line x1={guardX1} y1={surfaceY} x2={guardX1} y2={top} stroke="#15231c" strokeWidth="4" /><line x1={guardX2} y1={surfaceY} x2={guardX2} y2={top} stroke="#15231c" strokeWidth="4" /><line x1={guardX1} y1={top} x2={guardX2} y2={top} stroke="#15231c" strokeWidth="5" />{Array.from({ length: balusters + 1 }, (_, balusterIndex) => { const x = left + (right - left) * balusterIndex / balusters; return <line key={balusterIndex} x1={x} y1={surfaceY} x2={x} y2={top} stroke="#52665b" strokeWidth="1.5" />; })}<text x={(guardX1 + guardX2) / 2} y={top - 8} textAnchor="middle" fontSize="7" fontWeight="800" fill="#263b31">{item.platform.finish.guardSystem.toUpperCase()} · {guardHeightMm} mm</text></g>;
    })}
    {selected && <g><line x1={(x1 + x2) / 2} y1={surfaceY - 10} x2={(x1 + x2) / 2} y2={surfaceY - 58} stroke="#087553" strokeWidth="2" strokeDasharray="5 4" pointerEvents="none" /><circle cx={(x1 + x2) / 2} cy={surfaceY - 70} r="15" fill="white" stroke="#087553" strokeWidth="4" onPointerDown={onBeginDrag} aria-label={`Drag to change ${item.platform.name} elevation`} className="cursor-ns-resize" /><text x={(x1 + x2) / 2} y={surfaceY - 66} textAnchor="middle" fontSize="12" fontWeight="900" fill="#087553" pointerEvents="none">↕</text></g>}
  </g>;
}

function StairElevation({ stair, design, model, axis, onSelect }: { stair: DeckDesign['stairs'][number]; design: DeckDesign; model: ElevationViewModel; axis: Axis; onSelect: () => void }) {
  const fromElevation = endpointElevation(design, stair.from);
  const toElevation = endpointElevation(design, stair.to);
  const x1 = model.x(projectPoint(stair.startMm, axis)); const x2 = model.x(projectPoint(stair.endMm, axis));
  const y1 = model.y(fromElevation); const y2 = model.y(toElevation);
  const treadCount = Math.max(1, stair.riserCount - 1);
  const points = Array.from({ length: stair.riserCount * 2 }, (_, index): PointMm => {
    const step = Math.floor(index / 2);
    const fractionX = index % 2 === 0 ? step / treadCount : Math.min(1, (step + 1) / treadCount);
    const fractionY = step / Math.max(1, stair.riserCount);
    return [x1 + (x2 - x1) * fractionX, y1 + (y2 - y1) * fractionY];
  });
  points.push([x2, y2]);
  const destinationPlatformId = stair.to.kind === 'platform' ? stair.to.platformId : null;
  const destination = destinationPlatformId ? design.platforms.find((platform) => platform.id === destinationPlatformId)?.name.toUpperCase() || destinationPlatformId : 'YARD / GRADE';
  const hasHandrail = stair.handrailSides !== 'none';
  const railOffset = 900 * model.elevationScale;
  return <g role="button" tabIndex={0} onClick={onSelect} aria-label={`${stair.name} side elevation, ${stair.riserCount} risers, lands on ${destination.toLowerCase()}`} className="cursor-pointer"><polyline points={points.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#a95318" strokeWidth="5" /><line x1={x1} y1={y1 + 12} x2={x2} y2={y2 + 12} stroke="#76512f" strokeWidth="3" />{hasHandrail && <g pointerEvents="none"><line x1={x1} y1={y1 - railOffset} x2={x2} y2={y2 - railOffset} stroke="#15231c" strokeWidth="5" /><line x1={x1} y1={y1} x2={x1} y2={y1 - railOffset} stroke="#15231c" strokeWidth="3" /><line x1={x2} y1={y2} x2={x2} y2={y2 - railOffset} stroke="#15231c" strokeWidth="3" /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - railOffset - 8} textAnchor="middle" fontSize="7" fontWeight="800" fill="#263b31">HANDRAIL · {stair.handrailSides.toUpperCase()}</text></g>}<circle cx={x1} cy={y1} r="9" fill="white" stroke="#a95318" strokeWidth="3" /><text x={x1} y={y1 + 3} textAnchor="middle" fontSize="7" fontWeight="900" fill="#8d4811">A</text><circle cx={x2} cy={y2} r="9" fill="white" stroke={stair.to.kind === 'terrain' ? '#c2412d' : '#087553'} strokeWidth="3" /><text x={x2} y={y2 + 3} textAnchor="middle" fontSize="7" fontWeight="900" fill={stair.to.kind === 'terrain' ? '#c2412d' : '#087553'}>B</text><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 16} textAnchor="middle" fontSize="9" fontWeight="900" fill="#8d4811">{stair.name.toUpperCase()} · {stair.riserCount}R @ {stair.riserHeightMm}</text><text x={x2 + 12} y={y2 + 18} fontSize="8" fontWeight="900" fill={stair.to.kind === 'terrain' ? '#c2412d' : '#087553'}>B → {destination}</text></g>;
}

function HouseElevation({ model }: { model: ElevationViewModel }) {
  const house = model.projection.house;
  const x1 = model.x(house.minimumProjectionMm); const x2 = model.x(house.maximumProjectionMm);
  const wallTop = model.y(house.topElevationMm);
  const wallWidth = Math.max(20, x2 - x1);
  return <g pointerEvents="none" opacity=".72"><rect x={x1} y={wallTop} width={wallWidth} height={model.y(house.baseElevationMm) - wallTop} fill="#d6ded9" stroke="#45574d" strokeWidth="3" /><text x={x1 + wallWidth / 2} y={wallTop + 24} textAnchor="middle" fontSize="11" fontWeight="900" fill="#45574d">EXISTING HOUSE / SELECTED WALL</text>{house.openings.map((opening) => { const openingStart = model.x(opening.minimumProjectionMm); const openingEnd = model.x(opening.maximumProjectionMm); const width = Math.max(12, Math.abs(openingEnd - openingStart)); const x = Math.min(openingStart, openingEnd); const y = model.y(opening.headElevationMm); const bottom = model.y(opening.sillElevationMm); return <g key={opening.id}><rect x={x} y={y} width={width} height={bottom - y} fill="#9cc5c1" stroke="#315e57" strokeWidth="2" /><text x={x + width / 2} y={y - 7} textAnchor="middle" fontSize="7" fontWeight="800" fill="#315e57">{opening.kind.toUpperCase()}</text></g>; })}</g>;
}

function elevationAxis(viewKey: ElevationViewKey, design: DeckDesign): Axis {
  return projectionAxisForView(viewKey, design);
}

function endpointElevation(design: DeckDesign, endpoint: VerticalEndpoint): number {
  if (endpoint.kind === 'terrain') return endpoint.elevationMm;
  return design.platforms.find((platform) => platform.id === endpoint.platformId)?.elevationMm ?? 0;
}

function svgScreenPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): PointMm { const matrix = svg?.getScreenCTM(); if (!svg || !matrix) return [0, 0]; const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()); return [point.x, point.y]; }
