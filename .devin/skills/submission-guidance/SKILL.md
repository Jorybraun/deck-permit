---
name: submission-guidance
description: Guide the user through submitting a permit application — where to go, what to bring, fees, and timeline. Use after plans are generated.
argument-hint: ""
allowed-tools:
  - read
  - web_search
  - webfetch
  - exec
---

# Submission Guidance

Help the user understand how to submit their permit application. This is guidance only — never submit anything on the user's behalf.

## When to use

- User has a plan set and asks "how do I submit?"
- User asks "what happens next?"
- User asks "where do I take these?"

## Process

1. **Research permit requirements** for the user's municipality (if not already done).
2. **Summarize:**
   - **Where to submit**: portal URL or physical address
   - **What forms**: list required forms
   - **What drawings**: the plan set (5 sheets)
   - **Fees**: application fee, inspection fees (if found)
   - **Timeline**: expected review time
3. **Offer to search** for the official portal if research doesn't have a URL.

## Rules

- Do not submit anything on the user's behalf. This is guidance only.
- Do not assume fees or timelines — research them.
- Do not skip this step. The user needs to know what to do with the plans.
- If the municipality has an online portal, share the URL and explain the process.
- If submission is in-person, share the address and hours.

## Output format

```
## How to Submit Your Permit in [Municipality]

**Where**: [portal URL or address]
**What to bring**:
- Completed [form name]
- 2 copies of your plan set
- Site plan showing setbacks
- [other requirements]

**Fees**: [amount] (verify with municipality)
**Timeline**: [estimated review time]
**Inspections**: [list required inspections]

[Action buttons: Open permit portal | Research fees | Start over]
```
