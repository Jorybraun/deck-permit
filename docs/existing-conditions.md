# Existing conditions module contract

## Responsibility

`src/services/existingConditions.ts` validates and summarizes user-entered existing-house and attachment-wall measurements for design coordination. It does not verify a site visit, certify the existing structure, design ledger fasteners, or satisfy a professional review gate.

## Public API and version

- Schema: `existing-house-conditions/v1`
- `deriveHouseReference(property)`: derives editable starting dimensions from the primary municipal roofline or a conservative estimate.
- `createExistingConditionsDraft(property, deck)`: creates a complete unverified draft.
- `assessExistingConditions(conditions, deck)`: returns blocking geometry errors and explicit professional-review warnings.
- `existingConditionBasis(property)` and `ledgerConditionSummary(conditions)`: create consistent disclosures for reports and drawings.

## State and dependencies

`Property.existingConditions` is the canonical durable owner and is persisted with the versioned project snapshot in IndexedDB. `ExistingConditionsPanel` owns only an unsaved form draft. Saving invalidates plan sheets, the structural report, readiness, permit manifest, review exchange, and application prefill. Evidence PDFs remain in the separate evidence vault and are reassessed against the next generated revision.

Dependency direction is UI → existing-conditions domain → property state. The 3D model, fingerprint, structural analysis, and plan generator consume the saved record read-only. The domain module must not import React, browser storage, drawing code, professional registries, or network providers.

## Authority and review behavior

Municipal rooflines remain reference geometry. Saved measurements have status `field-input-unverified`; they alter the design fingerprint and appear in the 3D model and professional-review drawings with an evidence-required disclosure. The house field-report gate accepts only a designer, engineer, or architect PDF bound to the exact current design fingerprint. Unknown rim/band material or infeasible flashing keeps the ledger design check blocked.

## Failure and recovery

The editor rejects implausible house dimensions, ledgers longer than the measured wall or deck, openings outside the measured wall, invalid threshold/rim depths, missing measurement attribution, and future/invalid dates. Unknown cladding, substrate, or flashing remains saveable but is shown as an unresolved review warning. Recovery is to correct the field input, save a new revision, regenerate drawings, and attach evidence for that revision.

## Security and privacy

Measurements, attribution, and notes remain local until the user explicitly publishes a reviewer package or downloads a permit bundle. Free-text values are escaped by the SVG drawing generator. Field input is never relabelled as a municipal or professional source.

## Verification

- Unit: reference derivation, geometry validation, attribution, review warnings, revision fingerprints, structural blocking, and stale field-report rejection.
- Drawing integration: seven strict SVG sheets contain the measured wall, rim/cladding, opening, threshold, attribution, and evidence-required disclosure.
- Journey: save field inputs, observe the 3D house update, regenerate a new fingerprint, inspect connection schedules, reload, and confirm persistence.
