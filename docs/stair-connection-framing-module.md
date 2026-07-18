# Stair connection and opening framing module

## Responsibility

This module keeps a stair flight attached to explicit platform edges or terrain and derives the framing interfaces that a structural reviewer must resolve. A stair is not considered connected merely because its drawing touches a platform.

The canonical `DeckStair` owns its two hosted endpoints and its A→B geometry. `generateStairConnectionFraming` derives receiving headers, doubled-trimmer intent, and traceable endpoint connection records from that geometry.

## Invariants

- `startMm` and `endMm` are the physical stair centreline endpoints.
- `totalRunMm` is always the current plan distance between those endpoints.
- `directionDeg` follows the current A→B line.
- `treadDepthMm` is reconciled from the current run and tread count when a host moves.
- A platform-hosted endpoint carries a platform ID, edge ID, and normalized position along that edge.
- Moving, rotating, or reshaping a host moves its attached endpoint. If the resulting flight is outside the code-screened rise/run range, the design records an error instead of silently moving the other host or drawing stale stringers.
- Each stringer line terminates at the same A and B connection planes as the stair centreline.
- A hosted opening must fit on both sides of its connection point; total edge length alone is insufficient.

## Derived structural intent

Each platform-hosted endpoint produces:

- A projected clear opening based on stair width and connection skew.
- A receiving header line tied to the host edge.
- Two concept trimmer lines extending into the framed platform.
- A connection record containing host elevation, receiving member IDs, and unresolved design requirements.

A terrain endpoint produces a grade-landing connection record rather than invented platform framing.

## Professional boundary

The generated header and trimmer lines are coordinated geometry, not sized construction members. Their section is deliberately `Engineer design`. The software does not select a proprietary hanger or certify:

- Header and trimmer reactions or capacity.
- Stringer bearing, end cuts, hangers, or seats.
- Fastener type, count, spacing, and edge distances.
- Blocking, lateral restraint, uplift resistance, or corrosion compatibility.
- Landing foundation, frost, drainage, or soil performance.

Those unresolved requirements remain visible in framing checks, review gates, connection IDs, and the issued review drawings.

## Drawing behavior

The framing preview and S1.0 sheet render headers and trimmers separately from stringers. The A3.0 stair detail identifies the top and bottom connection records. Every drawing identifier resolves back to the deterministic framing graph.

## Verification

Tests cover endpoint reattachment, run/tread reconciliation, invalid stretched flights, corner-clipping openings, platform-to-platform headers and trimmers, terrain landings, stringer endpoint agreement, and coordinated SVG sheet output.
