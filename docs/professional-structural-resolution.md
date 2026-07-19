# Professional structural resolution workflow

## Structural professional scope and authentication

The review exchange now declares a structural discipline contract. An accepted structural decision must come from an EGBC engineering professional acting in the structural discipline; an architect's coordination review cannot satisfy the structural gate. The submission records the engineer's name and registration number, engineering firm or sole practice, EGBC Permit to Practice number, current EGBC directory confirmation, sealed PDF digest, design fingerprint, and every structured work-package resolution. The server independently validates this scope and metadata before storing the decision, and the permit-readiness engine repeats the discipline check when importing persisted evidence.

This follows the Province of BC [Letters of Assurance guidance](https://www2.gov.bc.ca/gov/content/industry/construction-industry/building-codes-standards/bc-codes/letters-of-assurance), which distinguishes the coordinating professional from the Registered Professional of Record responsible for a specific discipline, and EGBC's [Permit to Practice requirements for Letters of Assurance](https://tools.egbc.ca/Practice-Resources/Individual-Practice/Guidelines-Advisories//Document/01525AMW2YVOKZSDUDYREZWW4W3A73SBNI/Permit%20to%20Practice%20Requirements%20for%20Letters%20of%20Assurance), which require engineering firms practising in BC to hold and apply a Permit to Practice number to authenticated documents. Whether formal BCBC Schedules are required for a particular Part 9 deck remains a project- and authority-specific decision; Permitly records the professional scope without claiming that a Letter of Assurance is always required.

The canonical structural-engineer portal no longer treats a sealed PDF as the only structural output. For a canonical issue, Permitly derives a compact set of professional work packages from the calculation report:

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
