# Layered CAD professional handoff

The permit workspace exports a model-space DXF from the same canonical property, site, deck, stair, framing, foundation, guard, and structural-connection graph used by the fifteen-sheet-minimum PDF set. The exchange is not a traced picture and does not create a second editable source of truth.

## Coordinate and issue control

- units are millimetres (`$INSUNITS = 4`);
- the selected house wall is the local X axis and the confirmed yard-facing direction is local Y;
- municipal parcel and building geometry are aligned by the same independently sourced GIS transformation used on A1.0;
- every export carries the canonical `DP-…` design fingerprint as non-plot annotation;
- export time does not change design identity;
- the file remains labelled `Professional review — not for construction`.

## Named layers

The exchange separates site/property reference, existing building and openings, platform edges, stairs, guards, grade observations, joists, beams, ledgers, posts, footings, stair headers/stringers, connection keys, stable member annotations, and non-plot issue control. This lets a professional isolate and restyle the model in AutoCAD, Chief Architect, or another DXF-capable authoring system without redrawing the homeowner concept.

Stable member and connection IDs match the schedules and tags on S1.0, S2.0, and A4.0. Unverified field geometry and unresolved hardware/capacity remain explicit warnings rather than implied approval.

## Professional boundary

DXF interoperability improves drafting and review efficiency; it does not authenticate the model, resolve concealed conditions, or establish connector/member capacity. A qualified reviewer must validate the geometry, complete required design work, and issue the accepted construction documents for the exact fingerprint.
