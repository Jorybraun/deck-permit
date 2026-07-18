import type { PointMm } from '../deckDesign';
import type {
  BeamMember,
  FootingMember,
  FramingAssumptions,
  GuardAssembly,
  JoistMember,
  LedgerMember,
  PostMember,
  StairConnection,
  StairStringerMember,
  StructuralConnectionGroup,
} from './types';

interface GenerateStructuralConnectionsInput {
  assumptions: FramingAssumptions;
  joists: JoistMember[];
  beams: BeamMember[];
  ledgers: LedgerMember[];
  posts: PostMember[];
  footings: FootingMember[];
  guards: GuardAssembly[];
  stairStringers: StairStringerMember[];
  stairConnections: StairConnection[];
}

/**
 * Creates keyed connection work packages from the same member graph used by S2.0.
 * Actions are coordination demands, never connector capacity claims. Hardware and
 * fastening remain deliberately unresolved until a qualified reviewer selects them.
 */
export function generateStructuralConnections(input: GenerateStructuralConnectionsInput): StructuralConnectionGroup[] {
  const platformIds = unique([
    ...input.joists.map((member) => member.platformId),
    ...input.beams.map((member) => member.platformId),
    ...input.ledgers.map((member) => member.platformId),
    ...input.posts.map((member) => member.platformId),
    ...input.guards.map((member) => member.platformId),
  ]);
  const groups: StructuralConnectionGroup[] = [];

  platformIds.forEach((platformId) => {
    const joists = input.joists.filter((member) => member.platformId === platformId);
    const beams = input.beams.filter((member) => member.platformId === platformId);
    const ledgers = input.ledgers.filter((member) => member.platformId === platformId);
    const posts = input.posts.filter((member) => member.platformId === platformId);
    const footings = input.footings.filter((member) => member.platformId === platformId);
    const guards = input.guards.filter((member) => member.platformId === platformId);
    const joistReactionKn = maximum(joists.map((member) => joistEndReactionKn(member, input.assumptions.governingAreaLoadKpa)));

    if (ledgers.length) {
      groups.push(group({
        id: `${platformId}-C1`, kind: 'ledger-to-house', platformId, pointMm: midpoint(ledgers[0].startMm, ledgers[0].endMm),
        quantity: ledgers.length, fromMemberIds: ledgers.map((member) => member.id), receivingMemberIds: ['EXISTING-HOUSE'],
        designActionKn: round(joistReactionKn * joists.length, 2), actionScope: 'group',
        demandBasis: 'Sum of coordinated joist-end gravity reactions; lateral and uplift actions remain unresolved.',
        requirements: ['Confirm rim/band substrate and load path', 'Design fastener group, spacing, edge distances, lateral ties, and flashing', 'Select corrosion-compatible proprietary hardware where applicable'],
      }));
      groups.push(group({
        id: `${platformId}-C2`, kind: 'joist-to-ledger', platformId, pointMm: offset(midpoint(ledgers[0].startMm, ledgers[0].endMm), 0, 180),
        quantity: joists.length, fromMemberIds: joists.map((member) => member.id), receivingMemberIds: ledgers.map((member) => member.id),
        designActionKn: joistReactionKn, actionScope: 'each', demandBasis: 'Maximum simple-span joist end reaction from the generated gravity load basis.',
        requirements: ['Select joist hanger or reviewed bearing detail', 'Specify nails/screws, installation pattern, and corrosion class', 'Verify end distance, ledger depth, and wet-service compatibility'],
      }));
    }

    if (beams.length && joists.length) groups.push(group({
      id: `${platformId}-C${groupsForPlatform(groups, platformId) + 1}`, kind: 'joist-to-beam', platformId, pointMm: midpoint(beams[0].startMm, beams[0].endMm),
      quantity: joists.length * beams.length, fromMemberIds: joists.map((member) => member.id), receivingMemberIds: beams.map((member) => member.id),
      designActionKn: joistReactionKn, actionScope: 'each', demandBasis: 'Maximum coordinated joist support reaction at a generated beam line.',
      requirements: ['Resolve bearing versus hanger topology', 'Specify toe-nailing, clips, blocking, and uplift restraint', 'Coordinate beam ply, joist end, and decking edge conditions'],
    }));

    if (posts.length) groups.push(group({
      id: `${platformId}-C${groupsForPlatform(groups, platformId) + 1}`, kind: 'beam-to-post', platformId, pointMm: posts[0].pointMm,
      quantity: posts.length, fromMemberIds: unique(posts.map((member) => member.beamId)), receivingMemberIds: posts.map((member) => member.id),
      designActionKn: maximum(posts.map((member) => member.estimatedReactionKn)), actionScope: 'each', demandBasis: 'Maximum generated post reaction; eccentricity, uplift, and lateral actions are not included.',
      requirements: ['Select post cap with verified beam bearing and ply restraint', 'Design fasteners for gravity, uplift, and lateral actions', 'Resolve splices and prohibit unsupported field joints'],
    }));

    if (footings.length) groups.push(group({
      id: `${platformId}-C${groupsForPlatform(groups, platformId) + 1}`, kind: 'post-to-footing', platformId, pointMm: footings[footings.length - 1].centerMm,
      quantity: footings.length, fromMemberIds: posts.map((member) => member.id), receivingMemberIds: footings.map((member) => member.id),
      designActionKn: maximum(footings.map((member) => member.estimatedReactionKn)), actionScope: 'each', demandBasis: 'Maximum bearing-only footing reaction from the generated gravity layout.',
      requirements: ['Select standoff post base and concrete anchor', 'Design uplift, lateral, edge distance, embedment, and corrosion resistance', 'Coordinate reinforcement, frost depth, drainage, and concrete cover'],
    }));

    if (guards.length) groups.push(group({
      id: `${platformId}-C${groupsForPlatform(groups, platformId) + 1}`, kind: 'guard-to-frame', platformId, pointMm: midpoint(guards[0].startMm, guards[0].endMm),
      quantity: guards.length, fromMemberIds: guards.map((member) => member.id), receivingMemberIds: unique([...joists.map((member) => member.id), ...beams.map((member) => member.id)]),
      designActionKn: null, actionScope: 'unresolved', demandBasis: 'Guard line and point loads require code/product-specific design; no capacity is claimed by the generator.',
      requirements: ['Select tested or engineered guard system', 'Design post anchorage, blocking, hold-downs, and rim reinforcement', 'Verify height, openings, climbability, and exterior durability'],
    }));
  });

  input.stairConnections.forEach((connection) => {
    const stringers = input.stairStringers.filter((member) => member.stairId === connection.stairId);
    groups.push(group({
      id: `${connection.id}-CG`, kind: 'stair-to-support', platformId: connection.platformId, pointMm: connection.pointMm,
      quantity: Math.max(1, stringers.length), fromMemberIds: stringers.map((member) => member.id), receivingMemberIds: connection.receivingMemberIds,
      designActionKn: null, actionScope: 'unresolved', demandBasis: 'Stringer reactions require project-specific stair loading, notching, species, span, and support design.',
      requirements: connection.requirements,
    }));
  });
  return groups;
}

function group(input: Omit<StructuralConnectionGroup, 'hardware' | 'status'>): StructuralConnectionGroup {
  return {
    ...input,
    hardware: { product: null, fastenerSchedule: null, corrosionClass: null },
    status: 'design-required',
  };
}

function joistEndReactionKn(member: JoistMember, areaLoadKpa: number): number {
  return round(areaLoadKpa * (member.spacingMm / 1000) * (member.spanMm / 1000) / 2, 2);
}

function groupsForPlatform(groups: StructuralConnectionGroup[], platformId: string): number {
  return groups.filter((candidate) => candidate.platformId === platformId).length;
}

function midpoint(first: PointMm, second: PointMm): PointMm { return [Math.round((first[0] + second[0]) / 2), Math.round((first[1] + second[1]) / 2)]; }
function offset(point: PointMm, x: number, y: number): PointMm { return [point[0] + x, point[1] + y]; }
function maximum(values: number[]): number { return values.length ? Math.max(...values) : 0; }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function round(value: number, digits: number): number { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
