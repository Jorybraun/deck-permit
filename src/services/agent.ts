import { callCerebras } from './aiProvider';
import { lookupProperty } from './propertyLookup';
import { lookupZoning, computeBuildableEnvelope, lookupSnowLoad } from './zoning';
import { createDeck, rebuildDeck } from './deckSizing';
import { createDefaultSitePlacement } from './sitePlacement';
import { assessDeckLayout, layoutSummary, normalizeDeckLayout } from './deckLayout';
import { runComplianceCheck } from './compliance';
import { webSearch, fetchWebpage, researchTopic, researchPermitRequirements } from './research';
import { allSkills } from '../playbooks';
import { useStore } from '../state/store';
import type { Deck, DeckShape, DeckSitePlacement } from '../types';

export interface AgentAction {
  label: string;
  value: string;
}

export interface AgentMessage {
  role: 'user' | 'agent' | 'tool' | 'thought';
  content: string;
  toolName?: string;
  actions?: AgentAction[];
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

interface ToolDef {
  name: string;
  description: string;
  args: Record<string, { type: string; description: string; required?: boolean }>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'lookup_property',
    description: 'Geocode an address and fetch the parcel, municipal zoning attributes, building rooflines, and evidence sources. Call this first when the user gives an address.',
    args: { address: { type: 'string', description: 'Full street address in BC', required: true } },
  },
  {
    name: 'create_deck',
    description: 'Create or replace the deck footprint and auto-size all structural members per CWC span tables and BCBC Part 9. Call after a property is loaded.',
    args: {
      shape: { type: 'string', description: 'rectangle | l-shape | wraparound', required: true },
      width_m: { type: 'number', description: 'Deck width in meters', required: true },
      depth_m: { type: 'number', description: 'Deck depth in meters', required: true },
      height_mm: { type: 'number', description: 'Height above grade in mm', required: true },
      attached: { type: 'boolean', description: 'Attached to house or freestanding. Default true.' },
      house_wall: { type: 'string', description: 'north | south | east | west. Default south.' },
      material: { type: 'string', description: 'Decking material or finish (optional).' },
      stairs: { type: 'boolean', description: 'Whether stairs are included (optional).' },
    },
  },
  {
    name: 'set_decking',
    description: 'Change the current deck finish without changing its geometry.',
    args: { material: { type: 'string', description: 'Decking material', required: true } },
  },
  {
    name: 'adjust_deck',
    description: 'Modify the existing deck without recreating it. Use to tweak dimensions or height.',
    args: {
      width_m: { type: 'number', description: 'New width in meters (optional)' },
      depth_m: { type: 'number', description: 'New depth in meters (optional)' },
      height_mm: { type: 'number', description: 'New height above grade in mm (optional)' },
      shape: { type: 'string', description: 'New shape (optional)' },
    },
  },
  {
    name: 'set_site_placement',
    description: 'Move the deck along a selected house wall using explicit metric offsets. Use when the user asks where the deck sits relative to the house or gives a field measurement.',
    args: {
      house_wall: { type: 'string', description: 'north | south | east | west' },
      wall_start_offset_m: { type: 'number', description: 'Distance in metres from the start of the selected wall to the near deck edge', required: true },
      house_gap_m: { type: 'number', description: 'Clear gap from house for a detached deck; attached decks use zero' },
      recorded_by: { type: 'string', description: 'Person or company who measured the offset' },
      recorded_at: { type: 'string', description: 'Measurement date in YYYY-MM-DD format' },
      notes: { type: 'string', description: 'Reference corner, measurement method, or obstructions' },
    },
  },
  {
    name: 'set_framing_layout',
    description: 'Set exact local construction coordinates for beam lines, post/footing stations, and stair location. Coordinates use metres from the house-side left deck corner.',
    args: {
      beam_offsets_m: { type: 'array', description: 'Beam offsets in metres from the house side, increasing outward' },
      post_stations_m: { type: 'array', description: 'Post and footing stations in metres from the left deck edge' },
      stair_edge: { type: 'string', description: 'north | south | east | west' },
      stair_offset_m: { type: 'number', description: 'Stair offset along its selected edge' },
      landing_depth_m: { type: 'number', description: 'Bottom landing depth' },
    },
  },
  {
    name: 'set_guard',
    description: 'Override the guard configuration. Use when compliance flags a guard issue.',
    args: {
      enabled: { type: 'boolean', description: 'Whether guard is present' },
      height_mm: { type: 'number', description: 'Guard height in mm (BCBC min 1070mm)' },
      material: { type: 'string', description: 'wood | metal | glass | cable' },
    },
  },
  {
    name: 'set_stairs',
    description: 'Configure stair location and dimensions.',
    args: {
      edge: { type: 'string', description: 'north | south | east | west' },
      width_m: { type: 'number', description: 'Stair width in meters (min 860mm)' },
      riser_mm: { type: 'number', description: 'Riser height in mm (125-200mm)' },
      tread_mm: { type: 'number', description: 'Tread depth in mm (255-355mm)' },
    },
  },
  {
    name: 'run_compliance',
    description: 'Run the full compliance check (BCBC 9.8/9.12/9.15/9.17 + Sidney setbacks) and report all errors and warnings.',
    args: {},
  },
  {
    name: 'get_compliance_issues',
    description: 'List current compliance issues with full details. Use before generating plans or when user asks what issues remain.',
    args: {},
  },
  {
    name: 'fix_issue',
    description: 'Auto-fix a specific compliance issue by ID. Call get_compliance_issues first to learn IDs.',
    args: { issue_id: { type: 'string', description: 'The compliance issue ID to fix', required: true } },
  },
  {
    name: 'estimate_cost',
    description: 'Generate a rough material + labor cost estimate for the current deck.',
    args: {},
  },
  {
    name: 'generate_plan_set',
    description: 'Produce the 5-sheet permit plan set as SVG. Call after compliance passes.',
    args: {},
  },
  {
    name: 'reset_session',
    description: 'Clear all state and start over.',
    args: {},
  },
  {
    name: 'research',
    description: 'Research a building code or permit topic using AI knowledge of BC Building Code, local bylaws, and CWC standards. Use when the user asks about code requirements, setback rules, or permit processes.',
    args: {
      topic: { type: 'string', description: 'The topic to research, e.g. "deck guard requirements" or "setback rules for corner lots"', required: true },
      jurisdiction: { type: 'string', description: 'Municipality name, e.g. "Sidney", "Victoria", "Saanich". Default "Sidney".' },
    },
  },
  {
    name: 'research_permit_requirements',
    description: 'Look up what forms, drawings, fees, and process steps are required to submit a permit application in a specific BC municipality. Use when the user asks "what do I need to submit?" or "how do I apply?"',
    args: {
      municipality: { type: 'string', description: 'Municipality name, e.g. "Sidney"', required: true },
      project_type: { type: 'string', description: 'Type of project, e.g. "residential deck". Default "residential deck".' },
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information using DuckDuckGo. Use for looking up official municipality websites, permit portals, fee schedules, or recent bylaw changes.',
    args: {
      query: { type: 'string', description: 'Search query', required: true },
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch the text content of a webpage. Use after web_search to read a specific page like a municipal permit portal or bylaw PDF.',
    args: {
      url: { type: 'string', description: 'The URL to fetch', required: true },
    },
  },
];

function toolsAsText(): string {
  return TOOLS.map((t) => {
    const argsStr = Object.entries(t.args)
      .map(([k, v]) => `  ${k}: ${v.type}${v.required ? ' (required)' : ''} - ${v.description}`)
      .join('\n');
    return `- ${t.name}: ${t.description}\n  args:\n${argsStr}`;
  }).join('\n\n');
}

const SYSTEM_PROMPT = `You are a deck permit co-pilot for homeowners. You guide the user from "I want a deck" to a permit-ready plan set using a ReAct (Reason + Act) loop.

# Your role
- Be proactive, concise, and concrete. One question at a time.
- You are the expert. The user is a homeowner who does not know building code or local bylaws.
- Translate natural language ("12x16 cedar deck 2 feet up") into tool calls.
- When you have enough info to act, act. Do not ask permission to call a tool.
- After each action, tell the user what happened in plain English and suggest next steps as action buttons.
- You do NOT have hardcoded knowledge of any specific jurisdiction's rules. ALWAYS use the research tools to look up permit requirements, setbacks, code rules, and fees for the user's specific location.
- The user does not know what questions to ask. It is YOUR job to proactively tell them everything that applies — all bylaws, all requirements, all fees, all restrictions. Do not wait for them to ask.

# Mandatory flow
1. User gives address -> call lookup_property -> IMMEDIATELY call research_permit_requirements and web_search for the municipality's bylaws -> present a COMPLETE requirements report (setbacks, permit triggers, guards, stairs, structure, fees, submission, special rules) -> THEN ask about their deck design.
2. User describes deck -> call create_deck -> call run_compliance -> report results.
3. Compliance passes -> call generate_plan_set -> guide submission.
NEVER skip the research step. NEVER design a deck before the user has seen the requirements.

# ReAct format
For every turn, think step-by-step. Output your reasoning in a <thought> block, then either respond to the user or call a tool.

Format:
<thought>
What do I know? What do I need? Which tool, if any? What will I tell the user?
</thought>

(optional natural language before the tool call explaining what you are doing)

OR a direct response to the user, followed by:
<actions>[{"label": "...", "value": "..."}]</actions>

# Tools
${toolsAsText()}

# Critical rules
- NEVER assume setback distances, height limits, fees, or permit processes. Research them for the user's jurisdiction.
- After loading a property, call research_permit_requirements for that municipality before designing or checking compliance.
- When the user asks "what are the rules?" or "do I need a permit?", call research or research_permit_requirements with their location.
- Use web_search + fetch_url for official municipal websites and current fee schedules.
- Share research findings in plain English with code references.

# Unit conversion
- 1 foot = 304.8mm. "12x16" usually means 12ft x 16ft = 3.66m x 4.88m.
- "2 feet high" = 610mm.

# Action button guidance
Always end with 1-3 action buttons. Examples:
- After loading property: [{"label":"Research permit rules","value":"what are the permit requirements for a deck here?"},{"label":"12x16 cedar deck","value":"I want a 12 by 16 cedar deck 2 feet high"}]
- After compliance errors: [{"label":"Fix all issues","value":"fix all compliance issues"},{"label":"Explain errors","value":"explain the compliance errors"}]
- After plans ready: [{"label":"Export plans","value":"export the permit plans"},{"label":"How do I submit?","value":"how do I submit my permit application?"},{"label":"Start over","value":"start over"}]

# Skills
Follow the skill for each task. Each skill defines when to use it, the process to follow, what to avoid, and what action buttons to suggest.

${allSkills()}

# Session state
Current state is injected after this prompt. Use it - don't re-ask for info you already have.
`;

function stateSummary(): string {
  const state = useStore.getState();
  const p = state.property;
  const d = state.deck;

  const lines: string[] = ['CURRENT SESSION STATE:'];

  if (p.address) {
    lines.push(`- Address: ${p.address.fullAddress}`);
    lines.push(`- Municipality: ${p.address.locality}`);
    lines.push(`- PID: ${p.parcel?.pid || 'unknown'}`);
    lines.push(`- Zone: ${p.zoning?.zone || 'unknown'}`);
    lines.push(`- Lot area: ${p.parcel?.areaSqm.toFixed(0) || 'unknown'} m2`);
    lines.push(`- Snow load: ${p.snowLoad} kPa`);
  } else {
    lines.push('- No property loaded yet.');
  }

  if (d) {
    lines.push(`- Deck: shape=${d.footprint.shape}, area=${d.area.toFixed(1)} m2, height=${(d.footprint.heightAboveGrade * 1000).toFixed(0)}mm`);
    lines.push(`- Structure: ${d.structure.joistSize} joists @ ${d.structure.joistSpacing}mm, ${d.structure.beamSize} beam, ${d.structure.postSize} posts @ ${d.structure.postSpacing}m`);
    lines.push(`- Guard: ${d.guard.enabled ? `${d.guard.height}mm ${d.guard.material}` : 'none'}`);
    lines.push(`- Stairs: ${d.stairs.enabled ? `${d.stairs.numRisers} risers @ ${d.stairs.riserHeight}mm on ${d.stairs.edge}` : 'none'}`);
    if (d.sitePlacement) lines.push(`- Placement: ${d.sitePlacement.wallStartOffsetM.toFixed(3)}m from ${d.footprint.houseWall} wall start; ${d.sitePlacement.outwardGapM.toFixed(3)}m house gap; ${d.sitePlacement.status}`);
    lines.push(`- Construction coordinates: ${layoutSummary(d)}`);
  } else {
    lines.push('- No deck designed yet.');
  }

  const errors = state.compliance.filter((i) => i.severity === 'error' && !i.resolved);
  const warnings = state.compliance.filter((i) => i.severity === 'warning' && !i.resolved);
  if (state.compliance.length > 0) {
    lines.push(`- Compliance: ${errors.length} error(s), ${warnings.length} warning(s)`);
    if (errors.length > 0) {
      lines.push(`  Errors: ${errors.map((e) => `[${e.id}] ${e.message} (${e.codeRef})`).join('; ')}`);
    }
  }

  if (state.planset) lines.push('- Plan set: generated');

  return lines.join('\n');
}

export async function runAgentTurn(
  userMessage: string,
  history: AgentMessage[],
  apiKey: string
): Promise<{ response: string; toolCalls?: ToolCall[]; actions?: AgentAction[]; thought?: string }> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'system' as const, content: stateSummary() },
    ...history.filter((m) => m.role !== 'tool' && m.role !== 'thought').map((m) => ({ role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const { text, error } = await callCerebras(messages, apiKey);
  if (error) return { response: `AI error: ${error}` };

  const thought = parseThought(text);
  const toolCalls = parseToolCalls(text);
  const actions = parseActions(text);
  const cleanResponse = stripBlocks(text);

  if (toolCalls.length > 0) {
    return { response: cleanResponse, toolCalls, actions, thought };
  }

  return { response: cleanResponse, actions, thought };
}

function parseThought(text: string): string | undefined {
  const regex = /<thought>([\s\S]*?)<\/thought>/;
  const match = regex.exec(text);
  return match ? match[1].trim() : undefined;
}

function stripBlocks(text: string): string {
  return text
    .replace(/<thought>[\s\S]*?<\/thought>/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<actions>[\s\S]*?<\/actions>/g, '')
    .trim();
}

function parseActions(text: string): AgentAction[] | undefined {
  const regex = /<actions>([\s\S]*?)<\/actions>/;
  const match = regex.exec(text);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[1]) as AgentAction[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseToolCalls(text: string): ToolCall[] {
  const regex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  const calls: ToolCall[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as ToolCall;
      calls.push(parsed);
    } catch {
      // ignore malformed tool calls
    }
  }
  return calls;
}

export async function executeTool(call: ToolCall): Promise<string> {
  const store = useStore.getState();

  try {
    switch (call.tool) {
      case 'lookup_property': {
        const address = String(call.args.address || '');
        if (!address) return 'No address provided.';

        const { address: addr, parcel, buildings, evidence } = await lookupProperty(address);
        const zoning = lookupZoning(parcel);
        const envelope = computeBuildableEnvelope(parcel, zoning);
        const snowLoad = lookupSnowLoad(addr.coordinates[1], addr.coordinates[0]);

        store.setProperty({
          address: addr,
          parcel,
          zoning,
          buildableEnvelope: envelope,
          snowLoad,
          buildings,
          evidence,
        });

        return `Found ${addr.fullAddress} (PID ${parcel.pid}, ${parcel.areaSqm.toFixed(0)} m², zone ${zoning.zone}).`;
      }

      case 'create_deck': {
        const propertyState = store.property;
        if (!propertyState.parcel) return 'Load a property first.';

        const shape = String(call.args.shape || 'rectangle') as DeckShape;
        const width = Number(call.args.width_m || 4.0);
        const depth = Number(call.args.depth_m || 3.0);
        const height = Number(call.args.height_mm || 600) / 1000;

        const attached = call.args.attached !== false;
        const requestedWall = String(call.args.house_wall || 'south');
        const houseWall = (['north', 'south', 'east', 'west'].includes(requestedWall) ? requestedWall : 'south') as 'north' | 'south' | 'east' | 'west';
        const deck = createDeck(shape, propertyState.parcel, depth, width, height, attached, houseWall, propertyState.snowLoad, propertyState.buildings.find((building) => building.primary));
        const material = typeof call.args.material === 'string' ? call.args.material : '';
        if (material) deck.structure.deckingMaterial = material;
        if (call.args.stairs === false) deck.stairs.enabled = false;
        if (call.args.stairs === true && height > 0.15) deck.stairs.enabled = true;
        store.setDeck(deck);
        store.setCompliance(runComplianceCheck(deck, store.property));

        return `Created ${deck.footprint.shape} deck (${deck.dimensions.width.toFixed(2)} × ${deck.dimensions.depth.toFixed(2)} m, ${deck.area.toFixed(1)} m², ${(deck.footprint.heightAboveGrade * 1000).toFixed(0)}mm high) with ${deck.structure.deckingMaterial}. Sizing: ${deck.structure.joistSize} joists @ ${deck.structure.joistSpacing}mm, ${deck.structure.beamSize} beam, ${deck.structure.postSize} posts.`;
      }

      case 'run_compliance': {
        const { deck, property } = store;
        if (!deck) return 'No deck to check.';

        const issues = runComplianceCheck(deck, property);
        store.setCompliance(issues);

        const errors = issues.filter((i) => i.severity === 'error' && !i.resolved);
        const warnings = issues.filter((i) => i.severity === 'warning' && !i.resolved);
        return `Compliance check complete. ${errors.length} error(s), ${warnings.length} warning(s).`;
      }

      case 'generate_plan_set': {
        const { property, deck } = store;
        if (!deck || !property.parcel) return 'Design a deck first.';

        const permitPackage = store.issueDrawingPackage();
        if (!permitPackage) return 'The drawing package could not be issued.';
        const sheets = permitPackage.sheets;

        return `Issued ${sheets.length} coordinated sheets as Rev ${permitPackage.manifest.revision} (${permitPackage.manifest.designFingerprint}): ${sheets.map((s) => s.title).join(', ')}. ${permitPackage.readiness.summary}`;
      }

      case 'research': {
        const topic = String(call.args.topic || '');
        const jurisdiction = String(call.args.jurisdiction || store.property.address?.locality || 'unknown');
        if (!topic) return 'No topic provided.';

        const result = await researchTopic(topic, jurisdiction, import.meta.env.VITE_CEREBRAS_API_KEY || '');
        return result.summary;
      }

      case 'research_permit_requirements': {
        const municipality = String(call.args.municipality || store.property.address?.locality || '');
        if (!municipality) return 'No municipality provided.';

        const projectType = String(call.args.project_type || 'residential deck');
        const result = await researchPermitRequirements(municipality, projectType, import.meta.env.VITE_CEREBRAS_API_KEY || '');
        return result.summary;
      }

      case 'web_search': {
        const query = String(call.args.query || '');
        if (!query) return 'No query provided.';

        const result = await webSearch(query);
        const sources = result.sources.map((s) => `- ${s.title}: ${s.url}`).join('\n');
        return `${result.summary}\n\nSources:\n${sources}`;
      }

      case 'fetch_url': {
        const url = String(call.args.url || '');
        if (!url) return 'No URL provided.';

        const text = await fetchWebpage(url);
        return text.slice(0, 2000);
      }

      case 'get_compliance_issues': {
        const issues = store.compliance;
        if (issues.length === 0) return 'No compliance issues. Run compliance check first.';
        return issues.map((i) => `[${i.id}] ${i.severity}: ${i.message} (${i.codeRef})${i.fix ? ' Fix: ' + i.fix : ''}`).join('\n');
      }

      case 'fix_issue': {
        const issueId = String(call.args.issue_id || '');
        const issue = store.compliance.find((i) => i.id === issueId);
        if (!issue) return `Issue ${issueId} not found.`;
        store.resolveIssue(issueId);
        return `Resolved issue ${issueId}: ${issue.message}`;
      }

      case 'estimate_cost': {
        const deck = store.deck;
        if (!deck) return 'No deck to estimate.';
        const area = deck.area;
        const costPerSqm = 350;
        const total = area * costPerSqm;
        return `Rough estimate: $${total.toFixed(0)} CAD ($${costPerSqm}/sqm for ${area.toFixed(1)} sqm). This is a ballpark - get quotes from contractors.`;
      }

      case 'adjust_deck': {
        const currentDeck = store.deck;
        const propertyState = store.property;
        if (!currentDeck || !propertyState.parcel) return 'No deck to adjust.';

        const shape = String(call.args.shape || currentDeck.footprint.shape) as DeckShape;
        const width = call.args.width_m !== undefined ? Number(call.args.width_m) : currentDeck.dimensions.width;
        const depth = call.args.depth_m !== undefined ? Number(call.args.depth_m) : currentDeck.dimensions.depth;
        const height = call.args.height_mm !== undefined ? Number(call.args.height_mm) / 1000 : currentDeck.footprint.heightAboveGrade;

        const newDeck = rebuildDeck(currentDeck, propertyState, { shape, width, depth, heightAboveGrade: height });
        store.setDeck(newDeck);
        store.setCompliance(runComplianceCheck(newDeck, store.property));
        return `Updated deck: ${newDeck.area.toFixed(1)} sqm, ${(newDeck.footprint.heightAboveGrade * 1000).toFixed(0)}mm high.`;
      }

      case 'set_site_placement': {
        const currentDeck = store.deck;
        const propertyState = store.property;
        if (!currentDeck || !propertyState.parcel) return 'No deck to place.';
        const requestedWall = String(call.args.house_wall || currentDeck.footprint.houseWall).toLowerCase();
        if (!['north', 'south', 'east', 'west'].includes(requestedWall)) return 'House wall must be north, south, east, or west.';
        const wallStartOffsetM = Number(call.args.wall_start_offset_m);
        if (!Number.isFinite(wallStartOffsetM) || wallStartOffsetM < 0) return 'Wall-start offset must be a non-negative number in metres.';
        const recordedBy = String(call.args.recorded_by || '').trim();
        const recordedAt = String(call.args.recorded_at || '').trim();
        const hasFieldRecord = Boolean(recordedBy || recordedAt);
        const wall = requestedWall as Deck['footprint']['houseWall'];
        const wallDeck = wall === currentDeck.footprint.houseWall ? currentDeck : rebuildDeck(currentDeck, propertyState, { houseWall: wall });
        const prior = wallDeck.sitePlacement || createDefaultSitePlacement(propertyState, wallDeck.dimensions.width, wallDeck.footprint.attachedToHouse, wall);
        const placement: DeckSitePlacement = {
          ...prior,
          status: hasFieldRecord ? 'field-input-unverified' : 'generated-unverified',
          referenceSource: hasFieldRecord ? 'field-measurement' : prior.referenceSource,
          wallStartOffsetM,
          outwardGapM: wallDeck.footprint.attachedToHouse ? 0 : Number(call.args.house_gap_m ?? prior.outwardGapM),
          recordedBy,
          recordedAt,
          notes: String(call.args.notes || ''),
          updatedAt: new Date().toISOString(),
        };
        const newDeck = rebuildDeck(wallDeck, propertyState, { sitePlacement: placement });
        const issues = runComplianceCheck(newDeck, propertyState);
        store.setDeck(newDeck);
        store.setCompliance(issues);
        const placementErrors = issues.filter((issue) => issue.id.startsWith('site-placement-'));
        return `Deck placed ${wallStartOffsetM.toFixed(3)} m from the ${wall.toUpperCase()} wall start${wallDeck.footprint.attachedToHouse ? ' with an attached zero-gap ledger line' : ` with ${placement.outwardGapM.toFixed(3)} m house clearance`}. ${hasFieldRecord ? 'Recorded as unverified field input; accepted survey/designer evidence is still required.' : 'Saved as an unverified design coordinate; add recorder and date to document a field measurement.'}${placementErrors.length ? ` ${placementErrors.map((issue) => issue.message).join(' ')}` : ''}`;
      }

      case 'set_framing_layout': {
        const currentDeck = store.deck;
        if (!currentDeck) return 'No deck to modify.';
        const current = normalizeDeckLayout(currentDeck);
        const beams = numberArray(call.args.beam_offsets_m) || current.beamOffsetsFromHouseM;
        const posts = numberArray(call.args.post_stations_m) || current.postStationsM;
        const requestedEdge = String(call.args.stair_edge || currentDeck.stairs.edge).toLowerCase();
        if (!['north', 'south', 'east', 'west'].includes(requestedEdge)) return 'Tool error: Stair edge must be north, south, east, or west.';
        const nextDeck: Deck = {
          ...currentDeck,
          stairs: { ...currentDeck.stairs, edge: requestedEdge as Deck['stairs']['edge'] },
          layout: {
            ...current,
            beamOffsetsFromHouseM: beams,
            postStationsM: posts,
            stairOffsetM: call.args.stair_offset_m === undefined ? current.stairOffsetM : Number(call.args.stair_offset_m),
            stairLandingDepthM: call.args.landing_depth_m === undefined ? current.stairLandingDepthM : Number(call.args.landing_depth_m),
            updatedAt: new Date().toISOString(),
          },
        };
        const assessment = assessDeckLayout(nextDeck);
        if (assessment.errors.length) return `Tool error: ${assessment.errors.join(' ')}`;
        store.setDeck(nextDeck);
        store.setCompliance(runComplianceCheck(nextDeck, store.property));
        return `Construction layout updated. ${layoutSummary(nextDeck)}. Coordinates are model inputs until verified in the field and accepted by the reviewing professional.`;
      }

      case 'set_decking': {
        const currentDeck = store.deck;
        if (!currentDeck) return 'No deck to modify.';
        const material = String(call.args.material || '').trim();
        if (!material) return 'No decking material provided.';
        store.updateDeck({ structure: { ...currentDeck.structure, deckingMaterial: material } });
        return `Decking updated: ${material}.`;
      }

      case 'set_guard': {
        const currentDeck = store.deck;
        if (!currentDeck) return 'No deck to modify.';
        const newGuard = {
          ...currentDeck.guard,
          ...(call.args.enabled !== undefined && { enabled: Boolean(call.args.enabled) }),
          ...(call.args.height_mm !== undefined && { height: Number(call.args.height_mm) }),
          ...(call.args.material !== undefined && { material: String(call.args.material) }),
        };
        store.updateDeck({ guard: newGuard });
        return `Guard updated: ${newGuard.enabled ? newGuard.height + 'mm ' + newGuard.material : 'disabled'}.`;
      }

      case 'set_stairs': {
        const currentDeck = store.deck;
        if (!currentDeck) return 'No deck to modify.';
        const newStairs = {
          ...currentDeck.stairs,
          ...(call.args.edge !== undefined && { edge: String(call.args.edge) as 'north' | 'south' | 'east' | 'west' }),
          ...(call.args.width_m !== undefined && { width: Number(call.args.width_m) }),
          ...(call.args.riser_mm !== undefined && { riserHeight: Number(call.args.riser_mm) }),
          ...(call.args.tread_mm !== undefined && { treadRun: Number(call.args.tread_mm) }),
        };
        store.updateDeck({ stairs: newStairs });
        return `Stairs updated: ${newStairs.numRisers} risers on ${newStairs.edge}.`;
      }

      case 'reset_session': {
        store.reset();
        return 'Session reset.';
      }

      default:
        return `Unknown tool: ${call.tool}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function numberArray(value: unknown): number[] | null {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.match(/-?\d+(?:\.\d+)?/g) : null;
  if (!raw) return null;
  const numbers = raw.map(Number);
  return numbers.length && numbers.every(Number.isFinite) ? numbers : null;
}
