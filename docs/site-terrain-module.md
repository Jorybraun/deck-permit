# SiteTerrain module contract

## Responsibility

`SiteTerrain` owns grade observations and derives traceable local ground elevations.

## Public API

- `createTerrainSurface(elevationMm)` creates an explicit reference datum.
- `addTerrainGradePoint`, `updateTerrainGradePoint`, and `removeTerrainGradePoint` are the only domain mutations.
- `terrainElevationAt(terrain, pointMm)` returns an elevation, method, contributing point IDs, nearest distance, and verification status.

The current contract is `terrain-surface/v1`, embedded in `site-model/v2`.

## State authority and dependency direction

`HomeownerProjectState.site.terrain` is the single durable owner. The domain module has no React, provider, storage, framing, or drawing imports.

```text
Property capture UI ──intent──> App composition ──command──> SiteTerrain
                                                        │
                                                        ├──> Deck stair geometry
                                                        ├──> Framing generation
                                                        └──> Drawing projections
```

Consumers may query derived grade but may not store a competing global ground elevation.

## Evidence and failure semantics

- No observations: return the datum and label the method `datum`.
- Coordinate within 25 mm of an observation: return the observed elevation.
- Other coordinates: inverse-distance interpolation from up to four nearest observations, with contributing IDs returned.
- Invalid numeric input and duplicate IDs fail immediately without mutating the surface.
- Interpolation is evidence-backed context, not a survey or professional verification.

## Privacy and security

Grade points describe a private property. They remain in the local project snapshot unless the homeowner explicitly includes them in a review or submission package.

## Verification

- Domain boundary tests cover datum fallback, add/update/remove, exact observations, interpolation, and provenance independence.
- Framing boundary tests verify that different local grades produce different post heights and invalidate the framing fingerprint.
- The running property and designer journey was checked at a real municipal parcel; the canvas displayed the grade point and reported no browser errors.
