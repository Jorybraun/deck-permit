# AI-authored deck plans: target product and output

## Decision

The product should let AI create and revise a complete deck proposal, but the issued geometry and drawings must be generated from one canonical parametric model. AI is the architect-like copilot; measured evidence, geometry constraints, code rules, structural calculations, drawing generation, revision control, and professional authentication are separate controlled systems.

The active fourteen-sheet-minimum output is a coordination and professional-review set. C1.0 records the controlled evidence and existing conditions; A2.0 isolates the dimensioned deck/landing/stair plan; S1.0 locates foundations while paginated S1.x schedules preserve every footing/post record; paginated S2.x schedules identify every keyed structural connection group; S3.x gives every platform its own assembly section; paginated A4.x schedules identify every stair flight and guard run; and paginated S4.x schedules preserve every system screen, automated check, and professional review work package. The package is not yet a sealed architectural or structural construction-document set and must not be represented as engineer-grade.

## What the homeowner supplies

1. Address and selected parcel.
2. A guided exterior capture of the house wall, door, grade, corners, obstructions, and yard.
3. At least one scale reference or LiDAR capture; critical measurements are confirmed explicitly.
4. Existing survey or site plan when available.
5. Photos of visible framing and attachment conditions; inaccessible structure is marked unknown.
6. Design intent: use, platforms, elevations, materials, stairs, railings, budget, and special loads.

Apple RoomPlan demonstrates the useful capture pattern: a phone can guide a LiDAR/camera scan and return parametric walls, doors, openings, and dimensions in USD/USDZ. Autodesk ReCap demonstrates the complementary reality-capture workflow from photos or laser scans into aligned point clouds, orthographic views, and meshes. These are evidence sources, not the authoritative building model by themselves.

## Product workflow

### 1. Capture and establish evidence

- Match the address to the cadastral parcel and municipal data.
- Establish north, a site coordinate system, and a vertical datum.
- Build a photo/LiDAR point cloud or mesh.
- Detect candidate walls, doors, windows, grade, and obstacles.
- Ask the homeowner to confirm or measure uncertain features.
- Store every fact with source, date, confidence, and verification status.

### 2. Create the existing-condition model

- Parcel boundary, setbacks, easements, and rights-of-way.
- Terrain surface from spot elevations, not one global ground height.
- Existing house footprint, levels, wall planes, openings, and visible structure.
- Unknown construction conditions remain explicit unknowns.

### 3. Let AI design against the model

AI may:

- turn conversation and sketches into model commands;
- propose several code-aware platform, stair, and railing arrangements;
- position platforms relative to doors, grade, property constraints, and intended use;
- explain tradeoffs and ask for missing evidence;
- apply professional redlines to the next revision.

AI must not place arbitrary pixels or write an unverified dimension directly onto a sheet. Its proposal becomes reversible structured commands, then passes schema, geometric, code, and provenance validation.

### 4. Solve geometry and structure deterministically

The canonical model contains:

- site, parcel, terrain, house, walls, levels, and openings;
- deck platforms and landing platforms with independent elevations;
- stair systems made of runs, landings, stringers, railings, and attachments;
- framing zones, joists, beams, ledgers, posts, footings, guards, and connections;
- explicit stair openings, headers, doubled trimmers, and attachment hardware;
- loads, materials, rule results, unresolved conditions, and professional-review gates.

When a connected platform moves, the constraint solver recomputes its stairs and connections. If rise, run, landing, opening, or attachment cannot remain valid, the stair becomes unresolved rather than silently deforming.

### 5. Generate coordinated CAD views and sheets

AutoCAD-quality means that all plans, elevations, sections, schedules, details, quantities, 3D views, and exports are projections of the same model. Editing the model updates every view. The app should produce true vector PDF plus DWG/DXF interoperability; Autodesk's Automation API is one credible route for creating, modifying, standards-checking, and plotting real DWG files.

## Target permit and construction package

| Sheet / file | Required content |
| --- | --- |
| G0.0 Cover and design basis | project, code edition, municipality, scope, drawing index, assumptions, status, professional fields |
| C1.0 Evidence and existing conditions | data sources, capture coverage, benchmark/datum, verified measurements, unresolved conditions |
| A1.0 Site plan | legal parcel, house, deck/stairs/footings, property-line setbacks, north, grade, easements, coverage |
| A2.0 Deck and landing plans | exact boundaries, openings, doors, stairs, elevations, dimensions, materials, guards |
| S1.0 Foundation plan | footing coordinates, sizes, depths, posts, reactions, soil/frost assumptions and unresolved design items |
| S2.0 Framing plans | ledgers, joists, beams, headers, trimmers, blocking, posts, spans, cantilevers, member schedule |
| A3.0 Elevations | actual projected house/deck relationship, finished and natural grade, platform/guard heights, stairs |
| A4.0 / S3.0 Sections | wall attachment, complete load path, platform build-up, foundations, stairs and grade |
| D1.0 Connections | ledger/flashing, lateral ties, beam-post, post-base, stair header/stringer, guard anchorage, hardware/fasteners |
| ST1 Stair and guard details | each run/landing, rise/run/count/width/headroom, stringers, attachments, landings, handrails and guards |
| CALC Structural design report | loads, tributary areas, member and connection checks, reactions, footing/lateral checks, exceptions |
| Schedules and quantities | members, connectors, footings, finishes, material quantity and priced estimate provenance |
| Review and submission record | source log, revision history, code checks, open conditions, professional authentication and municipal forms |

Municipal scope varies. Sidney's deck guide asks for a site plan, floor/foundation plan, cross-section, dimensions, footings, posts, structural sizes/spans, flashing, decking, guards, stairs, and handrails. Vancouver additionally asks for a vector PDF, coverage, elevations showing the deck relative to the house and finished grade, and structural professional documentation where applicable.

## What photos can and cannot establish

### Photos or LiDAR can support

- visible house and yard geometry;
- wall planes, corners, doors, windows, stairs, and obstacles;
- approximate or measured 3D surface capture;
- door-sill and platform relationships when scale and datum are controlled;
- visual confirmation and homeowner-friendly 3D context.

### They cannot safely establish alone

- legal property boundaries or easements;
- concealed framing, sheathing, ledger backing, flashing, or foundation condition;
- soil capacity, frost depth, utilities, drainage, or geotechnical conditions;
- exact site grade when vegetation/occlusion prevents capture;
- structural capacity and connection design;
- professional responsibility or authentication.

These become measurement tasks, document requests, exploratory-opening tasks, or professional-review items.

## AI and professional boundary

AI can bring a rough homeowner concept to a highly complete, AutoCAD-quality review set and can incorporate redlines rapidly. It can also prepare prescriptive designs where the project cleanly fits encoded rules. It cannot legally authenticate engineering work or make unknown field conditions true.

Documents issued for permitting that contain professional engineering must be authenticated by the responsible registered professional. The product's final stage should therefore be a structured professional-review workflow: the professional sees the model, evidence, calculations, rule provenance, and open conditions; applies redlines; and authenticates the final issue where required.

## Current implementation gap

- The active product is deterministic TypeScript, not an AI architect.
- Its existing AI/Cerebras implementation is disconnected legacy code tied to an older model.
- Current terrain is one number, not a surface.
- Framing remains heuristic. The active v2 model now creates keyed connection work packages with quantities, member interfaces, and coordinated gravity actions, but proprietary hardware, fasteners, lateral/uplift actions, and capacity checks remain professional design work.
- Elevations, sections, and details are diagrammatic and incomplete.
- The active canonical exporter now converts SVG paths and searchable text directly to fixed-size 17×11 PDF pages without a canvas or page-image intermediary. It also exports a millimetre model-space DXF with named property, architectural, framing, foundation, guard, stair, connection, and annotation layers from the same issue fingerprint.
- The active professional-review issue now includes a structured calculation contract and downloadable PDF booklet with transparent member demands, reactions, footing bearing screens, stair geometry, connection actions, sources, limitations, and unresolved review gates. It does not yet establish resistance for every member or connection; professional review is still required for the design content itself.
- The active plan set should stay labelled `Professional review — not for construction` until the model, analysis, drawing, and review pipeline above exists.

## Primary references

- Apple RoomPlan: https://developer.apple.com/augmented-reality/roomplan/
- Autodesk ReCap reality-capture process: https://help.autodesk.com/cloudhelp/ENU/Reality-Capture/files/Getting_Started/about_reality_capture.html
- Autodesk AutoCAD Automation API: https://aps.autodesk.com/automation-apis
- Autodesk AutoCAD Architecture drawing management: https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Architecture/files/GUID-D6713577-2537-49B1-BCAD-47C9779A48CA.htm
- BC Building Code 2024: https://www2.gov.bc.ca/gov/content/industry/construction-industry/building-codes-standards/bc-codes/2024-bc-codes
- Town of Sidney Residential Deck Construction Guide: https://www.sidney.ca/wp-content/uploads/Residential-Deck-Construction.pdf
- City of Vancouver deck checklist: https://vancouver.ca/files/cov/decks_RS_zones.pdf
- EGBC authentication guidance: https://www.egbc.ca/getmedia/bf1c2174-de3b-45b2-812f-cceb6958e1e8/EGBC-Authentication-of-Documents-V3-0.pdf
