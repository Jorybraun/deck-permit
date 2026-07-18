import type { DeckDesign, PointMm } from '../../domain/deckDesign';
import type { FramingDesign } from '../../domain/framingDesign';

interface FramingPlanPreviewProps {
  design: DeckDesign;
  framing: FramingDesign;
  stale: boolean;
}

const SHEET_WIDTH = 1000;
const SHEET_HEIGHT = 660;

/** Presentation-only review sheet derived from canonical deck and framing member geometry. */
export function FramingPlanPreview({ design, framing, stale }: FramingPlanPreviewProps) {
  const transform = createPlanTransform(design, framing);
  return <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm" aria-labelledby="framing-plan-heading">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div><span className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-800">S1.0 · Framing plan</span><h3 id="framing-plan-heading" className="mt-1 text-lg font-bold text-slate-950">Generated member layout</h3><p className="mt-1 text-xs text-slate-600">Diagrammatic review preview. Member coordinates and dimensions govern; printing scale is assigned when the sheet set is issued.</p></div>
      <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] ${stale ? 'bg-amber-100 text-amber-900' : framing.status === 'engineering-required' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-900'}`}>{stale ? 'Design changed · regenerate' : framing.status.replace(/-/g, ' ')}</span>
    </div>
    <div className="bg-[#e9eeeb] p-3 sm:p-5">
      <svg viewBox={`0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`} className="h-auto w-full bg-white shadow-md" role="img" aria-label={`Framing plan with ${framing.joists.length} joists, ${framing.beams.length} beams, ${framing.posts.length} posts, ${framing.stairOpenings.length} stair headers, and ${framing.stairStringers.length} stair stringers`}>
        <defs>
          <pattern id="framing-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#edf1ee" strokeWidth="1" /></pattern>
        </defs>
        <rect x="18" y="18" width={SHEET_WIDTH - 36} height={SHEET_HEIGHT - 36} fill="white" stroke="#18251f" strokeWidth="2" />
        <rect x="28" y="28" width={SHEET_WIDTH - 56} height={SHEET_HEIGHT - 116} fill="url(#framing-grid)" stroke="#aebbb4" />
        <g aria-label="Platform boundaries">
          {design.platforms.map((platform) => <g key={platform.id}><polygon points={platform.boundary.vertices.map((vertex) => pointString([vertex.xMm, vertex.yMm], transform)).join(' ')} fill="#f8faf8" stroke="#54665c" strokeWidth="2.5" /><text x={average(platform.boundary.vertices.map((vertex) => transform.x(vertex.xMm)))} y={average(platform.boundary.vertices.map((vertex) => transform.y(vertex.yMm)))} textAnchor="middle" fontSize="12" fontWeight="800" fill="#66776e">{platform.name.toUpperCase()} · EL. {platform.elevationMm}</text></g>)}
        </g>
        <g aria-label="Footings" fill="#fff7df" stroke="#b27b1e" strokeWidth="1.5">
          {framing.footings.map((footing) => <circle key={footing.id} cx={transform.x(footing.centerMm[0])} cy={transform.y(footing.centerMm[1])} r={Math.max(7, footing.widthMm * transform.scale / 2)} />)}
        </g>
        <g aria-label="Joists" stroke="#3d8a6c" strokeWidth="1.4">
          {framing.joists.map((joist) => <line key={joist.id} x1={transform.x(joist.startMm[0])} y1={transform.y(joist.startMm[1])} x2={transform.x(joist.endMm[0])} y2={transform.y(joist.endMm[1])} />)}
        </g>
        <g aria-label="Ledgers" stroke="#d35420" strokeWidth="7" strokeDasharray="12 4">
          {framing.ledgers.map((ledger) => <line key={ledger.id} x1={transform.x(ledger.startMm[0])} y1={transform.y(ledger.startMm[1])} x2={transform.x(ledger.endMm[0])} y2={transform.y(ledger.endMm[1])} />)}
        </g>
        <g aria-label="Beams" stroke="#173f67" strokeWidth="7">
          {framing.beams.map((beam) => <g key={beam.id}><line x1={transform.x(beam.startMm[0])} y1={transform.y(beam.startMm[1])} x2={transform.x(beam.endMm[0])} y2={transform.y(beam.endMm[1])} /><MemberLabel point={midpoint(beam.startMm, beam.endMm)} transform={transform} text={`${beam.id} · ${beam.section}`} /></g>)}
        </g>
        <g aria-label="Posts" fill="#173f67" stroke="white" strokeWidth="1.5">
          {framing.posts.map((post) => <rect key={post.id} x={transform.x(post.pointMm[0]) - 5} y={transform.y(post.pointMm[1]) - 5} width="10" height="10" />)}
        </g>
        <g aria-label="Guards" stroke="#754c9b" strokeWidth="5" strokeDasharray="4 4">
          {framing.guards.map((guard) => <line key={guard.id} x1={transform.x(guard.startMm[0])} y1={transform.y(guard.startMm[1])} x2={transform.x(guard.endMm[0])} y2={transform.y(guard.endMm[1])} />)}
        </g>
        <g aria-label="Stair opening trimmers" stroke="#b43f2d" strokeWidth="5" strokeDasharray="4 2">
          {framing.stairTrimmers.map((trimmer) => <line key={trimmer.id} x1={transform.x(trimmer.startMm[0])} y1={transform.y(trimmer.startMm[1])} x2={transform.x(trimmer.endMm[0])} y2={transform.y(trimmer.endMm[1])} />)}
        </g>
        <g aria-label="Stair opening headers" stroke="#b43f2d" strokeWidth="8">
          {framing.stairOpenings.map((opening) => <g key={opening.id}><line x1={transform.x(opening.headerStartMm[0])} y1={transform.y(opening.headerStartMm[1])} x2={transform.x(opening.headerEndMm[0])} y2={transform.y(opening.headerEndMm[1])} /><MemberLabel point={opening.centerMm} transform={transform} text={`${opening.id} · ${opening.projectedWidthMm}`} /></g>)}
        </g>
        <g aria-label="Stair stringers" stroke="#9b5e2d" strokeWidth="3" strokeDasharray="7 3">
          {framing.stairStringers.map((stringer) => <line key={stringer.id} x1={transform.x(stringer.startMm[0])} y1={transform.y(stringer.startMm[1])} x2={transform.x(stringer.endMm[0])} y2={transform.y(stringer.endMm[1])} />)}
        </g>
        <g transform={`translate(52 ${SHEET_HEIGHT - 85})`}><line x1="0" y1="0" x2={1000 * transform.scale} y2="0" stroke="#26372f" strokeWidth="3" /><line x1="0" y1="-6" x2="0" y2="6" stroke="#26372f" strokeWidth="2" /><line x1={1000 * transform.scale} y1="-6" x2={1000 * transform.scale} y2="6" stroke="#26372f" strokeWidth="2" /><text x={500 * transform.scale} y="18" textAnchor="middle" fontSize="9" fontWeight="700">1 000 mm</text></g>
        <g transform={`translate(320 ${SHEET_HEIGHT - 92})`} fontSize="9" fontWeight="700" fill="#31443a"><LegendLine x={0} color="#3d8a6c" label="JOIST" /><LegendLine x={95} color="#173f67" label="BEAM" wide /><LegendLine x={185} color="#d35420" label="LEDGER" wide /><LegendLine x={285} color="#754c9b" label="GUARD" wide /><LegendLine x={385} color="#b43f2d" label="HEADER" wide /><LegendLine x={495} color="#9b5e2d" label="STRINGER" /></g>
        <g transform={`translate(${SHEET_WIDTH - 275} ${SHEET_HEIGHT - 112})`}><rect width="247" height="84" fill="white" stroke="#26372f" /><text x="12" y="19" fontSize="12" fontWeight="900" fill="#17231d">FRAMING PLAN · REVIEW SET</text><text x="12" y="36" fontSize="9" fontWeight="700" fill="#4d5e55">{framing.codeProfile.label}</text><text x="12" y="52" fontSize="8" fill="#65756d">Generated {formatDate(framing.generatedAt)}</text><rect x="12" y="61" width="221" height="15" fill="#fff1d6" /><text x="122" y="72" textAnchor="middle" fontSize="8" fontWeight="900" fill="#8a4b12">NOT FOR CONSTRUCTION · REVIEW REQUIRED</text></g>
      </svg>
    </div>
  </section>;
}

interface PlanTransform { scale: number; x: (value: number) => number; y: (value: number) => number }

function createPlanTransform(design: DeckDesign, framing: FramingDesign): PlanTransform {
  const points: PointMm[] = [
    ...design.platforms.flatMap((platform) => platform.boundary.vertices.map((vertex): PointMm => [vertex.xMm, vertex.yMm])),
    ...framing.joists.flatMap((member) => [member.startMm, member.endMm]),
    ...framing.beams.flatMap((member) => [member.startMm, member.endMm]),
    ...framing.stairStringers.flatMap((member) => [member.startMm, member.endMm]),
    ...framing.stairOpenings.flatMap((member) => [member.headerStartMm, member.headerEndMm]),
    ...framing.stairTrimmers.flatMap((member) => [member.startMm, member.endMm]),
  ];
  if (!points.length) points.push([0, 0], [1000, 1000]);
  const minX = Math.min(...points.map((point) => point[0])); const maxX = Math.max(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1])); const maxY = Math.max(...points.map((point) => point[1]));
  const drawingWidth = SHEET_WIDTH - 130; const drawingHeight = SHEET_HEIGHT - 190;
  const scale = Math.min(drawingWidth / Math.max(1000, maxX - minX), drawingHeight / Math.max(1000, maxY - minY));
  const offsetX = 65 + (drawingWidth - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = 60 + (drawingHeight - (maxY - minY) * scale) / 2 - minY * scale;
  return { scale, x: (value) => offsetX + value * scale, y: (value) => offsetY + value * scale };
}

function MemberLabel({ point, transform, text }: { point: PointMm; transform: PlanTransform; text: string }) { return <g transform={`translate(${transform.x(point[0])} ${transform.y(point[1]) - 12})`}><rect x="-48" y="-10" width="96" height="16" rx="3" fill="white" stroke="#173f67" /><text y="1.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#173f67">{text}</text></g>; }
function LegendLine({ x, color, label, wide = false }: { x: number; color: string; label: string; wide?: boolean }) { return <g transform={`translate(${x} 0)`}><line x1="0" y1="0" x2="25" y2="0" stroke={color} strokeWidth={wide ? 6 : 3} /><text x="32" y="3">{label}</text></g>; }
function midpoint(first: PointMm, second: PointMm): PointMm { return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]; }
function pointString(point: PointMm, transform: PlanTransform): string { return `${transform.x(point[0])},${transform.y(point[1])}`; }
function average(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function formatDate(value: string): string { return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
