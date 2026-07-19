# Existing-condition capture module

## Responsibility

This module gathers the minimum photographic evidence needed to turn a homeowner's rough deck idea into a reviewable existing-condition model. It records what each image is intended to show, preserves its identity with a SHA-256 digest, and reports whether the required views are missing, merely recorded, or homeowner-confirmed.

It does not automatically infer dimensions, decide structural facts, or claim that an existing condition has been professionally verified. Originals remain local by default. Only the explicit **Analyze photos with Cerebras** action sends bounded JPEG/PNG analysis copies to the server-side vision workflow. A homeowner-accepted door/window observation may then be explicitly admitted as a source-bound, `photo-observed` wall object, but its starter dimensions remain provisional until field measured.

## Ownership and boundaries

- `SiteModel.capture` owns versioned evidence metadata: category, label, original filename, MIME type, byte size, digest, time recorded, status, viewpoint, controlled observations, optional scale reference, and notes.
- The `capture-files` IndexedDB store owns the private image bytes. Image bytes are intentionally excluded from the canonical JSON project record.
- `existingConditionCapture.ts` owns validation, immutable metadata commands, category requirements, and readiness assessment.
- `captureFileStorage.ts` owns file hashing and local byte persistence.
- `ExistingConditionCapturePanel.tsx` presents the checklist and emits typed add, update, and remove intents. It does not mutate the site model directly.
- Framing and plan-generation modules may consume evidence identifiers and readiness results, but may not reinterpret an image as a verified measurement.
- `SiteModel.designWall.openings` owns the editable door/window register. A record carries an evidence status; `photo-observed` proves presence only, while field or professional status is required before dimensions can govern review.
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
8. C1.x schedules record the accepted AI observation and the opening record carries the same reference into the existing-condition elevation and layered DXF.
9. Readiness is derived from the current evidence set. Required categories depend on known conditions, such as whether a door exists. Plan and framing review gates remain open until every required view is recorded and homeowner-confirmed.

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
- Removing a record deletes both its local bytes and canonical metadata.
- Older stored site models migrate to `site-model/v4` with an empty capture collection.

## Verification

Domain tests cover conditional requirements, recorded-versus-confirmed readiness, validation, and removal. Storage tests cover hashing, file-store round trips, deletion, and invalid file rejection. The application build and browser review cover the integrated homeowner checklist and its accessible file controls.
