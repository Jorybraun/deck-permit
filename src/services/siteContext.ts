export interface SiteContext {
  parcel: { address: string | null; pid: string | null; legalDescription: string | null; lotAreaSqm: number | null };
  zoning: { class: string; description: string } | null;
  elevation: { minM: number | null; maxM: number | null; source: string };
  perimeter: { edges: Array<{ lengthM: number; bearing: number }>; perimeterM: number };
  road: { name: string | null; distanceM: number } | null;
  // Road-derived yard orientation. Edge midpoints (WGS84) let the client match front/rear
  // to its own parcel ring by position rather than by a fetch-dependent edge index.
  yards?: { front: { lng: number; lat: number } | null; rear: { lng: number; lat: number } | null; roadName: string | null };
  environmentallySensitiveArea: { inEsa: boolean; names?: string[] };
  easements: Array<{ type: string }>;
  protectedTreesNearby: number;
  waterProximity: { distanceM: number; name: string | null } | null;
  triggers: {
    floodFcl: boolean;
    esaSiteServicing: boolean;
    arborist: boolean;
    easementOnSitePlan: boolean;
    nearWater: boolean;
  };
}

interface SiteContextParcel { polygon: [number, number][]; pid?: string; legalDescription?: string; areaSqm?: number; address?: string | null }

/**
 * Fetch the municipal site context (elevation, distances, yard orientation, triggers).
 * When the caller passes the parcel it already has, the analysis runs on THAT exact outline
 * (POST) — so yard/front detection matches the drawn geometry. Falls back to address lookup.
 */
export async function fetchSiteContext(address: string, parcel?: SiteContextParcel): Promise<SiteContext> {
  const useParcel = parcel && Array.isArray(parcel.polygon) && parcel.polygon.length >= 3;
  const response = useParcel
    ? await fetch('/api/site-context', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rings: [parcel!.polygon], attributes: { FullAddress: parcel!.address || address, PID: parcel!.pid, LegalDesc: parcel!.legalDescription, LotAreaSqm: parcel!.areaSqm } }),
      })
    : await fetch(`/api/site-context?address=${encodeURIComponent(address)}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body && body.message) || 'The site context could not be loaded.');
  return body as SiteContext;
}
