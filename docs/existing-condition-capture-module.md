# Existing-condition capture module

## Responsibility

This module gathers the minimum photographic evidence needed to turn a homeowner's rough deck idea into a reviewable existing-condition model. It records what each image is intended to show, preserves its identity with a SHA-256 digest, and reports whether the required views are missing, merely recorded, or homeowner-confirmed.

It does not automatically infer dimensions, decide structural facts, or claim that an existing condition has been professionally verified. Originals remain local by default. Only the explicit **Analyze photos with Cerebras** action sends bounded JPEG/PNG analysis copies to the server-side vision workflow. A homeowner-accepted door/window observation may then be explicitly admitted as a source-bound, `photo-observed` wall object, but its starter dimensions remain provisional. The separate photo-calibration workflow can derive wall-plane dimensions only after the homeowner enters two distances they actually measured and clicks the corresponding axes and opening corners.

## Ownership and boundaries

- `SiteModel.capture` owns versioned evidence metadata: category, label, original filename, MIME type, byte size, digest, time recorded, status, viewpoint, controlled observations, optional scale reference, and notes.
- The `capture-files` IndexedDB store owns the private image bytes. Image bytes are intentionally excluded from the canonical JSON project record.
- `existingConditionCapture.ts` owns validation, immutable metadata commands, category requirements, and readiness assessment.
- `photoWallCalibration.ts` owns the two-axis affine calculation, validation, source binding, measurement provenance, and admission of `scaled-photo-derived` openings.
- `fieldSurvey.ts` owns the controlled direct-measurement worksheet, validation, admission of `field-measured` geometry, and stale-record assessment.
- `captureFileStorage.ts` owns file hashing and local byte persistence.
- `ExistingConditionCapturePanel.tsx` presents the checklist and emits typed add, update, and remove intents. It does not mutate the site model directly.
- Framing and plan-generation modules may consume evidence identifiers and readiness results, but may not reinterpret an image as a verified measurement.
- `SiteModel.designWall.openings` owns the editable door/window register. A record carries an evidence status: `photo-observed` proves presence only; `scaled-photo-derived` records a two-axis homeowner calibration but still requires tape/laser verification; `field-measured` and `professional-verified` describe progressively stronger evidence.
- `SiteModel.capture.wallCalibrations` preserves both normalized reference axes, both homeowner-entered distances, the traced image box, the derived opening geometry, source photo, measurer, date, method, and limitations. Changing any controlled calibration fact changes the project fingerprint and makes generated framing stale.
- `SiteModel.fieldSurvey` preserves the measurer, date, instrument, wall and house dimensions, project datum snapshot, every opening dimension, corroborating evidence IDs, and notes. It is the only homeowner workflow allowed to set `field-measured`; manually changing controlled geometry or the datum makes the worksheet stale.
- `sourceEvidenceIds` and `sourceAiObservationRefs` bind an admitted provisional opening to the exact photo and homeowner-accepted Cerebras observation. Re-admitting the same observation is rejected.
- `wallOpeningCoordination.ts` consumes that register with the deck geometry. It blocks surface/sill and ledger intersections and routes door access, low-window, evidence, and wall-alignment conditions to the professional-review package.

## Data and state flow

1. The homeowner selects one or more photos for a named evidence category.
2. The storage service validates type and size, computes a SHA-256 digest, and stores the image bytes locally.
3. The app adds the immutable evidence metadata to `SiteModel.capture` and persists the canonical project.
4. The homeowner records the camera direction and visible observations—including distinct door, window, grade, foundation, cladding, and service conditions—and can confirm only that a photo shows the requested view. This does not confirm dimensions or structural conditions.
5. If requested, Cerebras returns source-bound visual observations with explicit confidence, uncertainty, and `not-measured` status. Nothing enters the wall model at this step.
6. The homeowner accepts or rejects each observation. An accepted door/window still requires a separate **Add provisional … to wall measurement list** action.
7. Admission creates exactly one provisional opening, preserves the photo and AI observation references, and rejects duplicates. Starter offset, width, sill, and height are visibly labelled as non-photographic defaults until field measured.
8. To measure an opening from the image, the homeowner selects its source photo, enters a known horizontal distance and a known vertical distance, then clicks H1/H2, V1/V2, and opposite opening corners O1/O2. A standard-object guess is not accepted as a measurement claim.
9. The calibration engine solves the opening corners against the independent image-plane axes, validates the resulting offset/width/sill/height against the wall, stores the complete click and measurement record, and marks the opening `scaled-photo-derived`.
10. The homeowner then completes the field worksheet using a tape, laser distance meter, or survey instrument. The record must include the selected wall, house depth, wall height, the current project datum, and every modeled opening; a wall with no openings must be explicitly confirmed as such.
11. Saving the worksheet admits those values as `field-measured` but `homeowner-recorded-unverified`. A status dropdown cannot manufacture this evidence, and subsequent geometry or datum changes make the worksheet stale automatically.
12. C1.x schedules print the accepted AI observation, calibration distances/results, and field worksheet identity/provenance. The same evidence state enters the existing-condition elevation, layered DXF, framing fingerprint, and professional-review gates.
13. Readiness is derived from current evidence. Required categories depend on known conditions, such as whether a door exists. Framing's field-geometry gate closes only when the controlled worksheet is current and at least three non-reference grade observations are recorded; property-boundary survey evidence remains a separate permit requirement.

## Photo-calibration geometry

The calibrated photo workflow intentionally uses a small and inspectable affine model rather than claiming single-image photogrammetry:

1. The H1→H2 vector represents one measured horizontal distance on the visible wall plane.
2. The V1→V2 vector represents one independently measured vertical distance on the same wall plane.
3. The O1/O2 box identifies the visible opening rectangle. The four box corners are projected into the two-axis basis.
4. Minimum and maximum horizontal coordinates yield wall offset and width. Minimum and maximum vertical coordinates yield sill/threshold height and opening height.

The two reference vectors may appear skewed in the image, but they may not be coincident or nearly parallel. The workflow warns when their apparent angle suggests material perspective distortion. It does not solve lens distortion or projective depth, and it cannot establish local grade unless the selected horizontal datum is itself a measured grade reference.

## Privacy and provenance

Capture files remain in the current browser profile unless the homeowner explicitly invokes Cerebras analysis or assembles a professional package. Analysis sends temporary bounded JPEG/PNG copies and source identifiers; the canonical original and SHA-256 record remain unchanged. The professional-review package assembler includes source bytes only after a separate explicit homeowner action and preserves each evidence ID and digest in its manifest.

The evidence states mean:

- `recorded-unverified`: the file was captured and hashed.
- `homeowner-confirmed`: the homeowner confirms that it depicts the requested view.
- `professional-verified`: a qualified reviewer has explicitly accepted that evidence record in a later review workflow.

None of these states alone establishes a survey coordinate, elevation, concealed wall assembly, load path, or code compliance.

## Failure and recovery

- Unsupported or oversized files are rejected before metadata is admitted.
- If metadata admission fails after a file is saved, the app removes the newly saved file.
- Missing local bytes leave their metadata visible without a thumbnail so the evidence problem can be diagnosed instead of silently discarded.
- Removing a record deletes its local bytes, canonical metadata, AI observations, and photo-calibration records. An opening that loses its only calibration is downgraded to `photo-observed` instead of retaining a false measured status.
- Older stored site models migrate to `site-model/v4` with an empty capture collection.

## Verification

Domain tests cover conditional requirements, recorded-versus-confirmed readiness, validation, removal, affine derivation, invalid axes/boxes, wall bounds, source binding, and calibrated opening admission. Storage tests cover hashing, file-store round trips, deletion, and invalid file rejection. The application build and browser review cover the integrated homeowner checklist, real Lovell photo selection, AI-outline seeding, six-point calibration interaction, derived dimension preview, application to W1, warning propagation, persistence, and console errors.

Field-worksheet tests additionally cover complete-record admission, missing/unknown openings, wall-bound validation, stale geometry and datum detection, the rejection of label-only evidence, framing review-gate behavior, and door-threshold-driven platform elevation guidance.
