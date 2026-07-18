# Structural review package

The active twelve-sheet-minimum set follows the information categories listed in the Town of Sidney's [Guide to Residential Deck Construction](https://www.sidney.ca/wp-content/uploads/Residential-Deck-Construction.pdf): dimensions, footing and post size/spacing, structural member sizes and spans, house flashing, decking, guards, stairs, and handrails. C1.0 is the controlled evidence and existing-condition record: wall/opening geometry, measurement and datum provenance, capture coverage, evidence identifiers, and unresolved conditions. A1.0 writes deck-to-each-parcel-edge dimensions computed from the municipal parcel reference and visibly labels them `GIS REF`; those dimensions must be confirmed by an accepted dimensioned survey or field record before submission. The homeowner must select both the street-front and rear parcel edges before A1.0 names front/rear/interior/exterior yards. The sheet compares each written platform offset with its named setback and lists existing, proposed, combined, lot, and maximum reference coverage without claiming a municipal interpretation. A2.0 is the dimensioned deck/landing/stair plan and S1.0 is the foundation/post coordinate plan. S2.1 and any required S2.x continuation sheets give every keyed connection group an individual demand, member-interface, and resolution row. A3.0 contains coordinated house-to-yard and selected-wall orthographic views derived from the same canonical geometry as the side editor, including platform assemblies, hosted stairs, guards, posts, footings, openings, and grade. A4.1 and any required A4.x continuation sheets give every stair flight and generated guard run an individual design-control row. Framing, sections, details, and review gates remain coordinated on their own sheets.

The issue fingerprint covers the property and evidence references, full site and opening geometry, deck model, and generated framing output while deliberately excluding generation timestamps. A door, parcel, terrain, material, member, or evidence change therefore creates a new controlled issue, while re-running the same model does not create a false revision.

## Encoded prescriptive scope

Joists, the exterior built-up beam, and supporting post size are selected from the Canadian Wood Council [Residential Prescriptive Exterior Wood Deck Span Guide](https://cwc.ca/publication/residential-prescriptive-exterior-wood-deck-span-guide/) only when the model remains inside the encoded table assumptions. The report records the table, treatment condition, lookup span, allowable joist span, and utilization. Unsupported geometry or loading is marked `engineering-required`.

The demand trace uses:

- total area load `q = dead load + max(live load, site snow load)`;
- joist line load `wj = q × joist spacing`;
- simple-span joist demand `M = wL²/8` and `V = wL/2` for review transparency;
- exterior beam line load `wb = q × joist span/2`;
- actual equal beam bays no greater than the selected post-spacing table column;
- a conservative governing interior post reaction equal to the half-bay reactions from both adjacent bays;
- bearing-only footing area `A = governing reaction / assumed allowable soil bearing`.

The analytical demand values do not replace the CWC table pass and are not presented as member resistance values.

## Deliberately unresolved professional work

The CWC guide explicitly excludes footings, guards and railings, house attachment, and lateral bracing. Framing schema v2 therefore creates keyed connection-design work packages for ledger, joist, beam, post, footing, guard, and stair interfaces. S2.0 locates those tags and A4.0 schedules their quantities, coordinated gravity actions, member interfaces, and governing resolution requirements. Actual connector capacity and field-dependent design remain fail-closed. Before sealing, a qualified professional must resolve the ledger/house substrate, fastener group, joist and beam connectors, built-up beam fastening, post caps and bases, lateral/uplift load path, footing/soil/frost design, guard system, stairs/stringers/landings/handrails, and flashing integration.

Every unresolved item appears in the keyed connection schedule, review gates, reviewer portal, and submission manifest. A professional review evidence record must match the exact design fingerprint; the fingerprint schema changes when the generated design basis changes so stale seals cannot silently carry forward.

The professional handoff also includes a layered millimetre DXF compiled from the same graph and fingerprint. Stable member and connection IDs agree with S1.0, S2.0, and A4.0; CAD interoperability does not relax any review gate or capacity limitation.

It also includes a revision-bound calculation booklet. The booklet exposes platform systems, joist and beam demand equations, beam/post reactions, footing bearing screens, stair geometry, connection actions, sources, limitations, and every unresolved review gate. S4.0 cross-references the companion booklet schema and fingerprint. The booklet deliberately does not claim member or connector resistance outside the encoded prescriptive scope, and the review server rejects any calculation report that does not match the drawing manifest fingerprint.

For canonical issues, an accepted professional decision must now answer every derived member-system, foundation-system, stair-system, and keyed connection work package. The professional records the selected specification and capacity basis, references the sealed drawing/calculation that governs, or explains why a package is not applicable. These structured resolutions are bound to the issue fingerprint and accompany—rather than replace—the sealed PDF.
