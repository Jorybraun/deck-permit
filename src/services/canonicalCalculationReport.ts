import type { DeckDesign } from '../domain/deckDesign';
import type { FramingDesign, StructuralConnectionGroup } from '../domain/framingDesign';
import { calculateSiteClearances, projectPropertyToLocal, type SiteClearanceAssessment, type SiteModel } from '../domain/siteModel';
import type { Property } from '../types';
import { canonicalPlanFingerprint } from './canonicalPlanSet';

export const CANONICAL_CALCULATION_REPORT_SCHEMA = 'permitly-canonical-calculation-report/v1' as const;

export interface CanonicalCalculationReport {
  schema: typeof CANONICAL_CALCULATION_REPORT_SCHEMA;
  designFingerprint: string;
  generatedAt: string;
  revision: number;
  issuePurpose: 'professional-review';
  status: FramingDesign['status'];
  notForConstruction: true;
  project: { address: string; pid: string; municipality: string; codeProfile: string };
  designBasis: {
    deadLoadKpa: number;
    liveLoadKpa: number;
    snowLoadKpa: number;
    governingAreaLoadKpa: number;
    assumedSoilBearingKpa: number;
    lumber: string;
    treatment: string;
  };
  siteClearance: SiteClearanceAssessment;
  platformSystems: Array<{
    platformId: string;
    name: string;
    elevationMm: number;
    areaSqM: number;
    supportStrategy: string;
    joistAxis: string;
    joistDesignSpanMm: number;
    status: string;
    explanation: string;
  }>;
  joistGroups: Array<{
    platformId: string;
    memberIds: string[];
    section: string;
    spacingMm: number;
    governingSpanMm: number;
    lineLoadKnM: number;
    momentDemandKnM: number;
    shearDemandKn: number;
    status: string;
    ruleId: string;
  }>;
  beams: Array<{
    id: string;
    platformId: string;
    section: string;
    lengthMm: number;
    supportRole: string;
    tributaryWidthMm: number;
    lineLoadKnM: number;
    governingBayMm: number;
    momentDemandKnM: number;
    shearDemandKn: number;
    supportingPostCount: number;
    governingPostReactionKn: number;
    status: string;
    ruleId: string;
  }>;
  postFootingChecks: Array<{
    postId: string;
    footingId: string;
    platformId: string;
    postSection: string;
    postHeightMm: number;
    reactionKn: number;
    requiredBearingAreaSqM: number;
    providedBearingAreaSqM: number;
    bearingPressureKpa: number;
    footingSizeMm: string;
    footingDepth: 'unresolved';
    status: 'review-required';
  }>;
  stairs: Array<{
    id: string;
    from: string;
    to: string;
    widthMm: number;
    riserCount: number;
    riserHeightMm: number;
    treadDepthMm: number;
    totalRunMm: number;
    stringerCount: number;
    connectionIds: string[];
    status: 'review-required';
  }>;
  connections: Array<Pick<StructuralConnectionGroup, 'id' | 'kind' | 'platformId' | 'quantity' | 'designActionKn' | 'actionScope' | 'demandBasis' | 'fromMemberIds' | 'receivingMemberIds' | 'requirements' | 'status'>>;
  checks: FramingDesign['checks'];
  reviewGates: FramingDesign['reviewGates'];
  sources: FramingDesign['sources'];
  limitations: string[];
}

interface CalculationReportInput {
  property: Property;
  site: SiteModel;
  design: DeckDesign;
  framing: FramingDesign;
  revision?: number;
  generatedAt?: string;
}

/** Builds a traceable demand booklet without claiming member or connector capacity. */
export function buildCanonicalCalculationReport(input: CalculationReportInput): CanonicalCalculationReport {
  const { property, design, framing } = input;
  const siteClearance = calculateSiteClearances(projectPropertyToLocal(property, input.site), design);
  const q = framing.assumptions.governingAreaLoadKpa;
  const joistGroups = groupJoists(framing).map((group) => {
    const spanM = group.governingSpanMm / 1000;
    const lineLoad = q * group.spacingMm / 1000;
    return {
      ...group,
      lineLoadKnM: round(lineLoad, 3),
      momentDemandKnM: round(lineLoad * spanM ** 2 / 8, 3),
      shearDemandKn: round(lineLoad * spanM / 2, 3),
    };
  });
  const beams = framing.beams.map((beam) => {
    const posts = framing.posts.filter((post) => post.beamId === beam.id);
    const system = framing.platformSystems.find((candidate) => candidate.platformId === beam.platformId);
    const tributaryWidthMm = (system?.joistDesignSpanMm || 0) / 2;
    const lineLoadKnM = q * tributaryWidthMm / 1000;
    const governingBayMm = maximumBayLength(posts.map((post) => post.pointMm), beam.startMm, beam.endMm);
    const governingBayM = governingBayMm / 1000;
    return {
      id: beam.id, platformId: beam.platformId, section: beam.section, lengthMm: beam.lengthMm, supportRole: beam.supportRole,
      tributaryWidthMm: round(tributaryWidthMm, 0), lineLoadKnM: round(lineLoadKnM, 3), governingBayMm: round(governingBayMm, 0),
      momentDemandKnM: round(lineLoadKnM * governingBayM ** 2 / 8, 3), shearDemandKn: round(lineLoadKnM * governingBayM / 2, 3),
      supportingPostCount: posts.length, governingPostReactionKn: round(maximum(posts.map((post) => post.estimatedReactionKn)), 2), status: beam.status, ruleId: beam.ruleId,
    };
  });
  const postFootingChecks = framing.footings.map((footing) => {
    const post = framing.posts.find((candidate) => candidate.id === footing.postId);
    const providedArea = footing.widthMm / 1000 * (footing.lengthMm / 1000);
    const requiredArea = footing.estimatedReactionKn / framing.assumptions.soilBearingKpa;
    return {
      postId: footing.postId, footingId: footing.id, platformId: footing.platformId,
      postSection: post?.section || 'UNRESOLVED', postHeightMm: post?.heightMm || 0, reactionKn: round(footing.estimatedReactionKn, 2),
      requiredBearingAreaSqM: round(requiredArea, 4), providedBearingAreaSqM: round(providedArea, 4),
      bearingPressureKpa: round(providedArea ? footing.estimatedReactionKn / providedArea : 0, 2), footingSizeMm: `${footing.widthMm} x ${footing.lengthMm}`,
      footingDepth: 'unresolved' as const, status: 'review-required' as const,
    };
  });
  return {
    schema: CANONICAL_CALCULATION_REPORT_SCHEMA,
    designFingerprint: canonicalPlanFingerprint(input),
    generatedAt: input.generatedAt || new Date().toISOString(),
    revision: input.revision || 1,
    issuePurpose: 'professional-review',
    status: framing.status,
    notForConstruction: true,
    project: {
      address: property.address?.fullAddress || 'Address unconfirmed', pid: property.parcel?.pid || 'PID unconfirmed',
      municipality: property.parcel?.municipality || property.address?.locality || 'Jurisdiction unconfirmed', codeProfile: framing.codeProfile.label,
    },
    designBasis: {
      deadLoadKpa: framing.assumptions.deadLoadKpa, liveLoadKpa: framing.assumptions.liveLoadKpa, snowLoadKpa: framing.assumptions.snowLoadKpa,
      governingAreaLoadKpa: q, assumedSoilBearingKpa: framing.assumptions.soilBearingKpa,
      lumber: `${framing.assumptions.lumberSpecies} ${framing.assumptions.lumberGrade}`, treatment: framing.assumptions.treatment,
    },
    siteClearance,
    platformSystems: framing.platformSystems.map((system) => {
      const platform = design.platforms.find((candidate) => candidate.id === system.platformId);
      return {
        platformId: system.platformId, name: platform?.name || system.platformId, elevationMm: platform?.elevationMm || 0,
        areaSqM: round(platform ? polygonArea(platform.boundary.vertices.map((vertex) => [vertex.xMm, vertex.yMm])) / 1_000_000 : 0, 2),
        supportStrategy: system.supportStrategy, joistAxis: system.joistAxis, joistDesignSpanMm: system.joistDesignSpanMm,
        status: system.status, explanation: system.explanation,
      };
    }),
    joistGroups, beams, postFootingChecks,
    stairs: design.stairs.map((stair) => ({
      id: stair.id, from: endpointLabel(stair.from), to: endpointLabel(stair.to), widthMm: stair.widthMm,
      riserCount: stair.riserCount, riserHeightMm: stair.riserHeightMm, treadDepthMm: stair.treadDepthMm, totalRunMm: stair.totalRunMm,
      stringerCount: stair.stringerCount, connectionIds: framing.stairConnections.filter((connection) => connection.stairId === stair.id).map((connection) => connection.id), status: 'review-required',
    })),
    connections: framing.connections.map((connection) => ({
      id: connection.id, kind: connection.kind, platformId: connection.platformId, quantity: connection.quantity,
      designActionKn: connection.designActionKn, actionScope: connection.actionScope, demandBasis: connection.demandBasis,
      fromMemberIds: connection.fromMemberIds, receivingMemberIds: connection.receivingMemberIds,
      requirements: connection.requirements, status: connection.status,
    })),
    checks: framing.checks,
    reviewGates: framing.reviewGates,
    sources: framing.sources,
    limitations: [
      'Demand values are coordination calculations only; member resistance and connector capacity are not established except where an encoded prescriptive table screen is explicitly recorded.',
      'Footing sizing is a bearing-area screen using assumed soil capacity. Depth, frost, concrete, reinforcement, uplift, sliding, utilities, drainage, and settlement remain unresolved.',
      'Ledger substrate, envelope integration, lateral load path, guards, stairs, stringer notching, connections, corrosion compatibility, and proprietary hardware require project-specific professional resolution.',
      'Municipal GIS, homeowner measurements, photographs, and terrain observations remain subject to the evidence status recorded on C1.0.',
      'This report is not authenticated engineering and is not authorization to construct.',
    ],
  };
}

export async function buildCanonicalCalculationPdf(report: CanonicalCalculationReport): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true, putOnlyUsedFonts: true });
  pdf.setProperties({
    title: `${report.project.address} - structural coordination calculation report`,
    subject: `${report.designFingerprint} professional review calculation booklet`,
    author: 'Permitly', creator: 'Permitly canonical calculation exporter',
    keywords: 'deck, structural calculations, professional review, member demands, footing reactions, connection actions',
  });
  const margin = 52; const pageWidth = 612; const pageHeight = 792; const contentWidth = pageWidth - margin * 2; let y = 58;
  const newPage = () => { pdf.addPage('letter', 'portrait'); y = 58; };
  const ensure = (height: number) => { if (y + height > pageHeight - 52) newPage(); };
  const heading = (value: string, size = 15) => { ensure(size + 20); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(size); pdf.setTextColor(23, 35, 29); pdf.text(value, margin, y); y += size + 9; };
  const paragraph = (value: string, size = 9, indent = 0) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size); pdf.setTextColor(55, 67, 61);
    const lines = pdf.splitTextToSize(value, contentWidth - indent); ensure(lines.length * (size + 3) + 5); pdf.text(lines, margin + indent, y); y += lines.length * (size + 3) + 5;
  };
  const keyValue = (label: string, value: string) => { ensure(18); pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(42, 55, 48); pdf.text(label, margin, y); pdf.setFont('helvetica', 'normal'); pdf.text(value, margin + 145, y); y += 17; };
  const rule = () => { ensure(12); pdf.setDrawColor(190, 198, 193); pdf.line(margin, y, pageWidth - margin, y); y += 12; };

  pdf.setFillColor(23, 74, 55); pdf.rect(0, 0, pageWidth, 118, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.text('STRUCTURAL COORDINATION', margin, 48); pdf.text('CALCULATION REPORT', margin, 75);
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.text(`${report.designFingerprint} | Rev ${String(report.revision).padStart(2, '0')} | PROFESSIONAL REVIEW - NOT FOR CONSTRUCTION`, margin, 98);
  y = 150;
  heading(report.project.address, 18); paragraph(`PID ${report.project.pid} | ${report.project.municipality} | ${report.project.codeProfile}`, 10); rule();
  heading('Issue control'); keyValue('Design fingerprint', report.designFingerprint); keyValue('Generated', report.generatedAt); keyValue('Framing status', report.status.replace(/-/g, ' ')); keyValue('Issue purpose', 'Coordinated professional review');
  heading('Design basis');
  keyValue('Area loads', `${report.designBasis.deadLoadKpa.toFixed(2)} kPa dead + max(${report.designBasis.liveLoadKpa.toFixed(2)} live, ${report.designBasis.snowLoadKpa.toFixed(2)} snow) = ${report.designBasis.governingAreaLoadKpa.toFixed(2)} kPa`);
  keyValue('Lumber basis', `${report.designBasis.lumber} | ${report.designBasis.treatment}`); keyValue('Assumed soil bearing', `${report.designBasis.assumedSoilBearingKpa.toFixed(0)} kPa`);
  paragraph('This booklet exposes the generated demand trail and unresolved work. It does not apply a professional seal or convert unknown field conditions into verified facts.', 10);
  heading('Site clearance reference', 12);
  keyValue('Authority', report.siteClearance.authority.replace(/-/g, ' '));
  keyValue('Reference status', report.siteClearance.status.replace(/-/g, ' '));
  keyValue('Closest written offset', report.siteClearance.minimumDistanceMm === null ? 'unavailable' : `${(report.siteClearance.minimumDistanceMm / 1000).toFixed(2)} m`);
  report.siteClearance.dimensions.forEach((dimension) => keyValue(`PL-${dimension.parcelEdgeIndex + 1} / ${dimension.platformId}`, `${(dimension.distanceMm / 1000).toFixed(2)} m municipal GIS reference`));
  paragraph(report.siteClearance.limitation, 8.5);

  newPage(); heading('1. Platform systems', 17);
  report.platformSystems.forEach((system) => { heading(`${system.platformId} - ${system.name}`, 12); keyValue('Geometry', `${system.areaSqM.toFixed(2)} m2 | top EL ${system.elevationMm} mm`); keyValue('Framing topology', `${system.supportStrategy} | joists ${system.joistAxis.toUpperCase()} | design span ${system.joistDesignSpanMm} mm`); keyValue('Screening status', system.status.replace(/-/g, ' ')); paragraph(system.explanation); rule(); });

  heading('2. Joist demand groups', 17);
  report.joistGroups.forEach((group) => { heading(`${group.platformId} - ${group.memberIds.length} joists - ${group.section}`, 11); keyValue('Members', summarizeIds(group.memberIds)); keyValue('Geometry', `${group.spacingMm} mm o.c. | governing span ${group.governingSpanMm} mm`); keyValue('Demand trace', `w = ${group.lineLoadKnM.toFixed(3)} kN/m | M = wL2/8 = ${group.momentDemandKnM.toFixed(3)} kN-m | V = wL/2 = ${group.shearDemandKn.toFixed(3)} kN`); keyValue('Rule / status', `${group.ruleId} | ${group.status.replace(/-/g, ' ')}`); rule(); });

  heading('3. Beam and post reactions', 17);
  report.beams.forEach((beam) => { heading(`${beam.id} - ${beam.section}`, 11); keyValue('Geometry', `${beam.lengthMm} mm | ${beam.supportRole} | ${beam.supportingPostCount} post(s) | governing bay ${beam.governingBayMm} mm`); keyValue('Demand trace', `w = q x ${beam.tributaryWidthMm} mm / 1000 = ${beam.lineLoadKnM.toFixed(3)} kN/m | M = wL2/8 = ${beam.momentDemandKnM.toFixed(3)} kN-m | V = wL/2 = ${beam.shearDemandKn.toFixed(3)} kN`); keyValue('Governing generated reaction', `${beam.governingPostReactionKn.toFixed(2)} kN per post screen`); keyValue('Rule / status', `${beam.ruleId} | ${beam.status.replace(/-/g, ' ')}`); rule(); });

  heading('4. Footing bearing screen', 17);
  report.postFootingChecks.forEach((item) => { heading(`${item.footingId} / ${item.postId}`, 10.5); keyValue('Post', `${item.postSection} | height ${item.postHeightMm} mm | reaction ${item.reactionKn.toFixed(2)} kN`); keyValue('Bearing areas', `required ${item.requiredBearingAreaSqM.toFixed(4)} m2 | provided ${item.providedBearingAreaSqM.toFixed(4)} m2`); keyValue('Provided pressure', `${item.bearingPressureKpa.toFixed(2)} kPa vs assumed ${report.designBasis.assumedSoilBearingKpa.toFixed(0)} kPa`); keyValue('Footing', `${item.footingSizeMm} mm | depth ${item.footingDepth} | ${item.status.replace(/-/g, ' ')}`); rule(); });

  if (report.stairs.length) { heading('5. Stair geometry and support', 17); report.stairs.forEach((stair) => { heading(stair.id, 11); keyValue('Endpoints', `${stair.from} -> ${stair.to}`); keyValue('Geometry', `${stair.widthMm} mm wide | ${stair.riserCount}R @ ${stair.riserHeightMm} | tread ${stair.treadDepthMm} | run ${stair.totalRunMm}`); keyValue('Framing', `${stair.stringerCount} stringers | ${stair.connectionIds.join(', ') || 'connections unresolved'}`); rule(); }); }

  heading('6. Structural connection work packages', 17);
  report.connections.forEach((connection) => { heading(`${connection.id} - ${connection.kind.replace(/-/g, ' ')}`, 10.5); keyValue('Quantity / action', `${connection.quantity} | ${connection.designActionKn === null ? 'action unresolved' : `${connection.designActionKn.toFixed(2)} kN ${connection.actionScope}`}`); keyValue('Member interface', `${summarizeIds(connection.fromMemberIds)} -> ${summarizeIds(connection.receivingMemberIds)}`); paragraph(connection.demandBasis); connection.requirements.forEach((requirement) => paragraph(`- ${requirement}`, 8.5, 10)); rule(); });

  heading('7. Automated checks', 17); report.checks.forEach((check) => { heading(`${check.status.toUpperCase()} - ${check.title}`, 10.5); paragraph(check.result); paragraph(`Basis: ${check.basis}`, 8.5); rule(); });
  heading('8. Professional review gates', 17); report.reviewGates.forEach((gate) => { heading(`${gate.status.toUpperCase()} - ${gate.title}`, 10.5); paragraph(`${gate.discipline}: ${gate.reason}`); rule(); });
  heading('9. Sources and scope', 17); report.sources.forEach((source) => { heading(source.title, 10.5); paragraph(`${source.edition} | ${source.scope}`); paragraph(source.url, 8); source.exclusions.forEach((item) => paragraph(`- Excluded: ${item}`, 8.5, 10)); rule(); });
  heading('10. Limitations', 17); report.limitations.forEach((item) => paragraph(`- ${item}`, 9, 10));

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page); pdf.setDrawColor(190, 198, 193); pdf.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(85, 95, 89);
    pdf.text(`${report.designFingerprint} | PROFESSIONAL REVIEW - NOT FOR CONSTRUCTION`, margin, pageHeight - 22);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 22, { align: 'right' });
  }
  const blob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
  if (blob.size < 1_000) throw new Error('The generated calculation PDF is empty or invalid.');
  return blob;
}

export async function downloadCanonicalCalculationPdf(report: CanonicalCalculationReport): Promise<void> {
  const blob = await buildCanonicalCalculationPdf(report);
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `permitly-calculation-report-${report.designFingerprint.toLowerCase()}.pdf`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function groupJoists(framing: FramingDesign): Array<Omit<CanonicalCalculationReport['joistGroups'][number], 'lineLoadKnM' | 'momentDemandKnM' | 'shearDemandKn'>> {
  const groups = new Map<string, FramingDesign['joists']>();
  framing.joists.forEach((joist) => {
    const key = [joist.platformId, joist.section, joist.spacingMm, joist.status, joist.ruleId].join('|');
    groups.set(key, [...(groups.get(key) || []), joist]);
  });
  return [...groups.values()].map((members) => ({
    platformId: members[0].platformId, memberIds: members.map((member) => member.id), section: members[0].section,
    spacingMm: members[0].spacingMm, governingSpanMm: maximum(members.map((member) => member.spanMm)),
    status: members[0].status, ruleId: members[0].ruleId,
  }));
}

function endpointLabel(endpoint: DeckDesign['stairs'][number]['from']): string { return endpoint.kind === 'platform' ? endpoint.platformId : `GRADE EL ${endpoint.elevationMm}`; }
function summarizeIds(ids: string[]): string { return ids.length ? ids.length <= 4 ? ids.join(', ') : `${ids.slice(0, 3).join(', ')} +${ids.length - 3}` : 'UNRESOLVED'; }
function maximum(values: number[]): number { return values.length ? Math.max(...values) : 0; }
function maximumBayLength(points: Array<readonly [number, number]>, start: readonly [number, number], end: readonly [number, number]): number {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (points.length < 2 || length === 0) return length;
  const ux = (end[0] - start[0]) / length; const uy = (end[1] - start[1]) / length;
  const stations = points.map((point) => (point[0] - start[0]) * ux + (point[1] - start[1]) * uy).sort((a, b) => a - b);
  return maximum(stations.slice(1).map((station, index) => station - stations[index]));
}
function polygonArea(points: Array<readonly [number, number]>): number { return Math.abs(points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0) / 2); }
function round(value: number, digits: number): number { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
