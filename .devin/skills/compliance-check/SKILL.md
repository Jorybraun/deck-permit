---
name: compliance-check
description: Check a deck design against building codes and municipal bylaws. Identify, explain, and fix compliance issues.
argument-hint: ""
allowed-tools:
  - read
  - exec
---

# Compliance Check

Verify a deck design meets building code and local bylaw requirements. Explain issues in plain English and offer to fix them.

## When to use

- After a deck is created or adjusted
- User asks "does this pass code?"
- User asks "what issues remain?"
- Before generating a plan set

## Process

1. **Run compliance check** using the `run_compliance` tool.
2. **Categorize results:**
   - **Errors** — block the permit. Must be fixed.
   - **Warnings** — don't block but should be addressed.
   - **Info** — notes for the user.

3. **If errors exist:**
   - List each error with its code reference (e.g. "BCBC 9.8.8.3")
   - Explain in plain English what it means
   - Offer to fix it (call `fix_issue` with the issue ID)
   - After fixing, re-run compliance to verify

4. **If no errors:**
   - "Your deck passes all checks. Ready to generate plans."

## Common compliance issues for decks

- **Setback violation**: deck too close to property line
- **Guard missing or too low**: required when deck > 600mm above grade
- **Stair dimensions**: riser too high/tread too narrow
- **Footing insufficient**: wrong size or depth
- **Post undersized**: 4x4 used where 6x6 required
- **Ledger attachment**: missing or wrong bolt pattern
- **Lot coverage exceeded**: deck + house exceeds max %

## Rules

- Do not quote specific code numbers from memory. Use permit-research if the user wants exact code text.
- Warnings do not block permits — don't present them as blocking.
- Always re-run compliance after fixing an issue.
- If an issue can't be auto-fixed, explain what the user needs to change manually.

## Output format

```
## Compliance Check Results

**Errors** (must fix):
1. [Issue ID] Guard height 900mm below minimum 1070mm (BCBC 9.12.3.1)
   Fix: Raise guard to 1070mm

**Warnings** (recommended):
1. Stair riser 190mm is at the upper limit (BCBC 9.8.4.1)

**Passed**: Setbacks, footings, posts, ledger, lot coverage

[Action buttons: Fix all issues | Explain errors | Generate plans]
```
