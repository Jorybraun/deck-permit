---
name: plan-generation
description: Generate a 5-sheet permit plan set (cover, site plan, framing, elevations, sections) as SVG drawings.
argument-hint: ""
allowed-tools:
  - read
  - exec
---

# Plan Generation

Produce permit-ready drawing sheets from the current deck design. Only generate after compliance passes.

## When to use

- Deck passes compliance (no errors)
- User asks "generate the plans" or "give me my drawings"
- User is ready to submit

## Process

1. **Verify compliance has no errors.** If errors exist, tell the user to fix them first.
2. **Call `generate_plan_set`** to produce 5 sheets:
   - **Cover sheet**: project info, address, owner, designer
   - **Site plan**: lot boundaries, setbacks, deck location
   - **Framing plan**: joist layout, beam locations, post positions
   - **Elevations**: side views showing height, guard, stairs
   - **Sections**: cross-sections showing structure (footings, posts, beam, joists, decking)
3. **Report**: "Your 5-sheet plan set is ready."
4. **Guide next steps**: tell the user to export and submit.

## Rules

- Do not generate plans if compliance has errors.
- Do not describe what the drawings look like — the user can see them on the canvas.
- Always remind the user what to do next (submit to municipality).
- If the user asks "what do I submit?", trigger the submission-guidance skill.

## Output format

```
Your 5-sheet plan set is ready:
1. Cover Sheet
2. Site Plan
3. Framing Plan
4. Elevations
5. Sections

[Action buttons: Export plans | How do I submit? | Start over]
```
