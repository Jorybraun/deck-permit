# Site-clearance module

`site-clearance/v1` derives reproducible written deck-to-parcel reference dimensions from the same local project coordinate system used by the editor and permit drawings.

For every municipal parcel segment, the engine finds the shortest segment-to-segment distance across every proposed platform edge. Intersections and boundary contact produce a zero distance. Every proposed platform vertex is also tested against the reference parcel polygon. The result records the closest point on the deck, the closest point on the parcel edge, the platform and parcel-edge identifiers, the written millimetre distance, and whether the proposal appears contained by the municipal reference.

The authority is always `municipal-gis-reference`. A1.0 and the calculation report display this provenance next to the dimensions and state that GIS geometry is not a legal survey. The readiness evaluator fails closed until a dimensioned survey or field-measurement PDF is attached to the exact design fingerprint. Owner evidence remains `recorded-unverified`; the application does not upgrade it to survey evidence or claim municipal acceptance.

This separation lets homeowners position a design intelligently while preserving the professional and municipal evidence boundary needed for a permit package.
