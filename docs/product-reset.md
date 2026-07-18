# Product reset: from permit wizard to architectural deck workspace

Decision date: 2026-07-18

## Product thesis

The useful product is not an eight-step form wizard and not a 3D deck picture. It is a homeowner-friendly architectural and permit workspace that coordinates six hard things:

1. trusted existing property/house/terrain conditions;
2. free but dimensionally precise multi-platform deck design;
3. automatic, code-aware framing options with explicit limits;
4. professional construction drawings and review;
5. current municipal application packaging and delivery;
6. consented matching to suitable local builders using a portable project brief.

The primary design view is a top-down plan. 3D, site, framing, elevations, sections, schedules, permit forms and builder scope are views of the same model.

## What Chief Architect teaches us

Chief Architect treats a deck as a bounded `Deck room`, which creates a floor platform. Per-room floor elevations enable multi-level decks. Its stair tool connects floor platforms at different heights or connects a platform to terrain. Its deck framing system generates planking, joists, beams, posts, and footings from settings and places those object categories on separate layers. Users can rebuild the automatic result or stop regeneration and edit individual framing members.

That is the correct interaction and object model for this app. We should copy the architecture pattern, not the visual styling or proprietary implementation.

Chief Architect remains a useful professional handoff target through layered DXF/DWG, but it cannot be the embedded web engine: it is a desktop product, the trial cannot save/export, and there is no documented web authoring SDK. It is also explicit that its deck framing is not an engineering/load-calculation system.

Official references:

- [Decks](https://www.chiefarchitect.com/support/category/226/decks.html)
- [Automatic deck planking and framing](https://www.chiefarchitect.com/support/article/KB-00794/customizing-deck-planking-and-framing-automatically.html)
- [Manual deck-framing edits and engineering limitation](https://www.chiefarchitect.com/support/article/KB-01245/manually-modifying-deck-framing.html)
- [Stairs between floor platforms](https://www.chiefarchitect.com/support/article/KB-00846/creating-stairs-between-floor-platforms-located-on-the-same-floor-level.html)
- [CAD details from model views](https://www.chiefarchitect.com/support/article/KB-00766/creating-cad-details.html)
- [DWG/DXF exchange](https://www.chiefarchitect.com/support/article/KB-00013/converting-plan-files-to-dwg-or-dxf.html)
- [Trial limitations](https://www.chiefarchitect.com/products/trial.html)

## Keep

These existing capabilities solve real project risks and survive the reset:

- address normalization and authoritative parcel/property evidence;
- zoning/setback/coverage research with source attribution;
- explicit existing-house measurement/evidence status;
- versioned CWC span-table selections and transparent load traces;
- fail-closed professional checklist, redlines, revision fingerprints, and review evidence;
- vector sheet/PDF generation, controlled drawing issues, application data, permit bundle validation, and delivery receipts;
- the agent command channel, provided it invokes the same model transactions as direct manipulation.

## Remove from primary UX

- `Deck Style` and preset-card selection;
- `Rectangle / L-shape / Wraparound` as durable design state;
- global width/depth as the definition of deck geometry;
- a single `houseWall + wallStartOffset` placement control;
- 3D orbit controls as the first design experience;
- separate “Structure” and “Code Check” wizard pages that hide the relationship between an edit and its consequence;
- material/railing choices floating over an unlocated 3D model;
- one shared beam-offset array and one shared post-station array for the entire project;
- claims of readiness based on generic geometry or unverified GIS context.

The old fields remain only in a migration adapter until saved projects have been converted to platforms and member objects.

## Rebuild

### Project navigator

Use four persistent project areas instead of eight sequential pages:

1. **Existing conditions** — property, survey/evidence, house walls/openings, terrain and zoning envelope.
2. **Design** — platforms, elevations, edges, stairs, assemblies and optional 3D preview.
3. **Framing** — generated alternatives, member editing, checks, calculations and unresolved professional work.
4. **Documents** — sheets, evidence, review/redlines, application, package and municipal delivery.

### Workspace

The center canvas is a CAD plan with contextual modes:

- Draw platform
- Edit boundary
- Set elevation
- Add stairs
- Generate framing
- Edit supports
- Dimension / annotate

The left side is a small project/object tree. The right side is the selected object's properties and check results. The agent is a collapsible command palette/chat, not a competing third column.

### Architectural state

Replace `Deck` as one shape with:

```text
DeckProject
  existingContext
  terrainSurface
  platforms[]
  platformEdges[]
  verticalConnections[]
  framingMembers[]
  assemblies[]
  annotations[]
  drawingViews[]
```

Each object has a stable ID, local construction coordinates, evidence/status where applicable, and dependency links. Derived models and documents store a source fingerprint rather than copied mutable geometry.

### Editing transaction

Every UI gesture and agent action issues the same command:

```text
Command -> validate geometry -> update project graph -> regenerate affected framing
        -> run checks -> invalidate stale drawings/review -> add undo transaction
```

This avoids separate chat state, form state, canvas state, and drawing state disagreeing.

## Delivery order

1. Introduce the multi-platform project graph and migrate the current rectangular deck into one platform.
2. Replace the wizard navigation and make the plan workspace primary.
3. Add platform draw/edit/elevation tools and automatic stairs between selected elevations.
4. Generate framing per platform with stable member objects, then allow checked manual editing.
5. Regenerate sections/elevations/sheets from the graph and export layered DXF for Chief Architect/AutoCAD handoff.
6. Reconnect professional review and municipal submission to the new immutable project fingerprint.

Until steps 1–4 are complete, the existing generator should be labelled a legacy prototype rather than presented as the intended designer.
