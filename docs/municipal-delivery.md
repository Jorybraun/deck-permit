# Municipal delivery boundary

Permitly supports two distinct handoff modes:

1. Download a validated ZIP on the owner's device. This does not transmit or record a submission.
2. When the production server has both `RESEND_API_KEY` and `PERMIT_SUBMISSION_FROM_EMAIL`, an owner or authorized applicant may explicitly authorize email delivery of a fingerprint-bound package to `developmentservices@sidney.ca` for the Town's completeness review. The UI does not call this a completed submission.

The delivery endpoint rejects professional-review packages, missing authorization, invalid manifests, changed ZIP bytes, packages over 14 MB, and unconfigured servers. The recipient is fixed server-side. Successful provider responses create an immutable receipt under `DECK_PERMIT_DATA_DIR/municipal-submissions`; repeated delivery of the same revision, ZIP digest, and owner email returns that receipt instead of sending again.

A receipt means the email provider accepted the message for transmission. It does not mean the Town received it, considered the application complete, assigned a file number, accepted the design, issued a permit, or authorized construction.

Successful receipts are recorded in the canonical homeowner project history and survive reload. A record carries the revision, design fingerprint, package filename/size/digest, provider message ID, recipient, timestamp, and delivery meaning. Provider idempotency receipts replace the same record ID instead of creating duplicate submission history.

The package now carries a human-readable April 2026 Town intake assessment. It fails closed on the signed official application, current title search or the form's Town-search election, construction fire safety plan (or written Town exemption), separate owner authorization when the applicant differs from the owner, exact-fingerprint professional engineering, digital drawings, and lot-coverage calculations. Conditional items such as DP/DVP conditions, flood level, protected trees, archaeology, contaminated sites, right-of-way, and storm-water management remain explicitly listed for Town confirmation.
