# Deck design, drawing, and permit architecture

Status: product and technical direction, 2026-07-18

## Decision

The application will be **2D-plan first**. A dimensioned local-coordinate drawing is the source of truth. The 3D model is a derived preview used only after the plan is coherent; it is never the place where users are expected to locate the house, establish setbacks, or author construction geometry.

The editor is not a general-purpose AutoCAD clone. It is a constrained architectural deck-design tool with a small command vocabulary:

- establish the verified house wall and important openings;
- draw or dimension one or more connected deck platforms;
- locate stairs and keep-out zones;
- accept an automatically generated framing solution;
- drag or dimension beams, posts, and footings while continuous checks protect the load path;
- compile the same model into permit sheets, schedules, calculations, and CAD exchange files.

## Architectural product reference

[Chief Architect's deck workflow](https://www.chiefarchitect.com/support/category/226/decks.html) is the closest product analogue. It models a deck as an architectural room/floor platform, not as a “rectangle,” “L-shape,” or “wraparound” preset. Its official documentation shows the pattern we should adopt:

- bounded deck rooms generate floor platforms;
- each room/platform can have its own floor elevation, enabling multi-level decks;
- stairs can be generated between adjacent platforms at different elevations or from a platform to terrain;
- joists, beams, posts, footings, and planking are automatically generated from platform settings;
- framing categories live on separate display layers;
- automatic framing can be rebuilt from edited parameters, then individual members can be manually edited;
- plan, elevation, section, CAD detail, schedule, material-list, and layout views are derived from the project model.

Chief Architect is a desktop product and no supported embeddable web-authoring SDK is documented. Its trial also disables saving, printing, and exporting. It is therefore our workflow/model reference and a possible professional handoff target through DXF/DWG—not the engine inside the web app. Chief Architect also explicitly states that it does not calculate structural loads, so our traceable structural/code layer remains necessary.

## Property imagery and GIS alignment

The Property stage combines independent sources without confusing their authority:

1. Geocode the homeowner-entered address to a coordinate candidate.
2. Retrieve the municipal parcel and roofline/building geometry as GeoJSON.
3. Display municipal geometry over Google satellite/aerial imagery for visual confirmation.
4. Reproject the selected parcel, roofline, and house wall into local millimetre coordinates.
5. Let the homeowner identify the correct building, attachment wall, doors, grade direction, and obvious conflicts.
6. Record field measurements separately and use those—not image pixels—as construction dimensions.

Google Maps is a visual base layer only. Municipal GIS remains the cited parcel/roofline source, while a legal survey or field measurement remains the permit and construction authority. Google Maps Platform terms restrict tracing or copying Google building outlines into a new dataset, so the application must overlay independently sourced GIS geometry instead of deriving durable geometry from Google imagery.

The Maps JavaScript API Data layer supports GeoJSON overlays. Satellite context can come from the Maps JavaScript API or Map Tiles API; both require a secured Google Cloud API key and billing. Photorealistic 3D Tiles may later support visual review, but must not become the canonical house model.

## Additional interaction references

- **SketchUp deck workflow:** begin against the existing house, model repeatable construction components, detect clashes, count materials, create plan/section scenes, and publish sheets from the model. Our product automates those deck-specific steps instead of exposing a general-purpose modeller.
- **Lowe's Deck Designer:** offer inspiration, sample starting points, or direct drawing; finish with a saved project, cost estimate, rendering, materials list, building plans, and contractor sharing. Our differentiation is freeform multi-level geometry, source-backed property evidence, jurisdiction-aware framing, professional review, and permit delivery.

The core interaction should feel like a constrained push/pull modelling workflow: draw regions, pull edges, move vertices, type exact dimensions, change elevation, connect stairs, inspect framing, and derive every view and document from the same objects.

## CAD technology decision

There is no mature open-source JavaScript component that can be dropped in as “AutoCAD for decks.” The available products fall into distinct layers:

| Technology | What it provides | Role in this product |
| --- | --- | --- |
| [Maker.js](https://maker.js.org/) | Browser-compatible 2D parametric geometry, paths, models, intersections, layers, and DXF/SVG/PDF export | Recommended open 2D geometry/export kernel behind the deck-specific editor |
| [replicad](https://replicad.xyz/) / [OpenCascade.js](https://ocjs.org/) | Browser CAD solid modeling and STEP-capable B-rep geometry | Optional derived 3D/STEP output after the 2D structural model passes |
| [web-ifc](https://thatopen.github.io/engine_web-ifc/docs/) | Browser IFC read/write | Later BIM exchange, not the primary editor |
| [ODA Drawings inWEB](https://www.opendesign.com/products/drawings) | Commercial web DWG/DXF creation, editing, dimensions, grips, constraints, and saving | Enterprise alternative when native DWG authoring justifies its licence and integration cost |
| [Autodesk Platform Services](https://aps.autodesk.com/developer/documentation/) | Viewing, translation, and cloud automation for Autodesk file workflows | Downstream interoperability/automation; not the product's primary sketch interaction |

The recommended first implementation is Maker.js behind an internal CAD adapter. The adapter keeps the domain model independent, so ODA Drawings inWEB can later replace the drawing surface without replacing the framing, code, drawing, or permit engines.

## One coordinated source of truth

All geometry uses millimetres in a right-handed local coordinate system:

- origin: selected start of the verified house attachment wall;
- +X: along the house wall;
- +Y: outward from the house;
- +Z: upward from the local grade datum.

GIS coordinates are used only to transform the local model onto the site plan. Parcel/roofline GIS does not silently become survey-grade house geometry.

```text
ProjectModel
  site
    legal parcel, terrain/grade surface, setbacks, easements, coverage, north, datum
    evidence source and verification status for every field
  existingHouse
    measured wall segments, openings, sill/grade elevations, substrate, utilities
  deckPlatforms[]
    platform ID, closed boundary, elevation, floor assembly and edge conditions
    holes/keep-outs, openings and host constraints to house/platform edges
  verticalConnections[]
    stair/landing/ramp IDs, start and end platform/terrain, path, width and geometry
  framingSolution
    per-platform ledger or freestanding supports, joists, blocking, beams, posts, footings
    headers and transfer conditions where platforms/openings meet
    member IDs, coordinates, spans, tributary loads, status and calculation trace
  assemblies
    decking, guards, stairs, connections, flashing, drainage, durability
  drawingIssue
    revision, immutable model fingerprint, sheets, evidence, review and seal records
  permitApplication
    owner/applicant data, description, value, authorization and delivery receipt
```

Every derived line on a drawing must resolve to a model object ID. Moving a platform edge, changing an elevation, adding stairs, or moving a post changes dependent geometry and load paths, invalidates stale calculations and professional approval, and regenerates affected dimensions, schedules, sheets, and exports.

### Platform model

```ts
interface DeckPlatform {
  id: string;
  name: string;
  boundary: ClosedCadLoop;        // local X/Y millimetres
  elevationMm: number;            // top of decking from project datum
  floorAssemblyId: string;
  edgeConditions: PlatformEdge[]; // house-hosted, open, guard, stair, shared
  framingSettings: {
    joistDirection: 'auto' | number;
    joistSpacingMm: number;
    supportStrategy: 'auto' | 'ledger' | 'freestanding';
  };
}

interface VerticalConnection {
  id: string;
  type: 'stair' | 'landing' | 'ramp';
  from: PlatformOrTerrainReference;
  to: PlatformOrTerrainReference;
  path: CadLine;
  widthMm: number;
  generatedGeometry: StairGeometry;
}
```

“Placement” is not an editable scalar. Platform edges are constrained to measured house edges or dimensioned from the shared project origin. “Shape” is not durable state. It is only a quick-start command that creates platform boundaries, after which the boundary is ordinary editable geometry.

## User workflow

### 1. Establish the property and house

The address lookup retrieves municipal context, but the user must confirm the actual project location. The site workspace shows the parcel, house reference, selected wall, and evidence status. A field-measured wall or accepted survey can replace the municipal reference without changing deck coordinates.

Required facts:

- civic address, PID, legal description, zoning, frontage and yard orientation;
- legal parcel dimensions, easements/covenants, setbacks and allowed lot coverage;
- house wall start/end, wall face, cladding and rim/band construction;
- door/window offsets and widths, door threshold, grade/elevations and utilities;
- whether a ledger attachment is feasible or the deck must be freestanding.

### 2. Draw deck platforms

The user works in a top-down plan that always shows the verified house wall and openings. The minimum interaction set is:

- click/tap to place orthogonal platform corners;
- preview the next segment and close the polygon explicitly;
- snap to house endpoints, openings, grid, existing vertices, parallel/perpendicular lines;
- enter exact segment length or offset at any time;
- drag vertices/edges with visible constraint feedback;
- add/remove vertices, undo/redo, pan/zoom and fit;
- show overall and segment dimensions, area, boundary distances, and unresolved geometry;
- split or add a platform and assign its walking-surface elevation;
- connect platforms or terrain by clicking a stair start and destination.

A platform cannot proceed to structural design when its boundary is open, self-intersecting, outside the permitted envelope, or missing its vertical datum. Platforms cannot overlap at the same elevation unless the overlap is explicitly resolved as a shared/merged platform. Concave and multi-level decks are permitted in the model, but unsupported framing/topology routes to professional design instead of receiving a false prescriptive pass.

### 3. Generate a framing solution

The framing engine proposes rather than merely draws:

1. determine attached versus freestanding support topology for each platform and shared edge;
2. enumerate viable joist directions and spans for every platform region;
3. select joist size/spacing from the encoded, versioned span-table scope;
4. place beam lines to keep joist spans and cantilevers within scope;
5. select beam size and solve post stations to satisfy beam spans and practical edge overhangs;
6. place footings and calculate reactions/required bearing area;
7. trim framing around stairs, platform transitions, and openings with headers/trimmers;
8. add rim boards, blocking, hardware placeholders, guards, bracing and load-path review items;
9. rank alternatives by number of footings, material quantity, ledger risk and constructability.

The result should read as an option, for example: “Option A — attached, joists perpendicular to house, one exterior beam, four footings.” A user can choose a different viable option.

### 4. Edit framing safely

Posts, beams, stairs and openings have direct plan handles and exact coordinate fields. Edits trigger the solver immediately:

- green: encoded table and geometry checks pass;
- amber: buildable geometry, but professional selection/evidence is still required;
- red: invalid load path or exceeded scope; permit issue is blocked.

The UI never claims “to code” for connections, soil, guards, stairs, lateral resistance, ledger substrate or envelope details that have not been designed and verified. A qualified professional resolves and accepts these items for the exact drawing revision.

Implemented opening coordination treats recorded doors and windows as first-class constraints. Platform surfaces, door thresholds, window sill zones, and preliminary ledger depth are compared in the canonical wall coordinate system. Conflicts block permit progression; photo-only geometry and conditions such as egress use, glazing, door swing, guards, headers, and envelope integration remain explicit review work packages.

### 5. Specify buildable assemblies

The user or professional selects:

- lumber species/grade/treatment and service condition;
- decking product, thickness, orientation, spacing and fastening;
- joists, beams, posts, footings and concrete/soil assumptions;
- ledger or freestanding connection strategy, hangers/caps/bases and corrosion compatibility;
- guard system, tested/engineered attachment, height and openings;
- stair width, rise/run, landings, handrails, guards, stringers and connections;
- flashing, water-resistive barrier integration, drainage and door-sill clearance.

Manufacturer-specific systems carry their product data and installation evidence into the permit package.

## What Sidney requires

The Town of Sidney's [Guide to Residential Deck Construction](https://www.sidney.ca/wp-content/uploads/Residential-Deck-Construction.pdf) says a permit is required for a new deck and structural/guard/railing changes. It calls for an owner-signed application, processing fee, and two construction drawing sets. The drawings must be to scale (minimum 11×17), dimensioned, and include a site plan, floor/foundation plan, and cross-section. The guide specifically calls for footings, post sizes and spacing, structural sizes and spans, house flashing, decking, guards, stairs and handrails. It also identifies footing/foundation, framing, and final inspections.

The current [residential building permit application](https://sidney.ca/wp-content/uploads/Residential-BP-Application.pdf) captures civic address, PID/legal description, owner and applicant, project description/use, construction value, signatures and authorization. The submission step must use current Town forms and re-check the Town's [building-permit page](https://www.sidney.ca/planning-building/building-renovations-and-development/building-permits-and-inspections/) at issue time rather than treating a cached checklist as permanent.

## Professional blueprint package

The drawing compiler produces, at minimum:

| Sheet | Content |
| --- | --- |
| G0.0 | Cover, project/code data, drawing index, design basis, limitations, issue/revision and professional blocks |
| A1.0 | Site plan: property lines, house and proposed deck, north, dimensions, setbacks, easements, coverage, stairs/landings, grades and evidence notes |
| A2.0 | Deck/floor plan: closed perimeter, openings, doors, stairs, guards, decking, overall and segment dimensions |
| S1.0 | Foundation/framing plan: ledger/support topology, joists, beams, posts, footings, headers, blocking, coordinates, spans and member IDs |
| S2.0 | Sections/elevations: height/grade, footings, posts, beams, joists, decking, house interface, guards, stairs and landings |
| S3.0 | Details and schedules: connections, flashing, hardware, durability, guard/stair assemblies and unresolved selections |
| S4.0 | Calculation and design-basis report: loads, table traces, reactions, footing screen, assumptions, exclusions and review gates |

Output formats:

- vector PDF sheets at the declared paper size and scale;
- DXF model space plus paper-space/title-block metadata where supported;
- SVG previews generated from the same model;
- JSON project model and immutable manifest;
- optional STEP/IFC derived exchange;
- application/evidence/review package and delivery receipt.

## Permit-readiness gates

The application may assemble a draft package at any time, but “permit ready” is blocked until the applicable items are complete:

- legal site evidence and yard/setback interpretation accepted;
- house, wall, openings, grades and utilities field-verified;
- footprint and all structural coordinates dimensioned;
- gravity framing within encoded scope or engineered;
- soil/frost/footings, connections, lateral load path and ledger substrate resolved;
- guards, stairs, handrails, landings and envelope details resolved;
- current municipal application, owner authorization, fees and project-specific requirements confirmed;
- qualified reviewer has accepted the exact immutable drawing revision and supplied any required seal/signature;
- package validator confirms sheets, scale, IDs, fingerprints, evidence and attachments agree.

The software prepares and coordinates professional work. It cannot promise that an architect or engineer will sign a design, and it must never reuse an approval after geometry, loads, assemblies, evidence, or calculations change.

## Implementation sequence

1. Introduce versioned local `DeckOutline` vertices/segments and a CAD adapter; migrate rectangles and L-shapes without losing existing projects.
2. Make `Deck Plan` the default design workspace and demote 3D to an optional preview.
3. Implement constrained outline commands, exact dimensions, snapping, self-intersection/closure checks, and undo/redo.
4. Replace shared beam/post arrays with member objects and stable IDs; implement framing-option generation for rectangular attached/freestanding decks first.
5. Add safe direct manipulation and deterministic recalculation/invalidation.
6. Compile A2.0/S1.0 from model objects, then migrate the remaining drawing sheets.
7. Add DXF export through the CAD adapter; evaluate ODA only if native DWG editing is a confirmed commercial requirement.
8. Expand solver scope deliberately (concave shapes, headers, multi-level decks) and route everything else to engineering-required.
