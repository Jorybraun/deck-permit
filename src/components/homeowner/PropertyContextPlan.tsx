import { MousePointer2 } from 'lucide-react';
import { useMemo } from 'react';
import { edgeLengthMm, openBuildingRing } from '../../domain/siteModel';
import type { SiteModel } from '../../domain/siteModel';
import type { LatLng, Property } from '../../types';

interface PropertyContextPlanProps {
  property: Property;
  site: SiteModel;
  onSelectWall: (buildingId: string, edgeIndex: number) => void;
}

/** Displays municipal parcel/roofline evidence and emits an explicit house-edge selection. */
export function PropertyContextPlan({ property, site, onSelectWall }: PropertyContextPlanProps) {
  const transform = useMemo(() => mapTransform(property), [property]);
  const primary = property.buildings.find((building) => building.primary) || null;
  if (!property.parcel || !transform) return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No municipal parcel geometry is available to draw.</div>;
  const primaryRing = primary ? openBuildingRing(primary) : [];
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-[Manrope] text-lg font-bold text-slate-950">Whole property & house reference</h3><p className="mt-1 text-xs text-slate-600">{primary ? 'Green is the municipal parcel. Click the yard-facing edge of the primary house to establish the deck coordinate wall.' : 'Green is the municipal parcel. No usable municipal house outline was returned, so the house must be measured or supplied from another source.'}</p></div><span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${primary ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}><MousePointer2 size={14} /> {primary ? 'Select a house edge' : 'House outline unavailable'}</span></div>
    <div className="relative h-[390px] bg-[#eef3ef]">
      <svg viewBox="0 0 900 500" className="h-full w-full" role="application" aria-label="Municipal property and house wall selector">
        <defs><pattern id="site-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#d9e2dc" strokeWidth="1" /></pattern></defs>
        <rect width="900" height="500" fill="url(#site-grid)" />
        <polygon points={points(property.parcel.polygon, transform)} fill="#dff0e6" stroke="#167252" strokeWidth="4" />
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
        <text x="840" y="50" textAnchor="middle" fontSize="12" fontWeight="800" fill="#405249">N</text><path d="M840 78V58M834 64l6-8 6 8" fill="none" stroke="#405249" strokeWidth="2" />
        <text x="28" y="36" fontSize="11" fontWeight="800" fill="#176e52">MUNICIPAL PARCEL · {property.parcel.pid}</text>
        {primary && <text x={transform.x(primary.polygon[0][0])} y={transform.y(primary.polygon[0][1]) - 12} fontSize="11" fontWeight="800" fill="#263b31">PRIMARY HOUSE REFERENCE</text>}
      </svg>
      <div className="absolute bottom-3 left-3 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-[10px] leading-4 text-slate-600 shadow-sm"><span className="font-bold text-emerald-800">Parcel:</span> municipal cadastral line<br /><span className="font-bold text-slate-800">House:</span> {primary ? 'municipal footprint reference, not a field survey' : 'not supplied by this data layer'}</div>
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
