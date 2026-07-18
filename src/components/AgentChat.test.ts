import { describe, expect, it } from 'vitest';
import { directToolFor, isToolFailure } from '../services/chatIntent';

describe('chat intent fallback', () => {
  it('recognizes a Sidney address without an AI provider', () => {
    expect(directToolFor('2423 Lovell Ave, Sidney BC')).toEqual({
      tool: 'lookup_property',
      args: { address: '2423 Lovell Ave, Sidney BC' },
    });
  });

  it('does not present failed tool calls as successful chat actions', () => {
    expect(isToolFailure('Tool error: Address not found.')).toBe(true);
    expect(isToolFailure('Load a property first.')).toBe(true);
    expect(isToolFailure('Found 2423 Lovell Avenue.')).toBe(false);
  });

  it('parses an imperial deck request into an executable tool call', () => {
    expect(directToolFor('Make it a 12x16 cedar deck 2 feet high with stairs')).toEqual({
      tool: 'create_deck',
      args: {
        shape: 'rectangle',
        width_m: 4.8768,
        depth_m: 3.6576000000000004,
        height_mm: 609.6,
        material: 'Western red cedar decking',
        stairs: true,
      },
    });
  });

  it('uses the same normalized result for x and by descriptions', () => {
    expect(directToolFor('12 by 16 composite deck, 600 mm high with stairs')).toEqual({
      tool: 'create_deck',
      args: {
        shape: 'rectangle',
        width_m: 4.8768,
        depth_m: 3.6576000000000004,
        height_mm: 600,
        material: 'Walnut composite decking',
        stairs: true,
      },
    });
  });

  it('parses dimension and finish edits without an AI provider', () => {
    expect(directToolFor('Change the width to 16 feet')).toEqual({ tool: 'adjust_deck', args: { width_m: 4.8768 } });
    expect(directToolFor('Change the decking finish to driftwood composite')).toEqual({ tool: 'set_decking', args: { material: 'Driftwood composite decking' } });
    expect(directToolFor('Use a glass railing')).toEqual({ tool: 'set_guard', args: { enabled: true, material: 'Frameless glass guardrail' } });
    expect(directToolFor('Move the deck 1.25 m from the start of the south wall')).toEqual({ tool: 'set_site_placement', args: { wall_start_offset_m: 1.25, house_wall: 'south' } });
    expect(directToolFor('Set beam offset to 2.65 m and post stations to 0, 1.33, 2.67, 4 m')).toEqual({ tool: 'set_framing_layout', args: { beam_offsets_m: [2.65], post_stations_m: [0, 1.33, 2.67, 4] } });
  });
});
