# Canonical builder brief

The builder brief is a homeowner-controlled quoting handoff generated from the same canonical property, site, deck, stair, framing, review, and permit state used by the drawing package. It is not a generic marketing lead and it is not authorization to build.

## Controlled revision

- Every brief carries the review issue revision and `DP-…` design fingerprint.
- Homeowner consent is bound to that exact fingerprint.
- Changing property, site, intent, design, framing, permit-contact data, or any selected sharing scope clears consent.
- A stored consent for any other fingerprint fails closed and produces only a private preview.

## Privacy scopes

The unconsented preview always omits exact address/PID/legal description, homeowner contact details, drawing index, photo observations, and professional records. The homeowner selects each restricted scope and confirms the resulting portable file. The application does not silently transmit a lead or contact a builder.

Photo sharing contains only structured observations, file integrity metadata, and evidence status. Raw photo bytes are never embedded in the JSON brief. Doors and windows are included in the site-opening register with their evidence status so a builder can distinguish photo-observed starter geometry from field-measured or professionally verified dimensions.

## Quoting and matching

The brief includes use, materials, features, platform/stair geometry, preliminary framing state, permit gates, unresolved work, required builder capabilities, and qualification criteria. The displayed estimate is a dated regional concept allowance—not live supplier pricing, a bill of materials, or a contractor quote.

An external builder directory and recipient audit trail remain separate future integrations. They must consume an approved brief without weakening its fingerprint or consent checks.
