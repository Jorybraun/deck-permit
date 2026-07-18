# Existing-condition capture module

## Responsibility

This module gathers the minimum photographic evidence needed to turn a homeowner's rough deck idea into a reviewable existing-condition model. It records what each image is intended to show, preserves its identity with a SHA-256 digest, and reports whether the required views are missing, merely recorded, or homeowner-confirmed.

It does not infer dimensions, decide structural facts, upload files, or claim that an existing condition has been professionally verified.

## Ownership and boundaries

- `SiteModel.capture` owns versioned evidence metadata: category, label, original filename, MIME type, byte size, digest, time recorded, status, and notes.
- The `capture-files` IndexedDB store owns the private image bytes. Image bytes are intentionally excluded from the canonical JSON project record.
- `existingConditionCapture.ts` owns validation, immutable metadata commands, category requirements, and readiness assessment.
- `captureFileStorage.ts` owns file hashing and local byte persistence.
- `ExistingConditionCapturePanel.tsx` presents the checklist and emits typed add, update, and remove intents. It does not mutate the site model directly.
- Framing and plan-generation modules may consume evidence identifiers and readiness results, but may not reinterpret an image as a verified measurement.

## Data and state flow

1. The homeowner selects one or more photos for a named evidence category.
2. The storage service validates type and size, computes a SHA-256 digest, and stores the image bytes locally.
3. The app adds the immutable evidence metadata to `SiteModel.capture` and persists the canonical project.
4. The homeowner can confirm only that a photo shows the requested view. This does not confirm dimensions or structural conditions.
5. Readiness is derived from the current evidence set. Required categories depend on known conditions, such as whether a door exists.
6. Plan and framing review gates remain open until every required view is recorded and homeowner-confirmed.

## Privacy and provenance

Capture files remain in the current browser profile. They are not uploaded or shared by this module. A future professional-review publishing workflow must be a separate, explicit homeowner action and must preserve each evidence ID and digest in its manifest.

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
- Older stored site models migrate to `site-model/v3` with an empty capture collection.

## Verification

Domain tests cover conditional requirements, recorded-versus-confirmed readiness, validation, and removal. Storage tests cover hashing, file-store round trips, deletion, and invalid file rejection. The application build and browser review cover the integrated homeowner checklist and its accessible file controls.
