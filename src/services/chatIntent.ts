import type { ToolCall } from './agent';

const METRES_PER_FOOT = 0.3048;

/** Parse the deck description used by both the workspace input and permit chat. */
export function deckToolFor(message: string): ToolCall | null {
  const normalized = message.trim();
  const separator = '(?:x|×|by)';
  const imperialSize = normalized.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')?\\s*${separator}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')?`, 'i'));
  const metricSize = normalized.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*m\\s*${separator}\\s*(\\d+(?:\\.\\d+)?)\\s*m`, 'i'));
  if (!/\bdeck\b/i.test(normalized) || (!imperialSize && !metricSize)) return null;

  const first = Number((metricSize || imperialSize)![1]);
  const second = Number((metricSize || imperialSize)![2]);
  const multiplier = metricSize ? 1 : METRES_PER_FOOT;
  const heightMm = parseHeightMillimetres(normalized) ?? 600;
  const material = deckingMaterialFor(normalized);

  return {
    tool: 'create_deck',
    args: {
      shape: /\bl[- ]shape/i.test(normalized) ? 'l-shape' : /wrap/i.test(normalized) ? 'wraparound' : 'rectangle',
      // A deck's longer dimension runs along the house; depth is the joist-span direction.
      width_m: Math.max(first, second) * multiplier,
      depth_m: Math.min(first, second) * multiplier,
      height_mm: heightMm,
      ...(material ? { material } : {}),
      stairs: /\b(?:with|add|include|has|and) stairs?\b/i.test(normalized),
    },
  };
}

/** Deterministic fallback for core chat commands when no model provider is configured. */
export function directToolFor(message: string): ToolCall | null {
  const normalized = message.trim();
  const looksLikeAddress = /\b\d{3,6}\s+[a-z0-9 .'-]+\b(?:ave(?:nue)?|st(?:reet)?|rd|road|dr(?:ive)?|way|blvd|lane|ln)\b/i.test(normalized);
  if (looksLikeAddress && /sidney|\bbc\b|british columbia/i.test(normalized)) {
    return { tool: 'lookup_property', args: { address: normalized } };
  }

  const deckTool = deckToolFor(normalized);
  if (deckTool) return deckTool;

  const placement = parseSitePlacement(normalized);
  if (placement) return { tool: 'set_site_placement', args: placement };

  const framingLayout = parseFramingLayout(normalized);
  if (framingLayout) return { tool: 'set_framing_layout', args: framingLayout };

  const adjustment = parseDimensionAdjustment(normalized);
  if (adjustment) return { tool: 'adjust_deck', args: adjustment };

  if (/\b(?:decking|deck material|finish)\b/i.test(normalized)) {
    const material = deckingMaterialFor(normalized);
    if (material) return { tool: 'set_decking', args: { material } };
  }

  if (/\b(?:railing|guardrail|guard)\b/i.test(normalized)) {
    if (/\b(?:remove|none|no|without|disable)\b/i.test(normalized)) return { tool: 'set_guard', args: { enabled: false } };
    const material = /glass/i.test(normalized) ? 'Frameless glass guardrail'
      : /aluminum|metal|black/i.test(normalized) ? 'Black aluminum picket railing'
        : /wood|cedar/i.test(normalized) ? 'Cedar wood guardrail' : undefined;
    if (material) return { tool: 'set_guard', args: { enabled: true, material } };
  }

  if (/^run (?:the )?(?:code|compliance) check/i.test(normalized)) return { tool: 'run_compliance', args: {} };
  if (/^(?:generate|create) (?:the )?(?:permit )?plans/i.test(normalized)) return { tool: 'generate_plan_set', args: {} };
  if (/^start over$/i.test(normalized)) return { tool: 'reset_session', args: {} };
  return null;
}

export function isToolFailure(result: string): boolean {
  return /^(?:Tool error:|No address provided\.|Load a property first\.|No deck (?:to check|to adjust|to modify|to estimate|to place)\.|No decking material provided\.|Design a deck first\.|Unknown tool:)/i.test(result.trim());
}

export function deckingMaterialFor(message: string): string | undefined {
  if (/cedar/i.test(message)) return 'Western red cedar decking';
  if (/driftwood/i.test(message)) return 'Driftwood composite decking';
  if (/walnut|composite/i.test(message)) return 'Walnut composite decking';
  if (/pressure[- ]treated|\bpt\b/i.test(message)) return 'Pressure-treated wood decking';
  return undefined;
}

function parseHeightMillimetres(message: string): number | null {
  const feet = message.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:high|tall|above grade)/i);
  if (feet) return Number(feet[1]) * 304.8;
  const inches = message.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")\s*(?:high|tall|above grade)/i);
  if (inches) return Number(inches[1]) * 25.4;
  const millimetres = message.match(/(\d+(?:\.\d+)?)\s*mm\s*(?:high|tall|above grade)/i);
  if (millimetres) return Number(millimetres[1]);
  const metres = message.match(/(\d+(?:\.\d+)?)\s*m\s*(?:high|tall|above grade)/i);
  return metres ? Number(metres[1]) * 1000 : null;
}

function parseDimensionAdjustment(message: string): Record<string, number> | null {
  if (!/\b(?:change|set|adjust|make|update)\b/i.test(message)) return null;
  const args: Record<string, number> = {};
  const fields: Array<[string, string]> = [['width_m', 'wide|width'], ['depth_m', 'deep|depth']];
  for (const [arg, label] of fields) {
    const metric = message.match(new RegExp(`(?:${label})(?:\\s+to|\\s*=|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*m\\b|(?:change|set|adjust|make|update)\\s+(?:the\\s+)?(?:${label})(?:\\s+to|\\s*=|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*m\\b`, 'i'));
    const imperial = message.match(new RegExp(`(?:${label})(?:\\s+to|\\s*=|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')|(?:change|set|adjust|make|update)\\s+(?:the\\s+)?(?:${label})(?:\\s+to|\\s*=|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')`, 'i'));
    if (metric) args[arg] = Number(metric[1] || metric[2]);
    else if (imperial) args[arg] = Number(imperial[1] || imperial[2]) * METRES_PER_FOOT;
  }
  const height = parseHeightMillimetres(message);
  if (height !== null) args.height_mm = height;
  return Object.keys(args).length ? args : null;
}

function parseSitePlacement(message: string): Record<string, unknown> | null {
  if (!/\b(?:place|move|position|offset|locate)\b/i.test(message) || !/\bdeck\b/i.test(message)) return null;
  const wall = message.match(/\b(north|south|east|west)\s+(?:house\s+)?wall\b/i)?.[1]?.toLowerCase();
  const metric = message.match(/(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/i);
  const imperial = message.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\b/i);
  const offset = metric ? Number(metric[1]) : imperial ? Number(imperial[1]) * METRES_PER_FOOT : null;
  if (offset === null) return null;
  const gapMetric = message.match(/(?:gap|clearance)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*m\b/i);
  return {
    wall_start_offset_m: offset,
    ...(wall ? { house_wall: wall } : {}),
    ...(gapMetric ? { house_gap_m: Number(gapMetric[1]) } : {}),
  };
}

function parseFramingLayout(message: string): Record<string, unknown> | null {
  if (!/\b(?:beam offsets?|post(?:\s*\/\s*footing)? stations?|stair offset)\b/i.test(message)) return null;
  const args: Record<string, unknown> = {};
  const beamText = message.match(/beam\s+offsets?\s+(?:to|at)?\s*([\d.,\s]+?)\s*m\b/i)?.[1];
  const postText = message.match(/post(?:\s*\/\s*footing)?\s+stations?\s+(?:to|at)?\s*([\d.,\s]+?)\s*m\b/i)?.[1];
  const stairOffset = message.match(/stair\s+offset\s+(?:to|at)?\s*(\d+(?:\.\d+)?)\s*m\b/i)?.[1];
  const stairEdge = message.match(/\bstairs?\s+(?:on|at)\s+(?:the\s+)?(north|south|east|west)\s+edge\b/i)?.[1];
  if (beamText) args.beam_offsets_m = numbersIn(beamText);
  if (postText) args.post_stations_m = numbersIn(postText);
  if (stairOffset) args.stair_offset_m = Number(stairOffset);
  if (stairEdge) args.stair_edge = stairEdge.toLowerCase();
  return Object.keys(args).length ? args : null;
}

function numbersIn(value: string): number[] {
  return (value.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}
