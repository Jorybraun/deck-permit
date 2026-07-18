# Deck Permit — Product Reset Handoff

Last updated: 2026-07-18 (America/Vancouver)

This file is the compact source of truth for continuing the project. Read it before changing the application.

## 1. Product mission

Build a homeowner-first deck planning product that:

1. Identifies the property and makes the source/quality of property evidence explicit.
2. Helps the homeowner draw a real deck plan around the existing house.
3. Supports arbitrary platform outlines, multiple elevations, and stairs between sections.
4. Automatically proposes code-aware framing: joists, beams, posts, footings, guards, and stairs.
5. Produces a permit package and design documents that a qualified professional can review/sign where required.
6. Converts the finished project into a homeowner-approved brief and recommends relevant local builders.

The homeowner is the primary user. Builder recommendations are the marketplace/lead-generation outcome, not the main authoring interface.

This is not a contractor operations tool and should not pretend that an unverified automated design is stamped engineering.

## 2. Product decisions that must survive the reset

- The primary experience is a 2D architectural plan editor tied visibly to the existing house.
- 3D is optional downstream visualization. It must not be the main design interaction.
- There are no durable `rectangle`, `L-shape`, or `wrap` product modes. A platform is an editable closed polygon. Rectangles may exist only as drawing shortcuts.
- Placement is not a collection of offsets/dropdowns. Users draw and drag geometry against an explicit measured house wall and openings.
- A project may contain multiple deck platforms. Every platform has its own elevation.
- Stairs connect a platform to another platform or to grade and must be derived from the elevation difference.
- Framing and permit drawings must be derived from the same canonical design graph. Do not maintain a separate picture/model that can drift from the plans.
- Automatic framing is a proposal with visible assumptions and review status. The user or reviewer must be able to override it.
- Property, zoning, and bylaw claims require provenance, retrieval time, and a clear verified/assumed/manual status.
- Builder matching occurs after a useful design/permit brief exists and only with homeowner consent.
- Legacy UI/state may coexist only while the replacement is being wired. The user explicitly asked for obsolete legacy code to be deleted.

## 3. Intended homeowner workflow

The replacement workflow is five stages:

1. **Idea** — intended use, desired features, material preference, budget range, inspiration.
2. **Property** — address lookup, parcel/property evidence, measured house reference, doors/windows, grade assumptions, zoning/bylaw findings.
3. **Design** — draw/edit platforms, set elevations and finishes, add/derive stairs, generate/edit framing, resolve design issues.
4. **Permit** — drawing sheets, code/assumption schedule, forms, source evidence, professional review/sign-off status, package/export/submission readiness.
5. **Builders** — homeowner-approved project brief, local builder suggestions, qualification signals, consent-based introductions.

Avoid reintroducing the old eight-step wizard or asking for structural decisions before the user has created the spatial design.

## 4. Research and architecture documents

Read these before making product-level decisions:

- `docs/product-reset.md` — product reset and what to remove.
- `docs/deck-cad-product-architecture.md` — CAD/domain architecture and Chief Architect research.
- `docs/homeowner-marketplace-strategy.md` — homeowner-to-builder marketplace strategy.
- `docs/existing-conditions.md` — existing-condition evidence model.
- `docs/structural-review-package.md` — professional review boundary.
- `docs/permit-bundle.md` — permit package concepts.
- `docs/municipal-delivery.md` — delivery/submission concepts.
- `docs/professional-redlines.md` and `docs/review-exchange.md` — review workflow.

Chief Architect is the product-behaviour analogue: floor/deck regions, independent elevations, automatic stairs, automatic framing with manual edits, and model-derived documents. It is proprietary desktop software and not an embeddable browser authoring SDK. Its trial also restricts save/export. Do not base the implementation on embedding it.

Maker.js `0.19.2` is installed as the current 2D CAD geometry/DXF kernel. Keep it behind a domain adapter so it can be replaced later.

## 5. New canonical domain implemented

### Deck design

Files:

- `src/domain/deckDesign/types.ts`
- `src/domain/deckDesign/deckDesign.ts`
- `src/domain/deckDesign/deckDesign.test.ts`
- `src/domain/deckDesign/index.ts`

Implemented concepts:

- `DeckDesign` schema `deck-design/v1`.
- Arbitrary `ClosedBoundary` geometry with stable vertex IDs.
- Multiple `DeckPlatform` objects with independent elevations.
- Per-edge roles and platform finish/framing intent.
- Platform add, boundary update, move, rename, elevation, finish, framing intent, edge role, selection, and removal operations.
- `DeckStair` connecting platform/platform or platform/grade with exact Point A/Point B geometry.
- Point B selects direction/destination; deterministic stair geometry proposes the nearest legal rise/run/riser/tread combination. A short platform-to-platform landing extension is explicit, while a separation greater than 900 mm beyond a straight run requires an intermediate/extended platform.
- Stair width, stringer count, handrail sides, landing, and exact start/end geometry are canonical and editable.
- Cross-platform overlap/design assessment.
- Durable shape enums are intentionally absent.

### CAD kernel

File: `src/domain/cad/makerCadKernel.ts`

Implemented:

- Closed-boundary validation.
- Minimum area/edge checks.
- Self-crossing detection.
- Boundary overlap checks.
- Angled-edge warnings.
- Boundary extents.
- DXF export for boundaries.

### Site/house reference

Files:

- `src/domain/siteModel/types.ts`
- `src/domain/siteModel/siteModel.ts`
- `src/domain/siteModel/index.ts`

Implemented:

- `SiteModel` with a shared local coordinate system.
- Explicit measured/assumed design wall.
- Door/window openings on the wall.
- House depth and assessment.
- Property-derived initial site model.
- Municipal GIS alignment has independent 180° rotation and wall-direction correction controls; a confirmed correction survives later roofline-edge selection.

This replaces the conceptual legacy placement scalar. A platform should visually relate to this house reference.

## 6. New application state and persistence implemented

Files:

- `src/state/homeownerProjectStore.ts`
- `src/services/homeownerProjectPersistence.ts`

Implemented:

- New stages: `idea | property | design | permit | builders`.
- Homeowner intent, property, site model, canonical deck design.
- Typed actions for platform/stair/editing operations.
- Design undo/redo history.
- New local persistence schema `homeowner-project/v1`.

`src/App.tsx` and normal-project startup in `src/main.tsx` now use this store and `homeowner-project/v1` persistence. `src/state/store.ts` and `src/services/projectPersistence.ts` remain only as legacy migration residue used by old, currently unreachable modules.

## 7. New plan editor implemented and integrated

File: `src/components/design/DeckPlanEditor.tsx`

Current capabilities:

- Select and draw modes.
- Click/touch to draw arbitrary closed platform outlines.
- Natural 15° angle snapping by default; Alt allows a free angle.
- Drag a whole platform.
- Drag individual vertices.
- Pull any edge perpendicular to itself without losing its angle.
- Exact edge length, line-angle, and selected-corner interior-angle labels.
- Thresholded 5% wheel zoom, zoom controls, Pan tool, Space-drag, middle-drag, and fit commands that reset zoom/pan.
- Optional Photoshop-style smart rulers while dragging a corner: nearby platform vertices provide independent X/Y snapping, full-canvas alignment guides, ΔX/ΔY offsets, direct distance, and the reference corner label. Holding Alt suppresses the snap while keeping the ruler readout.
- SVG pointer coordinates use the inverse screen transform, so letterboxing no longer shifts clicks away from the cursor.
- The first drawing point becomes a small explicit close target only after three corners; nearby clicks remain available for distinct corners.
- Add Corner and Remove Corner modes; removal preserves the three-corner minimum and blocks deletion through an active stair opening.
- Independent platform elevation labels.
- Visible existing house, measured wall, and openings.
- Guided Point A/Point B stair placement to yard or another platform; B chooses a destination/direction and no longer forces the homeowner to solve a code-perfect run with the mouse.
- Stair plan rendering includes exact width/run, treads, longitudinal stringers, handrail edges, A/B endpoints, bottom landing or landing extension, and readable assembly callouts.
- Selecting a stair opens an inspector for total rise, step pitch, risers, treads, run, width, landing depth, stringers, handrails, and removal. Stair connections also appear in the object/layer list.
- A running geometry-aware CAD cost allowance stays in the lower canvas corner and expands into decking, framing, supports, guards, stairs, and hardware; it is explicitly a July 2026 regional concept range rather than a quote.
- Undo/redo controls.
- Pointer capture/touch handling.
- Empty-state action for the first platform.

The component follows the correct ownership boundary: it receives typed view data and emits typed intents; it does not own persistent project state.

The running browser now renders the five-stage homeowner application and makes this editor the primary Design surface. Live browser verification on 2026-07-18 confirmed drafting controls, controlled zoom, Pan mode, remove-corner handles, Point A/B stair schedules, editable landing/stringer/handrail intent, and the expandable running estimate. Direct browser pointer-drag coverage remains.

## 7A. Framing and coordinated plan-set implementation

Implemented canonical `FramingDesign` persistence, stale-input fingerprinting, deterministic joist/beam/ledger/post/footing/guard/stringer generation, review gates, and a real framing-plan preview. The graph intentionally marks irregular/out-of-scope systems `engineering-required` rather than inventing a pass.

`src/services/canonicalPlanSet.ts` now generates seven coordinated 1700×1100 (11×17 landscape) SVG sheets directly from `Property`, `SiteModel`, `DeckDesign`, and `FramingDesign`: A0.0, A1.0, S1.0, A2.0, S2.0, A3.0, and S3.0. Every sheet carries one issue fingerprint, a review/not-for-construction warning, and a blank professional seal box. The Permit stage now has a full-screen in-app sheet viewer that fits the complete 17:11 sheet before zooming, plus a fixed-media-box PDF download. `src/services/vectorPlanPdf.ts` rasterizes the canonical SVGs at 150 dpi and embeds one complete image into each 1224×792 point PDF page so browser portrait-print defaults cannot crop the right-side schedules. Strict SVG parsing, PDF page count, and ledger page dimensions are covered by tests.

The product architecture is hybrid: deterministic CAD/rule/calculation code owns geometry and traceable checks; the AI agent researches jurisdictions, asks for missing evidence, proposes alternatives, and invokes constrained design tools. AI must not freehand structural geometry or represent itself as the registered professional.

## 8. Runtime truth at handoff

The application currently contains two parallel worlds:

### New reset code

- Canonical platform/stair design graph.
- Site/house reference model.
- Homeowner project store/persistence.
- Plan-first deck editor.

### Legacy code still present but not active in the homeowner application

- `src/main.tsx` still imports `ReviewerPortal` for tokenized review links; that route must be deliberately migrated or isolated before deleting its dependencies.
- `src/state/store.ts` — old monolithic `Deck` state.
- `src/types/index.ts` — old shape/placement/layout types mixed with reusable property/permit types.
- `src/components/DeckModel3D.tsx` and old 3D-first design surfaces.
- `src/components/FootprintSketchEditor.tsx`.
- `src/components/SitePlacementPanel.tsx`.
- `src/components/DesignControls.tsx`.
- `src/components/ModelProperties.tsx`.
- `src/components/FramingLayoutPanel.tsx`.
- `src/components/steps/*` old wizard steps.
- Legacy sizing/layout/placement services and tests.

Do not delete shared permit/property/review services blindly. First move them to inputs derived from the new domain, then delete only obsolete design/wizard code.

There is no useful Git status baseline in this workspace; it may not be a Git repository. Treat every existing file as user work and use narrow patches.

## 9. Verification baseline

Verified on 2026-07-18:

```text
npm run lint
  PASS — TypeScript noEmit

npm test
  PASS — 35 test files, 115 tests

npm run build
  PASS — Vite production build
```

Build warnings remain for bundles larger than 500 kB. The largest legacy chunks include the Three.js model and main application. This is expected until the 3D-first legacy path is removed or isolated.

## 10. Exact continuation sequence

### Phase A — switch the shell to the homeowner workflow (completed 2026-07-18)

1. Create a new homeowner app shell with the five stages.
2. Add small stage components:
   - `IdeaStage`
   - `PropertyStage`
   - `DesignStage`
   - `PermitStage`
   - `BuildersStage`
3. Make the plan editor the dominant surface in `DesignStage`.
4. Add a properties panel for the selected platform:
   - name
   - exact elevation
   - finish/material
   - framing direction/intent
   - per-edge attachment/guard/open/stair roles
5. Add an explicit stair command that chooses from/to endpoints and then lets the user place/orient it.
6. Wire `src/App.tsx` to `useHomeownerProject`.
7. Wire `src/main.tsx` to `homeownerProjectPersistence`.
8. Preserve the reviewer portal only if it still compiles against a deliberately isolated legacy boundary; otherwise temporarily remove its route and restore it against the new permit graph later.

Acceptance check: a homeowner can open the app, establish the house reference, draw two non-rectangular platforms at different elevations, move/edit them, add a stair, reload, and recover the design.

### Phase B — make drawing interaction trustworthy

1. Add `DeckPlanEditor` tests for draw, select, vertex drag, edge pull, whole-platform drag, undo, and invalid geometry.
2. Test mouse and touch/pointer behaviour in the actual browser.
3. Add zoom/pan and a reliable fit-to-project command. (Implemented; direct pointer-drag browser regression coverage remains.)
4. Add typed numeric dimension editing; dragging alone is not CAD-grade.
5. Add snapping to house corners/openings/platform vertices/edges.
6. Show selected edge intent and attachment state.
7. Make invalid edits preview as errors instead of committing them.
8. Add explicit site calibration/measurement status so the house is never presented as known when it is merely inferred.

### Phase C — framing graph and code-aware proposal

Create a new framing domain rather than adapting the legacy rectangle calculator in place.

Recommended canonical objects:

- joist runs with section, spacing, span, bearing endpoints, cantilever, source table/rule
- beams with ply/section, tributary width, supports, splice rules
- posts with coordinates, height, section, beam connection
- footings with coordinates, diameter/size, depth, soil assumption
- ledgers or freestanding support lines
- guards/handrails tied to exposed edges
- stair stringers, landings, guards, and handrails
- warnings/assumptions/review requirements attached to every generated decision

Generation flow:

1. Classify platform edges and house attachment.
2. Choose joist direction from geometry and attachment intent.
3. Partition irregular polygons into buildable framing regions.
4. Generate joists clipped to regions/openings.
5. Select beam/support lines and place posts.
6. Size members from jurisdiction/versioned span rules and recorded loads.
7. Re-run after geometry/elevation/edge changes.
8. Preserve user overrides and mark stale overrides when dependencies change.

Never label this as approved engineering. Surface the code edition, municipal assumptions, data provenance, and professional review boundary.

### Phase D — model-derived permit documents

Refactor the existing plan/PDF/bundle pipeline to consume `SiteModel + DeckDesign + FramingDesign`.

Minimum sheet/package set:

- cover/project information and scope
- site plan with parcel/building/deck/setbacks and evidence status
- dimensioned deck/floor plan
- framing plan with joists, beams, posts, footings, ledger/attachments
- elevations for relevant sides
- sections through house attachment, beams/posts/footings, guards, and stairs
- stair/guard/handrail details
- general notes, materials, loads, code references, assumptions
- zoning/bylaw findings with sources
- application forms/checklist
- professional review/sign-off status
- submission manifest and exported source/evidence files

Every drawing dimension and schedule should be generated from the canonical graph. Do not take measurements from a rendered SVG or 3D scene.

### Phase E — builder marketplace

1. Generate a concise builder brief from the homeowner-approved project.
2. Include location at an appropriate privacy level, platform areas/elevations, materials, stairs/rails, permit status, target timing, and budget band.
3. Ask for explicit consent before sharing address/contact details.
4. Rank builders using service area, project type, licensing/insurance evidence, permit experience, availability, and homeowner preferences.
5. Present why each builder is suggested and distinguish verified facts from self-reported claims.
6. Do not fabricate live builder availability or endorsements when no provider is integrated.

## 11. Legacy deletion plan

Delete obsolete code only after its replacement path is active and verified.

Likely deletion candidates after the new shell works:

- old shape/placement/layout UI and step components
- `DeckModel3D.tsx` if no longer used; otherwise move it to an optional preview boundary
- old deck shape presets as durable state
- old site placement calculations
- old rectangle/L-shape/wrap deck layout services
- old monolithic deck store fields/actions
- tests that only assert removed legacy behaviour
- unused Three.js dependencies after confirming no optional preview remains

Potentially reusable and requiring migration rather than deletion:

- property lookup/provider registry
- zoning/research/evidence services
- existing conditions verification
- CWC span table data
- compliance and structural review concepts
- PDF/plan-set generation infrastructure
- permit bundle/application/submission services
- professional redline/review exchange services

Use `rg` to prove each candidate has no consumers before deleting it.

## 12. Known risks and open decisions

- Municipal GIS can fail to return a parcel for a valid-looking address. The property stage needs fallback geocoding, candidate selection, manual parcel confirmation, and honest evidence status.
- The existing house geometry may be inferred from municipal data, manually measured, uploaded, or traced. The UI must say which one it is; never imply a generic rectangle is the actual house.
- Maker.js is useful for 2D geometry/DXF but is not a complete architectural editor or constraint solver.
- Arbitrary polygons make automatic framing materially harder; the framing engine should explicitly partition regions rather than silently assuming rectangles.
- Structural code/rules are jurisdiction- and edition-specific and high stakes. Store rule provenance and require review where necessary.
- Permit submission portals vary and may not have APIs. Package automation and browser-assisted submission should remain separate capabilities.
- A professional reviewer needs redlines and stable object IDs so design changes can be diffed without losing decisions.
- The plan editor supports fit-to-property/deck, zoom, pan, angle snapping, and direct corner editing; typed geometric constraints remain future work.
- Builder matching is a trust product. Privacy, consent, verification, and explanation are part of the core UX.

## 13. Working commands

```bash
npm run dev
npm run lint
npm test
npm run build
```

Before handing off again, report:

- which workflow is active in `App.tsx`
- which persistence schema is active in `main.tsx`
- whether legacy design/store code is still reachable
- exact test/build results
- any unverified browser interactions

## 14. Definition of the next meaningful milestone

The next milestone is not “a nicer 3D model.” It is:

> A homeowner can identify/confirm the house reference, draw and precisely edit multiple arbitrary deck platforms around it, give each platform an elevation, connect them with stairs, save/reload the project, and clearly understand which inputs are measured, inferred, or still required.

Once that works, build the framing proposal and permit documents from the same graph.

## 15. July 18 implementation checkpoint

The homeowner workflow is active in `src/App.tsx`; normal startup uses the homeowner persistence schema. The old 3D/shape-preset workflow is not part of the normal UI, though the reviewer route and unreachable legacy files still need an evidence-based deletion pass.

Completed and browser-verified:

- BC address type-ahead displays ranked civic-address candidates and match scores.
- Address options select on pointer-down before the surrounding combobox can lose focus. Live verification selected `2423 Lovell Ave, Sidney, BC` and resolved Town of Sidney parcel `007-952-449`, zone `R2`, area `465 m²`.
- Once an exact civic-number match exists, generic street-only fallback suggestions are hidden.
- Selected yard stairs expose direct `W` handles for clear width and a rotation handle around Point A. The exact inspector also provides width presets/range, plan-direction input/range, and ±15° actions; widening recomputes the preliminary stringer count. Live verification changed the stair from 900 mm/90°/3 stringers to 1500 mm/105°/5 stringers.
- The running estimate now says `Regional model · not live supplier pricing`, exposes every unit-rate basis, the installed-cost multiplier, exclusions, and Home Depot Canada calibration links. It remains a concept allowance until a generated member/product takeoff can be priced by SKU and location.
- Selecting `1364 W 11th Ave, Vancouver, BC` resolves against the official City of Vancouver property-parcel dataset rather than failing on the ParcelMap BC coverage gap.
- Vancouver site polygons sharing the same assessment tax coordinate are grouped into one visible property envelope; the City 2015 footprint layer is queried separately and labeled as reference evidence.
- The property plan always renders available parcel lines even if a house footprint is unavailable.
- The design inspector includes platform drawing-order layers, independent elevations, exact edge lengths, corner insertion, and explicit clarification that shape corners are not posts.
- Stair setup supports a source platform edge, a destination platform edge or grade, and a requested riser count. Domain validation rejects counts that would create risers outside 125–200 mm.
- Platform layer reorder and undo were exercised in the live UI; the change was undone afterward.

Validation at this checkpoint:

- `npm run lint`: passed
- `npm test -- --run`: 34 files, 112 tests passed
- `npm run build`: passed; main JS bundle 520.29 kB (159.30 kB gzip)

Important next work:

1. Replace jurisdiction-specific zoning shortcuts with versioned, cited rule profiles; Vancouver currently shows zoning as unresolved rather than blocking parcel evidence.
2. Add measured/uploaded/traced house-geometry recovery for jurisdictions with no current footprint.
3. Put the AI copilot above constrained property/design/framing tools so it can research, ask for missing facts, and propose options without inventing structural geometry.
4. Add professional redlines, reviewer decisions, stable object revisions, and final issue/signing workflow around the canonical seven-sheet review set.
5. Prove and remove unreachable legacy UI, old shape-preset logic, and Three.js dependencies without deleting shared permit/review services still in use.

### Direct spatial editing follow-up

The live design editor now defaults to `Fit property` and always draws the municipal parcel behind the deck. If the homeowner has not selected a house edge, `projectPropertyToLocal` uses the primary building's longest edge only as a visibly labeled provisional coordinate frame; it never calls that edge confirmed. A prominent `Choose the correct house edge` action returns to Property for explicit alignment.

The canvas toolbar now provides:

- `Draw platform`: each click adds a corner; Enter or the first point closes the platform.
- `Add corner`: clicking any existing platform edge inserts a new draggable shape node at that location.
- `Connect stairs`: click a source platform edge, then a destination edge on a different platform; or choose `Connect to grade`. Automatic riser count derives from the elevation difference. The inspector still supports an explicit requested riser count and rejects unsafe geometry.

Browser verification inserted two corners directly on a live platform, observed the corner count change, then undid both mutations back to the original six-corner platform. Stair mode selected a source edge, exposed the destination/grade action, and cancelled cleanly with Escape. Property context was visually verified against the live Vancouver site.

Validation after this follow-up: 30 test files / 93 tests passed, TypeScript passed, and the production build passed (422.85 kB JS; 130.66 kB gzip).

### Property orientation correction

Municipal polygon traversal can make a wall-local coordinate frame feel mirrored relative to the homeowner's mental map. `HouseWallReference` now persists two non-destructive alignment flags: `reverseDirection` and `invertOutward`. They affect only the GIS-to-deck projection; source parcel/building coordinates and deck geometry remain unchanged.

The plan canvas exposes `Rotate property 180°` and `Mirror left/right`, and labels `HOUSE EXTERIOR / DECK SIDE`. The 180° correction was applied to the live Vancouver project after the homeowner reported both the yard side and sides felt reversed. New projection tests prove mirroring and rotation transform only local context. Validation: 30 files / 94 tests, TypeScript, and production build all passed.
