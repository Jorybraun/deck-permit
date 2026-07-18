# Canonical calculation report

The professional-review package includes a structured calculation report and a downloadable portrait PDF booklet. It is compiled from the same property, site, deck, and framing graph as the ten-sheet drawing set and layered DXF. All three artifacts carry the same `DP-XXXXXXXX` design fingerprint.

## Recorded calculation trail

The report records:

- project issue control, code profile, loads, lumber basis, and assumed soil bearing;
- platform area, elevation, support strategy, joist axis, and governing design span;
- grouped joist line load and simple-span demand equations (`M = wL²/8`, `V = wL/2`);
- beam geometry, support count, and governing generated post reaction;
- post and footing reaction, required and provided bearing area, and bearing pressure;
- stair endpoints, rise/run geometry, stringer count, and linked connection IDs;
- every keyed structural connection work package and coordinated design action;
- automated checks, professional review gates, sources, exclusions, and limitations.

The structured contract is `permitly-canonical-calculation-report/v1`. The reviewer exchange validates the schema, bounds, issue metadata, design fingerprint, numerical demand records, unresolved footing depth, and fail-closed connection status before storing a package.

## Deliberate boundary

This is a transparent coordination calculation booklet, not authenticated engineering. It does not invent:

- member resistance or connector capacity where no encoded prescriptive table applies;
- proprietary hardware, fastener schedules, lateral or uplift resistance;
- verified soil capacity, frost depth, concrete/reinforcement, settlement, drainage, or utilities;
- concealed ledger substrate, envelope condition, or field dimensions;
- a professional seal or authorization to construct.

Those conditions remain explicit work packages and review gates. A registered professional can use the report to check the demand trail, resolve capacities and field conditions, and authenticate a final issue without reconstructing the homeowner's design intent from screenshots.

## Revision integrity

Any fingerprint-affecting property, evidence, geometry, stair, material, framing, or connection change produces a new calculation identity. The review server rejects a report whose fingerprint differs from the drawing manifest, preventing stale calculations from being attached to a revised plan set.
