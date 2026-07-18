# Professional structural resolution workflow

The canonical reviewer portal no longer treats a sealed PDF as the only structural output. For a canonical issue, Permitly derives a compact set of professional work packages from the calculation report:

- one member-system package per platform;
- one foundation-system package per platform with generated footings;
- one stair-system package per stair flight;
- every keyed ledger, joist, beam, post, footing, guard, and stair connection group.

Each package retains its demand summary and unresolved requirements. A reviewer can resolve it by:

1. recording a selected member, assembly, or hardware specification plus its capacity/calculation/table/product-data basis;
2. pointing to the exact location where the sealed document resolves it; or
3. marking it not applicable with a professional explanation.

Every resolution carries the canonical design fingerprint, work-package ID, category, document reference, timestamp, and a unique record ID. The browser validator and review server independently reject duplicate, unknown, stale, incomplete, or malformed records. An accepted canonical review is rejected unless every derived work package has one structured resolution. A change request may submit partial resolutions alongside required sheet redlines.

## Authentication boundary

The machine-readable resolution record supplements the sealed PDF. Permitly does not claim that the JSON is independently sealed, does not infer the professional's capacity decision, and does not mutate an already reviewed drawing set. Mutating reviewed geometry would create a new fingerprint and require a new review.

When the homeowner imports an accepted decision, the exact structured resolutions are stored in the professional review cycle. They are:

- visible as a resolved package count in the homeowner workflow;
- downloadable as `permitly-professional-resolution-record/v1` JSON;
- carried into later reviewer packages as prior coordination history;
- included in the submission manifest and professional response log;
- emitted as a separate resolution record in the permit ZIP.

The sealed PDF remains the authoritative professional document identified by the evidence record and SHA-256 digest. Municipal acceptance, field reviews, and construction authorization remain separate gates.
