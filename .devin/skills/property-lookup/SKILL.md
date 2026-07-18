---
name: property-lookup
description: Look up a property by address — geocode, fetch parcel polygon, lot area, zoning, and snow load. ALWAYS follow with a full permit research report for the municipality.
argument-hint: "[address]"
allowed-tools:
  - read
  - exec
---

# Property Lookup

Geocode an address and fetch property data from BC Address Geocoder and ParcelMap BC WFS. This is always the first step. After looking up the property, you MUST run a full permit research report so the user knows every bylaw and requirement that applies.

## When to use

- User provides an address
- User asks "can you look up my property?"
- Starting a new session

## Process

1. **Call `lookup_property`** with the full address.
2. **Report the property details:**
   - Full address (confirmed)
   - PID (Parcel Identifier)
   - Lot area in sqm
   - Zone (e.g. R-1, R-2)
   - Snow load in kPa
3. **IMMEDIATELY run the permit-research skill** for the municipality. Do NOT skip this. The user needs to know:
   - Whether they need a permit
   - All setback rules
   - Height limits
   - Guard and stair requirements
   - Fees
   - Submission process
   - Any special rules (heritage, environmental, etc.)
4. **Present the full requirements report** to the user.
5. **Then ask**: "Ready to design your deck? Tell me what you're imagining."

## Rules

- Do not assume the zone or setbacks — the lookup tool returns them.
- Do not skip the permit research. Every municipality is different and the user needs to know everything.
- Do not proceed to deck design until the user has seen the requirements report and confirms the property is correct.
- If the address doesn't resolve, ask the user to check it.
- If the property is in a strata, mention that strata approval may be needed separately.

## Output format

```
## Property Found

**Address**: [full address]
**PID**: [parcel ID]
**Lot area**: [X] m2
**Zone**: [zone name]
**Snow load**: [X] kPa

Now let me look up the permit requirements for [municipality]...

[Full permit research report here — see permit-research skill for format]

[Action buttons: Design my deck | Research something else | Wrong address]
```
