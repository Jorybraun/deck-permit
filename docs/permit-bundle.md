# Permit bundle module contract

## Responsibility

`src/services/permitBundle.ts` assembles one revision-bound Town of Sidney deck-permit ZIP from artifacts already owned by the active project. It does not create design decisions, validate professional standing, sign an application, upload files, or submit to the municipality.

## Public API and version

- Schema: `deck-permit-bundle/v3`
- `buildPermitBundle(input) -> PermitBundleArtifact`
- `downloadPermitBundle(input) -> PermitBundleArtifact`
- Boundary helpers: `collectEvidenceEntries`, `validateBundleInput`, `validateBundleArchive`, and `buildBundleReadme`

The artifact reports its package kind, exact file list, and byte size. The user-visible package kind is derived from `SubmissionReadiness`; an incomplete project is always labelled a professional review package.

## State and dependencies

The module owns no durable state. Project metadata is owned by Zustand and persisted as a versioned IndexedDB snapshot. Evidence PDF bytes are owned by the IndexedDB evidence vault and are read through `loadEvidenceFile`. The module consumes the vector drawing exporter, official Sidney form filler, submission-manifest serializer, evidence assessor, SHA-256 digest service, and `fflate` ZIP codec.

Dependency direction is UI → permit bundle → artifact services/evidence read interface. The bundle service must not import React, mutate the project store, write the evidence vault, call the review-exchange server, send email, or contact a professional registry.

## Package layout

- `README-FIRST.txt`: readiness, revision, limitations, outstanding gates, and submission contact.
- `01-application/`: unsigned official prefill and current signed/checklist evidence when recorded.
- `02-drawings/`: coordinated ten-sheet 11×17 vector PDF. Canonical SVG paths and text are written directly as PDF vector/text operators rather than flattened into page images. C1.0 records existing-condition geometry, measurement/datum provenance, photo coverage, evidence identifiers, and unresolved conditions.
- `03-professional-and-site-evidence/`: evidence accepted by the app for the current project state.
- `04-records/`: submission manifest, structural design-basis report, professional redline response log, and a SHA-256 package index covering every other file.
- `05-rejected-or-stale-evidence/`: retained audit records that do not satisfy the current revision.

## Failure and recovery

Assembly fails closed when the address, PID, ten canonical sheets, or design fingerprint no longer match the manifest; required application fields are incomplete; the official form or drawing conversion fails; evidence bytes are missing; evidence metadata, MIME type, byte count, filename, or SHA-256 digest does not match; or the generated ZIP does not contain the exact expected non-empty paths and bytes. The UI preserves the project and provides a retryable error. Recovery is to regenerate stale drawings, complete the form, reattach evidence, or retry the official form download.

## Security and privacy

ZIP generation occurs in the browser. It does not upload owner PII, plans, or evidence. User-controlled filenames are normalized, leading dots are removed, traversal segments are rejected, and evidence paths include digest and record identifiers. The official application remains unsigned. A ready-state bundle means all in-app gates are recorded for the active revision; it is not proof of issuer validity, municipal acceptance, or authorization to build.

## Verification

- Unit: safe names, missing/tampered evidence, rejected-evidence isolation, exact ZIP paths, empty-entry rejection, and readiness disclosures.
- Integration: official PDF fill and ten-page vector drawing tests, including fixed 17×11 media boxes and an image-XObject regression guard.
- Journey: complete application fields on Submit, assemble the appropriate package kind, observe a validated file count, and confirm reload persistence.
- Release: TypeScript, Vitest, Vite production build, and production dependency audit.
