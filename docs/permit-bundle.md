# Permit bundle module contract

## Responsibility

`src/services/canonicalPermitBundle.ts` assembles one revision-bound Town of Sidney deck-permit ZIP directly from the active canonical review issue. It does not create design decisions, validate professional standing, sign an application, upload files, or submit to the municipality. The retired parallel bundle service has been deleted.

## Public API and version

- Schema: `permitly-canonical-permit-bundle/v1`
- `buildCanonicalPermitBundle(input) -> CanonicalPermitBundleArtifact`
- `downloadCanonicalPermitBundle(input) -> CanonicalPermitBundleArtifact`
- Boundary helpers: `collectCaptureEntries` and `collectProfessionalEntries`

The artifact reports its package kind, exact file list, and byte size. The user-visible package kind is derived from `SubmissionReadiness`; an incomplete project is always labelled a professional review package.

Accepted canonical review cycles also contribute separate machine-readable professional resolution records. Each record is tied to the reviewed design fingerprint and lists the member, foundation, stair, and connection work packages resolved by the professional. The sealed PDF remains the authenticated evidence; the JSON record supports coordination, manifest validation, and municipal package assembly.

## State and dependencies

The module owns no durable state. Canonical project metadata, municipal application data, and evidence metadata are owned by the homeowner Zustand store and persisted in local storage. Private capture and evidence bytes are owned by separate IndexedDB stores. The module consumes the canonical vector exporter, calculation booklet, official Sidney form filler, canonical DXF, SHA-256 digest service, and `fflate` ZIP codec.

Dependency direction is UI → permit bundle → artifact services/evidence read interface. The bundle service must not import React, mutate the project store, write the evidence vault, call the review-exchange server, send email, or contact a professional registry.

## Package layout

- `README-FIRST.txt`: readiness, revision, limitations, outstanding gates, and submission contact.
- `01-application/`: unsigned official prefill and current signed/checklist evidence when recorded.
- `02-drawings/`: coordinated thirteen-sheet-minimum 11×17 vector PDF with paginated S1.x footing/post schedules, S2.x connection schedules, one S3.x section per platform, and A4.x stair/guard schedules, plus the calculation booklet and layered millimetre DXF carrying one design fingerprint.
- `03-evidence/`: integrity-checked site captures, owner-signed application evidence, and current professional evidence.
- `04-records/`: canonical project, calculation report, canonical submission manifest, professional structural-resolution records, and a SHA-256 package index covering every preceding file.
- `05-stale-evidence/`: integrity-checked evidence belonging to another design fingerprint. It is retained for audit and never satisfies current readiness.

## Failure and recovery

Assembly fails closed when the ten canonical sheets, calculation report, DXF, or design fingerprint no longer match the manifest; required application fields are incomplete; the official form or drawing conversion fails; capture/evidence bytes are missing; MIME type, byte count, or SHA-256 digest does not match; or the generated ZIP does not contain the exact expected non-empty paths. The UI preserves the project and provides a retryable error. Recovery is to regenerate stale drawings, complete the form, reattach evidence, or retry the official form download.

## Security and privacy

ZIP generation occurs in the browser. It does not upload owner PII, plans, or evidence. User-controlled filenames are normalized, leading dots are removed, traversal segments are rejected, and evidence paths include digest and record identifiers. The official application remains unsigned. A ready-state bundle means all in-app gates are recorded for the active revision; it is not proof of issuer validity, municipal acceptance, or authorization to build.

## Verification

- Unit: missing/tampered capture and professional evidence, stale-revision isolation, exact ZIP paths, index coverage, and fail-closed readiness disclosures.
- Integration: official PDF fill and ten-page vector drawing tests, including fixed 17×11 media boxes and an image-XObject regression guard.
- Journey: complete application fields on Submit, assemble the appropriate package kind, observe a validated file count, and confirm reload persistence.
- Release: TypeScript, Vitest, Vite production build, and production dependency audit.
