# Municipal delivery boundary

Permitly supports two distinct handoff modes:

1. Download a validated ZIP on the owner's device. This does not transmit or record a submission.
2. When the production server has both `RESEND_API_KEY` and `PERMIT_SUBMISSION_FROM_EMAIL`, an owner or authorized applicant may explicitly authorize delivery of a ready-to-submit package to `developmentservices@sidney.ca`.

The delivery endpoint rejects professional-review packages, missing authorization, invalid manifests, changed ZIP bytes, packages over 14 MB, and unconfigured servers. The recipient is fixed server-side. Successful provider responses create an immutable receipt under `DECK_PERMIT_DATA_DIR/municipal-submissions`; repeated delivery of the same revision, ZIP digest, and owner email returns that receipt instead of sending again.

A receipt means the email provider accepted the message. It does not mean the Town received a complete application, assigned a file number, accepted the design, issued a permit, or authorized construction.

Successful receipts are recorded in the canonical homeowner project history and survive reload. A record carries the revision, design fingerprint, package filename/size/digest, provider message ID, recipient, timestamp, and delivery meaning. Provider idempotency receipts replace the same record ID instead of creating duplicate submission history.
