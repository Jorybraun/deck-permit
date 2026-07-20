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

/** Fetch the municipal site context (elevation, distances, triggers) for an address. */
export async function fetchSiteContext(address: string): Promise<SiteContext> {
  const response = await fetch(`/api/site-context?address=${encodeURIComponent(address)}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body && body.message) || 'The site context could not be loaded.');
  return body as SiteContext;
}
