# Structural connection-design module

## Responsibility

`src/domain/framingDesign/connections.ts` converts the generated member topology into keyed connection-design work packages. Every group has a stable tag, plan location, interface members, quantity, coordinated gravity action where derivable, action scope, demand basis, unresolved hardware fields, and reviewer requirements. S2.0 locates the tags and A4.0 schedules them.

The module does not select proprietary connectors, claim capacity, invent concealed house structure, or certify fastening. Those decisions remain fail-closed as `design-required` until a qualified reviewer or accepted proprietary design resolves the product, fastener schedule, corrosion class, capacity, and installation conditions.

## Public contract and version

- Framing schema: `framing-design/v2`
- `generateStructuralConnections(input) -> StructuralConnectionGroup[]`
- Connection kinds: ledger-to-house, joist-to-ledger, joist-to-beam, beam-to-post, post-to-footing, guard-to-frame, and stair-to-support.
- A legacy `framing-design/v1` snapshot is treated as stale and must be regenerated; it cannot silently issue drawings without the connection records.

## Demand trace

- Joist support action uses the maximum generated simple-span end reaction `q × spacing × span / 2`.
- Ledger gravity action is the sum of coordinated joist-end reactions; lateral and uplift actions remain unresolved.
- Beam-post and post-footing actions use the maximum generated post/footing reaction.
- Guard and stair connection actions remain unresolved because the current rules do not encode the complete code/product loading, notching, support, and capacity models.

These actions coordinate the drawing and reviewer workflow. They are not resistance values and never produce a passing connector check by themselves.

## Drawing and issue behavior

- S2.0 renders each connection tag at its canonical model point.
- A4.0 lists the tag, connection type, platform, quantity, action, member interface, and first governing resolution requirement.
- The full requirement arrays and unresolved hardware object remain in the immutable professional-review snapshot.
- Connection records participate in the canonical issue fingerprint, so regenerating or changing a connection invalidates stale review evidence.

## Verification

- Domain tests cover supported ledger framing, freestanding framing, guard groups, stair endpoints, quantities, demands, and unresolved hardware fields.
- Drawing tests require matching connection tags on S2.0 and schedule/control disclosures on A4.0.
- Browser verification checks the current persisted project is regenerated to v2 before preview or PDF issue.
