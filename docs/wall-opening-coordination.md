# Wall-opening coordination

## Purpose

Doors and windows are canonical architectural constraints, not background decoration. `assessWallOpeningCoordination` compares every recorded design-wall opening with every platform edge hosted by the selected house wall.

The assessment is deterministic and revisionable. It is consumed by the live designer, framing fingerprint, automated check schedule, professional-review gates, existing-condition drawing, calculation booklet, canonical review snapshot, and builder brief. The current contract is `wall-opening-coordination/v2` and embeds `architectural-coordination-profile/v1`.

## Rule provenance

Every check carries a stable `AC-##` rule ID and one of four basis classifications:

- `authority-requirement` — a municipal submission requirement, such as Sidney's requirement for dimensioned plans and house-connection flashing details;
- `adopted-code-context` — an applicable code subject that still needs project classification and interpretation;
- `model-integrity` — a geometric invariant required for the coordinated model to be internally usable;
- `project-review-assumption` — an editable proximity tolerance used to find likely conflicts, never represented as an adopted-code limit.

The profile records the adopted-code publication, official BC window/door bulletin, relevant BC Building Code Appeal Board interpretation context, the CWC guide scope/exclusions, and the municipal deck guide when the jurisdiction is Sidney. Each source includes edition, locator, URL, scope, and exclusions. The full rule/source register is printed on S4.x and in the calculation booklet.

## Checks

- **Evidence** — photo-observed openings remain review items until offset, width, sill, and head are measured.
- **Wall alignment** — a platform edge marked `house` must lie on the selected wall datum before opening offsets or a ledger can be coordinated.
- **Door access** — the deck surface is compared with the recorded threshold. Obstruction is blocked; a large step is routed to landing, swing, drainage, and access review.
- **Window clearance** — a surface reaching the sill zone is blocked. A lower nearby sill is routed to operability, safety-glazing, fall-protection, egress-use, and guard review without assuming the window's use.
- **Ledger zone** — horizontal opening overlap is combined with the preliminary ledger vertical zone. Intersections are blocked and require a split/header, relocation, freestanding strategy, or reviewed detail.

## Deliberate limits

The encoded 25 mm door-obstruction, 200 mm door-transition, 50 mm sill-zone, 900 mm window-proximity, 100 mm model-snap, 235 mm fallback-ledger, and legacy 2100/1200 mm door/window diagram heights are explicit editable project-review/model assumptions, not code certification. They are read from the versioned profile rather than hidden in the geometry engine. The software does not infer window operability, bedroom egress, door swing, safety glazing, concealed headers, wall substrate, final joist/ledger depth, flashing, or professional acceptance.

Final drawings remain governed by field measurements, resolved assemblies, professional review, and the authority having jurisdiction. Every non-pass check is bound to the framing input fingerprint so changing an opening invalidates the old framing issue.
