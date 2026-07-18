---
name: deck-design
description: Translate natural language deck descriptions into parametric deck designs with auto-sized structure. Use when the user describes a deck they want to build.
argument-hint: "[description]"
allowed-tools:
  - read
  - exec
---

# Deck Design

Convert a homeowner's natural language description into a fully sized deck design. The user does not know building code — you translate for them.

## When to use

- User says "I want a 12x16 cedar deck"
- User says "make it bigger" or "change the height"
- User accepts a suggested design
- User describes features (stairs, guard, privacy screen)

## Process

1. **Extract parameters from natural language:**
   - Dimensions: "12x16" = 12ft x 16ft. Convert to meters (1ft = 0.3048m).
   - Height: "2 feet" = 610mm. "low" = ~300mm, "raised" = ~1200mm, "second story" = ~2400mm.
   - Shape: default rectangle. "L-shaped" or "wraparound" if mentioned.
   - Features: stairs, guard, privacy screen, pergola, built-in bench.
   - Material: cedar, pressure-treated, composite (default pressure-treated).

2. **If any required parameter is missing, ask.** One question at a time.
   - Required: width, depth, height.
   - Optional: shape, material, features, attachment.

3. **Call create_deck** with the extracted parameters.

4. **Report the result:**
   - Area in sqm
   - Structural sizing (joist size/spacing, beam, posts, footings)
   - Guard configuration
   - Stair configuration

5. **Run compliance** immediately after creating the deck.

## Unit conversion

| User says | Meaning |
|-----------|---------|
| "12x16" | 12ft x 16ft = 3.66m x 4.88m |
| "2 feet high" | 610mm |
| "18 inches" | 457mm |
| "ground level" | ~300mm |
| "low deck" | ~450mm |
| "raised" | ~1200mm |

## Adjusting an existing deck

- Use `adjust_deck` for dimension/height changes (not full recreation).
- Use `set_guard` for guard changes.
- Use `set_stairs` for stair changes.

## Rules

- Do not assume structural sizes — the create_deck tool sizes them automatically.
- Do not quote BCBC numbers from memory — use permit-research if the user asks why.
- Always run compliance after creating or adjusting a deck.
- If the user's dimensions seem unusual (very large, very high), confirm before creating.

## Output format

After creating a deck, tell the user:
- The dimensions in both metric and imperial
- The structural members chosen
- Whether it passed compliance
- Suggested next actions (action buttons)
