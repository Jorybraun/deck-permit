# Professional redline and response contract

## Purpose

The redline workflow turns a sealed professional change request into structured, sheet-specific coordination data. A redline is not a professional seal and an owner response is not acceptance. Only a new accepted sealed review bound to the current `DP-XXXXXXXX` fingerprint can satisfy the structural-review evidence gate.

## Redline authority

Each `ReviewRedline` is authored in the private reviewer portal and contains a unique identifier, the published design fingerprint, one of the seven drawing sheet identifiers, category, required/advisory severity, bounded title and comment text, a percentage-based marker position, and timestamp. A `changes-requested` decision requires at least one required redline. An `accepted` decision may contain advisory redlines only.

The server validates redlines against the immutable review package and rejects revision or sheet mismatches. Reviewer capability authentication still controls submission; the professional-directory attestation and sealed PDF remain required.

## Owner/designer responses

Imported reviews create durable `ProfessionalReviewCycle` records in IndexedDB. These survive deck edits even though the active reviewer publication is invalidated. Each response is bound to a source redline and target design fingerprint with one of two dispositions:

- `response-only`: clarification or proposed action; it makes no claim that the drawing changed.
- `addressed-in-revision`: allowed only when the target fingerprint differs from the reviewed source fingerprint.

Every required redline needs a response before another private review package can be published. The next reviewer receives up to ten prior cycles and their response history. The reviewer independently determines whether the current revision resolves the comments.

## Permit package

The ZIP contains `04-records/professional-redline-response-log-DP-XXXXXXXX.json`, and the submission manifest embeds the same professional review cycles. The record explicitly disclaims professional acceptance. Stale or change-request evidence remains rejected by the existing revision-bound evidence assessment.

## Failure and recovery

- A change request with no required redline is rejected.
- A marker outside its published sheet, an unknown sheet, duplicate identifier, stale fingerprint, invalid category, or oversized text is rejected.
- A required redline without an owner/designer response blocks republication, but does not delete the review or its sealed PDF.
- Editing geometry invalidates active drawings and reviewer links; imported cycles remain. Regenerate the package, respond against the new fingerprint, and publish a new review exchange.
- Re-importing a replaced decision for the same exchange updates that cycle and retains responses only for redlines still present.

## Verification

- Domain tests: `src/services/reviewRedlines.test.ts`
- Server boundary tests: `server/reviewExchangeStore.test.ts`
- Persistence: `src/services/projectRepository.test.ts`
- Package records: `src/services/submissionManifest.test.ts` and `src/services/permitBundle.test.ts`
- Browser journey: reviewer places a sheet marker → submits change request → owner imports → response is recorded → next package includes review history
