---
name: permit-research
description: Research and report ALL building code requirements, bylaws, permit processes, fees, and restrictions for any BC municipality. Always run after property lookup. Use when the user asks about rules, setbacks, permit requirements, or submission processes.
argument-hint: "[topic] [municipality]"
allowed-tools:
  - read
  - grep
  - web_search
  - webfetch
  - exec
---

# Permit Research

Research and surface EVERY bylaw, code requirement, and restriction that applies to the user's deck project. The homeowner does not know what questions to ask — it is your job to tell them everything that applies, proactively.

## When to use

- **ALWAYS after loading a property** — before designing, tell the user everything that applies
- User asks "what permits do I need?"
- User asks "what are the rules in [city]?"
- User asks "how do I submit?" or "what does it cost?"
- When any jurisdiction-specific number is needed
- Before generating plans — confirm nothing has changed

## Process

1. **Identify the jurisdiction.** Use the property's municipality if loaded. Otherwise ask.
2. **Search for the official municipal website.** Use `web_search` for "[municipality] BC building permit deck" and "[municipality] BC zoning bylaw".
3. **Fetch and read** the relevant pages: permit application page, zoning bylaw, fee schedule.
4. **Compile a complete requirements report** covering ALL of the categories below.
5. **Present it to the user in plain English** before asking them to design their deck.

## What to research — ALL of these, every time

### Zoning & Setbacks
- Front setback (m)
- Rear setback (m)
- Interior side setback (m)
- Exterior side setback for corner lots (m)
- Max lot coverage (%)
- Max height for accessory structures (m)
- Is a deck considered an accessory structure or part of the principal building?
- Are decks exempt from setbacks if under a certain height?

### Permit Triggers
- At what deck height is a permit required? (e.g. "under 600mm no permit")
- At what deck area is a permit required?
- Does an attached deck need a permit when a freestanding one doesn't?
- Is a building permit required, or just a development permit, or both?

### Guards & Railings
- When is a guard required? (height above grade threshold)
- Minimum guard height (mm)
- Maximum opening size (no-sphere rule)
- Material restrictions

### Stairs
- Maximum riser height (mm)
- Minimum tread depth (mm)
- Minimum stair width (mm)
- Maximum number of risers without a landing
- Handrail requirements

### Structural
- Footing type and minimum depth (frost line)
- Minimum footing size (mm)
- Post size requirements (4x4 vs 6x6 by height)
- Ledger attachment requirements
- Joist span limits (reference CWC tables)

### Fees
- Building permit application fee
- Development permit fee (if applicable)
- Inspection fees
- Plan review fee

### Submission Requirements
- What forms are needed
- How many drawing copies
- Site plan requirements
- Who can submit (owner vs contractor)
- Online portal vs in-person

### Process & Timeline
- Expected review time
- Required inspections (footing, framing, final)
- When can construction start
- Validity period of the permit

### Special Rules
- Heritage or conservation area restrictions
- Strata or HOA approval needed?
- Environmental setbacks (waterfront, riparian areas)
- Tree protection bylaws that affect construction access
- Noise bylaws for construction hours

## Sources to prioritize

1. Municipal official website (e.g. `sidney.ca/permits`, `sidney.ca/zoning`)
2. Municipal zoning bylaw PDF
3. BC Building Code (BCBC) current edition
4. BC Housing Illustrated Guide for Building Safe and Durable Wood Decks
5. Canadian Wood Council (CWC) prescriptive deck span guide
6. Provincial building safety information (gov.bc.ca)

## Rules

- NEVER guess a number. If you can't find it, say "verify with [municipality]".
- ALWAYS cite the source URL or document name.
- Distinguish provincial code (BCBC) from municipal bylaws.
- If the municipality has an online permit portal, find and share the URL.
- Note the bylaw publication date — rules may have changed.
- Present ALL findings even if the user didn't ask — they don't know what they don't know.
- If a rule doesn't apply (e.g. no heritage area), say so explicitly: "No heritage restrictions found."

## Output format

Present a complete report like this:

```
## Building a Deck in [Municipality] — What You Need to Know

Here's everything that applies to your deck project based on your property at [address].

### Do You Need a Permit?
[Yes/No and the threshold. E.g. "Yes — any deck attached to the house or over 600mm above grade requires a building permit."]

### Setbacks (how close to property lines)
- Front: [X]m
- Rear: [X]m
- Side: [X]m
- Corner lot exterior side: [X]m
- Max lot coverage: [X]%

Source: [bylaw name and URL]

### Guards & Railings
[When required, min height, opening rule]

### Stairs
[Riser, tread, width limits]

### Structural Requirements
[Footing depth, post size, etc.]

### Fees
- Building permit: $[X]
- [Other fees]
Source: [fee schedule URL]

### How to Submit
[Portal URL or address, forms needed, drawing copies]

### Timeline
[Review time, inspections, permit validity]

### Special Rules for Your Area
[Heritage, environmental, tree protection, noise bylaw, or "none found"]

### Sources
- [URL 1 — description]
- [URL 2 — description]
- [URL 3 — description]

[Action buttons: Design my deck | Research something else | What if I'm in a different city?]
```
