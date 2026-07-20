const ARCGIS_ROOT = 'https://services5.arcgis.com/MNn7A6yzK94Hggl3/arcgis/rest/services';
const FLOOD_GEODETIC_THRESHOLD_M = 5.0;

export class SiteContextError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'SiteContextError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Pulls the full site picture for a Sidney parcel from the Town's own ArcGIS layers,
 * so the app can derive dimensions, elevations, and rule-pack triggers from an address
 * instead of asking the homeowner. Every value is municipal reference data, not a survey.
 */
export class SiteContextService {
  constructor(fetchImpl = fetch) {
    this.fetch = fetchImpl;
  }

  async #query(layer, params) {
    const url = new URL(`${ARCGIS_ROOT}/${layer}/FeatureServer/0/query`);
    url.search = new URLSearchParams({ f: 'json', ...params }).toString();
    const response = await this.fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new SiteContextError(502, 'gis-unavailable', `Sidney GIS layer ${layer} is unavailable.`);
    return response.json();
  }

  /** Resolve the parcel polygon (WGS84) for an address, then assemble the site context. */
  async forAddress(address) {
    const street = cleanStreet(address);
    if (!street) throw new SiteContextError(400, 'address-required', 'A street address is required.');
    const parcel = await this.#query('Sync_Enabled_Property_Line_NEW', {
      where: `UPPER(FullAddress) LIKE '%${street}%'`,
      outFields: 'FullAddress,PID,LotAreaSqm,LegalDesc',
      returnGeometry: 'true', outSR: '4326', resultRecordCount: '1',
    });
    const feature = (parcel.features || [])[0];
    if (!feature || !feature.geometry?.rings) throw new SiteContextError(404, 'parcel-not-found', `No Sidney parcel matched "${address}".`);
    return this.forParcel(feature.geometry.rings, feature.attributes);
  }

  async forParcel(rings, attributes = {}) {
    const geometry = JSON.stringify({ rings, spatialReference: { wkid: 4326 } });
    const spatial = { geometry, geometryType: 'esriGeometryPolygon', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };
    const centroid = ringCentroid(rings[0]);
    const point = JSON.stringify({ x: centroid[0], y: centroid[1], spatialReference: { wkid: 4326 } });

    const [zoning, contours, esa, easements, trees, roads, highWater] = await Promise.all([
      this.#query('Sync_Enabled_Zoning_2275', { geometry: point, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'ZoneClass,ZoningDesc', returnGeometry: 'false' }).catch(() => null),
      this.#query('Contour_Line', { ...spatial, outFields: 'ElevIndex', returnGeometry: 'false', resultRecordCount: '500' }).catch(() => null),
      this.#query('Sync_Enabled_Environmentally_Sensitive_Area', { ...spatial, outFields: 'Description', returnGeometry: 'false' }).catch(() => null),
      this.#query('Sync_Enabled_Easements_SRW', { ...spatial, outFields: 'AreaType,PropAreaDesc', returnGeometry: 'false' }).catch(() => null),
      this.#query('Urban_Forest_Inventory_Point_Locations', { ...bufferSpatial(geometry, 8), outFields: 'Name,Category', returnGeometry: 'false' }).catch(() => null),
      this.#query('Sync_Enabled_Road_Centerline', { ...bufferSpatial(geometry, 150), outFields: '*', returnGeometry: 'true', outSR: '4326' }).catch(() => null),
      this.#query('Sync_Enabled_High_Water_Mark', { ...bufferSpatial(geometry, 100), outFields: 'LineName', returnGeometry: 'true', outSR: '4326' }).catch(() => null),
    ]);

    const elevations = (contours?.features || []).map((f) => Number(f.attributes.ElevIndex)).filter((n) => Number.isFinite(n));
    const yards = classifyYards(rings[0], centroid[1], roads?.features);
    const nearestWater = nearestLine(rings[0], centroid[1], highWater?.features);
    const zone = zoning?.features?.[0]?.attributes;

    return {
      schema: 'deck-permit-site-context/v1',
      parcel: {
        address: attributes.FullAddress || null,
        pid: attributes.PID || null,
        legalDescription: attributes.LegalDesc || null,
        lotAreaSqm: Number.isFinite(attributes.LotAreaSqm) ? Math.round(attributes.LotAreaSqm) : null,
      },
      zoning: zone ? { class: zone.ZoneClass, description: zone.ZoningDesc } : null,
      elevation: elevations.length
        ? { minM: Math.min(...elevations), maxM: Math.max(...elevations), source: 'town-contour-lines' }
        : { minM: null, maxM: null, source: 'unavailable' },
      perimeter: { edges: yards.edges, perimeterM: round(yards.edges.reduce((s, e) => s + e.lengthM, 0), 1) },
      road: yards.roadDistanceM != null ? { name: roadName(yards.roadAttrs), distanceM: yards.roadDistanceM } : null,
      // Auto-detected yard orientation from the road — replaces manual front/rear/side selection.
      yards: {
        frontEdgeIndex: yards.frontEdgeIndex,
        rearEdgeIndex: yards.rearEdgeIndex,
        roadName: roadName(yards.roadAttrs),
        note: 'Front = lot edge facing the road; rear = opposite; others are side yards. Derived from municipal road + parcel geometry.',
      },
      environmentallySensitiveArea: Boolean(esa?.features?.length) ? { inEsa: true, names: uniq((esa.features || []).map((f) => f.attributes.Description)) } : { inEsa: false },
      easements: uniq((easements?.features || []).map((f) => f.attributes.AreaType)).map((t) => ({ type: t })),
      protectedTreesNearby: (trees?.features || []).length,
      waterProximity: nearestWater ? { distanceM: nearestWater.distanceM, name: highWater?.features?.[nearestWater.index]?.attributes?.LineName || null } : null,
      // Machine-evaluated rule-pack triggers — the app hides/shows requirements from these.
      triggers: {
        floodFcl: elevations.length ? Math.min(...elevations) < FLOOD_GEODETIC_THRESHOLD_M : false,
        esaSiteServicing: Boolean(esa?.features?.length),
        arborist: (trees?.features || []).length > 0,
        easementOnSitePlan: Boolean(easements?.features?.length),
        nearWater: nearestWater ? nearestWater.distanceM < 30 : false,
      },
    };
  }
}

function cleanStreet(address) {
  if (typeof address !== 'string') return '';
  const m = address.trim().toUpperCase().match(/\d*\s*([A-Z][A-Z\s]+?)(?:\s+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|WAY|PL|PLACE|CRES|LANE|LN|BLVD|CRT|COURT))?\b/);
  const name = (m && m[1] ? m[1] : address).replace(/'/g, "''").trim();
  return name.slice(0, 60);
}

/** ~metres-per-degree at a latitude, for local planar distance math on WGS84 coords. */
function metersPerDegree(lat) {
  const rad = (lat * Math.PI) / 180;
  return { x: 111320 * Math.cos(rad), y: 110540 };
}
function ringCentroid(ring) {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}
/**
 * Classify every parcel edge as front / rear / side by measuring each edge's distance
 * to the nearest road centerline. Closest substantial edge = front (frontage); the
 * substantial edge farthest from the road = rear. This replaces the manual
 * "pick which parcel edge is your front/rear line" dropdowns entirely.
 */
function classifyYards(ring, lat, roadFeatures) {
  const mpd = metersPerDegree(lat);
  const toM = (p) => [p[0] * mpd.x, p[1] * mpd.y];
  const roadSegs = [];
  let roadAttrs = null;
  (roadFeatures || []).forEach((f) => {
    for (const path of f.geometry?.paths || []) { const pts = path.map(toM); for (let k = 0; k < pts.length - 1; k++) roadSegs.push([pts[k], pts[k + 1], f.attributes]); }
  });
  const edges = [];
  const edgeRoadAttrs = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = toM(ring[i]), b = toM(ring[i + 1]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let roadDist = Infinity, attrs = null;
    for (const seg of roadSegs) { const d = pointToSegment(mid, seg[0], seg[1]); if (d < roadDist) { roadDist = d; attrs = seg[2]; } }
    edges.push({ index: i, lengthM: round(len, 1), bearing: round((Math.atan2(dx, dy) * 180) / Math.PI, 0), roadDistanceM: roadSegs.length ? round(roadDist, 1) : null, yard: 'side' });
    edgeRoadAttrs.push(attrs);
  }
  const withRoad = edges.filter((e) => e.roadDistanceM != null);
  let frontEdgeIndex = null, rearEdgeIndex = null, roadDistanceM = null;
  if (withRoad.length) {
    const front = withRoad.reduce((m, e) => (e.roadDistanceM < m.roadDistanceM ? e : m));
    const rear = withRoad.filter((e) => e.lengthM > 3).reduce((m, e) => (e.roadDistanceM > m.roadDistanceM ? e : m), withRoad[0]);
    front.yard = 'front'; if (rear !== front) rear.yard = 'rear';
    frontEdgeIndex = front.index; rearEdgeIndex = rear.index; roadDistanceM = front.roadDistanceM;
    roadAttrs = edgeRoadAttrs[edges.indexOf(front)];
  }
  return { edges, frontEdgeIndex, rearEdgeIndex, roadDistanceM, roadAttrs };
}
function nearestLine(ring, lat, features) {
  if (!features?.length) return null;
  const mpd = metersPerDegree(lat);
  const toM = (p) => [p[0] * mpd.x, p[1] * mpd.y];
  const parcelPts = ring.map(toM);
  let best = Infinity, index = -1;
  features.forEach((f, i) => {
    const paths = f.geometry?.paths || [];
    for (const path of paths) {
      const pts = path.map(toM);
      for (const pp of parcelPts) {
        for (let k = 0; k < pts.length - 1; k++) {
          const d = pointToSegment(pp, pts[k], pts[k + 1]);
          if (d < best) { best = d; index = i; }
        }
      }
    }
  });
  return index >= 0 ? { index, distanceM: round(best, 1) } : null;
}
function pointToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function bufferSpatial(geometry, meters) {
  return { geometry, geometryType: 'esriGeometryPolygon', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: String(meters), units: 'esriSRUnit_Meter' };
}
function roadName(attrs) {
  if (!attrs) return null;
  return attrs.FullName || attrs.RoadName || attrs.StreetName || attrs.STREETNAME || attrs.NAME || attrs.Road_Name || null;
}
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function round(v, d) { const p = 10 ** d; return Math.round(v * p) / p; }
