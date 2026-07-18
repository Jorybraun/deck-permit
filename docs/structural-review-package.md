# Structural review package

The generated seven-sheet set follows the information categories listed in the Town of Sidney's [Guide to Residential Deck Construction](https://www.sidney.ca/wp-content/uploads/Residential-Deck-Construction.pdf): dimensions, footing and post size/spacing, structural member sizes and spans, house flashing, decking, guards, stairs, and handrails.

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

The CWC guide explicitly excludes footings, guards and railings, house attachment, and lateral bracing. S2.1 therefore provides coordinated geometry, calculated demands, envelope criteria, and a connection schedule while keeping actual connector capacity and field-dependent design fail-closed. Before sealing, a qualified professional must resolve the ledger/house substrate, fastener group, joist and beam connectors, built-up beam fastening, post caps and bases, lateral/uplift load path, footing/soil/frost design, guard system, stairs/stringers/landings/handrails, and flashing integration.

Every unresolved item appears in the professional checklist, the review gates, S2.1/S3.0, the reviewer portal, and the submission manifest. A professional review evidence record must match the exact design fingerprint; the fingerprint schema changes when the generated design basis changes so stale seals cannot silently carry forward.
