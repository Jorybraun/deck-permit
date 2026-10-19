# Compare two deck estimates

This is an untimed engineering test exercise for the published fictional role
in `role-brief.json`, not a real vacancy or a request for production candidate work.
You are not being asked to approve a deck design, assess building-code compliance,
contact a municipality, send an email, or use an AI/provider account.

## Starting point

`src/services/projectEstimate.ts` already converts a deck design into a typed
`ProjectEstimate`. Its values are concept allowances in Canadian dollars, not
quotes or live prices. Keep its existing calculation and behavior unchanged.
The current regression tests should pass before you begin; they do not already
implement or prove the new comparison below.

## Change

Add an exported, pure TypeScript function alongside the estimator:

```ts
compareProjectEstimates(before: ProjectEstimate, after: ProjectEstimate): ProjectEstimateChange
```

Define and export `ProjectEstimateChange` with these fields:

- `currency: 'CAD'`.
- `areaDeltaSqM`: after minus before, rounded to one decimal place.
- `materialLowDeltaCad`, `materialHighDeltaCad`, `installedLowDeltaCad`,
  `installedHighDeltaCad`: after minus before for the corresponding fields.
- `lineChanges`: one entry for each of the six estimate line IDs, in this order:
  `decking`, `framing`, `supports`, `guards`, `stairs`, `hardware`.
  Each entry contains `id`, `lowDeltaCad` and `highDeltaCad`, again after minus
  before for the same named endpoint. Match lines by ID, not array position.

Inputs are valid estimates produced by `estimateProject`: CAD, finite values and
each of the six line IDs exactly once. You do not need a new input-validation
framework or currency conversion. Keep decreases negative and unchanged values
zero (not negative zero). Do not round dollar differences again, clamp decreases,
recalculate prices, or mutate either input. The two endpoint deltas are separate
comparisons, not a newly calculated uncertainty interval.

Add visible tests in `src/services/projectEstimate.test.ts`. Demonstrate an
unchanged estimate, increases and decreases, differently ordered input lines,
one-decimal area differences, and unchanged input objects. Use small fictional
values or the existing local design helpers. No network calls are needed.

## Work and checks

In the prepared PIPEY desktop, from the repository root:

```sh
node environment/commands.mjs setup
node environment/commands.mjs health
node environment/commands.mjs verify
```

`setup` checks the image's pinned Node/dependency versions without installing
anything. `health` runs TypeScript compilation. `verify` runs the existing visible
regression suite, including your additions, and requires nonzero passing tests.
Reports appear in `reports/`; they are not scores or a substitute for human review.
The runtime must be built and qualified before these commands can work; this
document alone does not mean the challenge is approved.

No UI, server endpoint, provider integration, new dependency, or change to the
pricing formula is required. Keep your work inside `src/` and your checks visible.
Leave the manifest, role, policy, environment and dependency lockfile unchanged.
If a dependency check fails before editing, report the setup failure rather than
installing packages or disabling a check.

## Submission and review

Submit the implementation and its visible tests. The public `rubric.json` describes
the evidence a human reviewer will inspect against the role's confirmed requirement.
There is no hidden answer key, automated score, ranking or hiring recommendation in
this repository. Explain any unfinished behavior instead of presenting it as done.
