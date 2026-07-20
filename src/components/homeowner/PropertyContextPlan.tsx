import { MousePointer2 } from 'lucide-react';
import { useMemo } from 'react';
import { edgeLengthMm, openBuildingRing } from '../../domain/siteModel';
import type { SiteModel } from '../../domain/siteModel';
import type { LatLng, Property } from '../../types';

interface PropertyContextPlanProps {
  property: Property;
  site: SiteModel;
  onSelectWall: (buildingId: string, edgeIndex: number) => void;
  onSelectFrontage: (edgeIndex: number) => void;
}

/** Displays municipal parcel/roofline evidence and emits an explicit house-edge selection. */
export function PropertyContextPlan({ property, site, onSelectWall, onSelectFrontage }: PropertyContextPlanProps) {
  const transform = useMemo(() => mapTransform(property), [property]);
  const primary = property.buildings.find((building) => building.primary) || null;
  if (!property.parcel || !transform) return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No municipal parcel geometry is available to draw.</div>;
  const primaryRing = primary ? openBuildingRing(primary) : [];
  const parcelRing = openRing(property.parcel.polygon);
  const setbackBands = buildSetbackBands(parcelRing, property, site, transform);
  const wallLengthMm = site.designWall.lengthMm || 0;
  const selectedWallEdge = primary && site.designWall.sourceBuildingId === primary.id && site.designWall.sourceEdgeIndex != null && site.designWall.sourceEdgeIndex >= 0 && site.designWall.sourceEdgeIndex < primaryRing.length ? site.designWall.sourceEdgeIndex : null;
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-[Manrope] text-lg font-bold text-slate-950">Whole property & house reference</h3><p className="mt-1 text-xs text-slate-600">Click the property line along the street to name the front/rear/side yards. Then click the yard-facing house edge used by the deck.</p></div><span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"><MousePointer2 size={14} /> Select parcel + house edges</span></div>
    <div className="relative h-[390px] bg-[#eef3ef]">
      <svg viewBox="0 0 900 500" className="h-full w-full" role="application" aria-label="Municipal property and house wall selector">
        <defs><pattern id="site-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#d9e2dc" strokeWidth="1" /></pattern></defs>
        <rect width="900" height="500" fill="url(#site-grid)" />
        <polygon points={points(property.parcel.polygon, transform)} fill="#dff0e6" stroke="#167252" strokeWidth="2" />
        {setbackBands.map((band) => <g key={`setback-${band.index}`}>
          <polygon points={band.bandPoints} fill="#c2410c" fillOpacity={0.1} stroke="none" />
          <line x1={band.guide[0]} y1={band.guide[1]} x2={band.guide[2]} y2={band.guide[3]} stroke="#c2410c" strokeWidth={1.5} strokeDasharray="7 5" />
          <text x={band.labelX} y={band.labelY} textAnchor="middle" fontSize="10" fontWeight="800" fill="#9a3412" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>{band.label}</text>
        </g>)}
        {parcelRing.map((start, index) => {
          const end = parcelRing[(index + 1) % parcelRing.length];
          const selected = site.yardReference.frontEdgeIndex === index;
          const rear = site.yardReference.rearEdgeIndex === index;
          return <g key={`parcel-edge-${index}`}>
            <line x1={transform.x(start[0])} y1={transform.y(start[1])} x2={transform.x(end[0])} y2={transform.y(end[1])} stroke={selected ? '#e15e28' : rear ? '#175ec7' : '#167252'} strokeWidth={selected || rear ? 8 : 4} strokeDasharray={selected || rear ? undefined : '10 5'} strokeLinecap="round" />
            <line role="button" tabIndex={0} aria-label={`Mark parcel edge ${index + 1} as street frontage`} onClick={() => onSelectFrontage(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectFrontage(index); }} x1={transform.x(start[0])} y1={transform.y(start[1])} x2={transform.x(end[0])} y2={transform.y(end[1])} stroke="transparent" strokeWidth="22" className="cursor-pointer" />
          </g>;
        })}
        {property.buildings.map((building) => <polygon key={building.id} points={points(building.polygon, transform)} fill={building.primary ? '#c7d3cc' : '#dfe5e1'} stroke={building.primary ? '#263b31' : '#7a8b82'} strokeWidth={building.primary ? 3 : 1.5} />)}
        {primary && primaryRing.map((start, index) => {
          const end = primaryRing[(index + 1) % primaryRing.length];
          const selected = site.designWall.sourceBuildingId === primary.id && site.designWall.sourceEdgeIndex === index;
          const length = edgeLengthMm(primary, index, property.parcel!.center[1]);
          const visible = length >= 2000;
          return <g key={`${primary.id}-edge-${index}`}>
            {visible && <line x1={transform.x(start[0])} y1={transform.y(start[1])} x2={transform.x(end[0])} y2={transform.y(end[1])} stroke={selected ? '#e15e28' : '#176e52'} strokeWidth={selected ? 8 : 5} strokeLinecap="round" />}
            <line role="button" tabIndex={0} aria-label={`Select house edge ${index + 1}, ${(length / 1000).toFixed(2)} metres`} onClick={() => onSelectWall(primary.id, index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectWall(primary.id, index); }} x1={transform.x(start[0])} y1={transform.y(start[1])} x2={transform.x(end[0])} y2={transform.y(end[1])} stroke="transparent" strokeWidth="18" className={visible ? 'cursor-pointer' : 'pointer-events-none'} />
          </g>;
        })}
        {selectedWallEdge !== null && wallLengthMm > 0 && (() => {
          const s = primaryRing[selectedWallEdge];
          const e = primaryRing[(selectedWallEdge + 1) % primaryRing.length];
          const sx = transform.x(s[0]), sy = transform.y(s[1]), ex = transform.x(e[0]), ey = transform.y(e[1]);
          return site.designWall.openings.map((opening) => {
            const t0 = Math.max(0, Math.min(1, opening.offsetMm / wallLengthMm));
            const t1 = Math.max(0, Math.min(1, (opening.offsetMm + opening.widthMm) / wallLengthMm));
            const x0 = sx + (ex - sx) * t0, y0 = sy + (ey - sy) * t0, x1 = sx + (ex - sx) * t1, y1 = sy + (ey - sy) * t1;
            const color = opening.kind === 'door' ? '#b4531e' : '#0e7490';
            return <g key={`opening-${opening.id}`}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={color} strokeWidth={10} strokeLinecap="butt" />
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#fff" strokeWidth={2.5} strokeLinecap="butt" strokeDasharray="1 6" />
              <text x={(x0 + x1) / 2} y={(y0 + y1) / 2 - 9} textAnchor="middle" fontSize="9" fontWeight="800" fill={color} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>{opening.id}</text>
            </g>;
          });
        })()}
        <text x="840" y="50" textAnchor="middle" fontSize="12" fontWeight="800" fill="#405249">N</text><path d="M840 78V58M834 64l6-8 6 8" fill="none" stroke="#405249" strokeWidth="2" />
        <text x="28" y="36" fontSize="11" fontWeight="800" fill="#176e52">MUNICIPAL PARCEL · {property.parcel.pid}</text>
        {primary && <text x={transform.x(primary.polygon[0][0])} y={transform.y(primary.polygon[0][1]) - 12} fontSize="11" fontWeight="800" fill="#263b31">PRIMARY HOUSE REFERENCE</text>}
      </svg>
      <div className="absolute bottom-3 left-3 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-[10px] leading-4 text-slate-600 shadow-sm"><span className="font-bold text-emerald-800">Parcel:</span> municipal cadastral line · {site.yardReference.frontEdgeIndex === null ? 'frontage unconfirmed' : `PL-${site.yardReference.frontEdgeIndex + 1} front`} · {site.yardReference.rearEdgeIndex === null ? 'rear unconfirmed' : `PL-${site.yardReference.rearEdgeIndex + 1} rear`}<br /><span className="font-bold text-slate-800">House:</span> {primary ? 'municipal footprint reference, not a field survey' : 'not supplied by this data layer'}</div>
    </div>
  </section>;
}

interface MapTransform { x: (lng: number) => number; y: (lat: number) => number }
function mapTransform(property: Property): MapTransform | null {
  const ring = property.parcel?.polygon || [];
  if (ring.length < 3) return null;
  const bounds = ring.reduce((result, [lng, lat]) => ({ minLng: Math.min(result.minLng, lng), maxLng: Math.max(result.maxLng, lng), minLat: Math.min(result.minLat, lat), maxLat: Math.max(result.maxLat, lat) }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });
  const scale = Math.min(820 / Math.max(0.000001, bounds.maxLng - bounds.minLng), 420 / Math.max(0.000001, bounds.maxLat - bounds.minLat));
  const width = (bounds.maxLng - bounds.minLng) * scale; const height = (bounds.maxLat - bounds.minLat) * scale;
  const offsetX = (900 - width) / 2; const offsetY = (500 - height) / 2;
  return { x: (lng) => offsetX + (lng - bounds.minLng) * scale, y: (lat) => 500 - offsetY - (lat - bounds.minLat) * scale };
}
function points(ring: LatLng[], transform: MapTransform): string { return ring.map(([lng, lat]) => `${transform.x(lng)},${transform.y(lat)}`).join(' '); }
function openRing(ring: LatLng[]): LatLng[] { return ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring; }

interface SetbackBand { index: number; bandPoints: string; guide: [number, number, number, number]; labelX: number; labelY: number; label: string; }

/** Classify a parcel edge by the recorded yard orientation and read its zoning setback. */
function classifyEdge(index: number, yardReference: SiteModel['yardReference'], zoning: NonNullable<Property['zoning']>): { label: string; meters: number } {
  if (index === yardReference.frontEdgeIndex) return { label: 'FRONT', meters: zoning.setbacks.front };
  if (index === yardReference.rearEdgeIndex) return { label: 'REAR', meters: zoning.setbacks.rear };
  if (index === yardReference.exteriorSideEdgeIndex) return { label: 'EXT. SIDE', meters: zoning.setbacks.exteriorSide };
  return { label: 'SIDE', meters: zoning.setbacks.side };
}

/**
 * Build the reference setback envelope: for each parcel edge, offset a guide line inward by
 * the zoning setback for that yard, shading the strip between the property line and the guide.
 * The inner clear area is where the deck can go. Offsets are computed per edge from its real
 * metric length, so distances read true even though the plan is a friendly (non-survey) view.
 */
function buildSetbackBands(parcelRing: LatLng[], property: Property, site: SiteModel, transform: MapTransform): SetbackBand[] {
  const zoning = property.zoning;
  const yardReference = site.yardReference;
  if (!zoning || parcelRing.length < 3 || yardReference.status === 'unselected' || yardReference.frontEdgeIndex === null) return [];
  const lat = property.parcel?.center[1] ?? parcelRing[0][1];
  const metresPerLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const metresPerLat = 110540;
  const screen = parcelRing.map(([lng, la]) => [transform.x(lng), transform.y(la)] as [number, number]);
  const cx = screen.reduce((sum, p) => sum + p[0], 0) / screen.length;
  const cy = screen.reduce((sum, p) => sum + p[1], 0) / screen.length;
  const bands: SetbackBand[] = [];
  for (let index = 0; index < parcelRing.length; index++) {
    const a = parcelRing[index];
    const b = parcelRing[(index + 1) % parcelRing.length];
    const realLenM = Math.hypot((b[0] - a[0]) * metresPerLng, (b[1] - a[1]) * metresPerLat);
    if (realLenM < 1) continue;
    const sx = transform.x(a[0]), sy = transform.y(a[1]);
    const ex = transform.x(b[0]), ey = transform.y(b[1]);
    const pxLen = Math.hypot(ex - sx, ey - sy);
    if (pxLen < 1) continue;
    const { label, meters } = classifyEdge(index, yardReference, zoning);
    const off = meters * (pxLen / realLenM);
    // Inward unit normal (flip toward the parcel centroid).
    let nx = -(ey - sy), ny = ex - sx;
    const nlen = Math.hypot(nx, ny) || 1; nx /= nlen; ny /= nlen;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }
    const labelInset = Math.max(18, Math.min(off * 0.6, 30));
    bands.push({
      index,
      bandPoints: `${sx},${sy} ${ex},${ey} ${ex + nx * off},${ey + ny * off} ${sx + nx * off},${sy + ny * off}`,
      guide: [sx + nx * off, sy + ny * off, ex + nx * off, ey + ny * off],
      labelX: mx + nx * labelInset,
      labelY: my + ny * labelInset + 3,
      label: `${label} · ${meters.toFixed(1)} m`,
    });
  }
  return bands;
}
