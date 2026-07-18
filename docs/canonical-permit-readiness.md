# Canonical permit readiness

The homeowner Permit stage evaluates submission readiness against one immutable `DP-XXXXXXXX` issue. A project is `ready-to-submit` only when all seven gates are recorded for that exact issue:

1. legal parcel/PID;
2. a recorded zone plus a named-yard setback and coverage screen that does not fail, or a fingerprint-bound municipal confirmation resolving the siting condition;
3. a dimensioned survey or field-measurement record confirming deck and footing offsets for this exact design;
4. a field-measured selected house wall plus every required existing-condition capture view;
5. accepted sealed professional evidence and a structured resolution for every derived member, foundation, stair, and connection work package;
6. every required Town of Sidney application field; and
7. an owner-signed application PDF bound to the same design fingerprint.

Any missing item produces a `review-package` state. Stale professional or signed-application evidence is preserved in the archive but never confirms a current gate. The ready label records the app's completeness checks; it does not prove professional standing, municipal completeness, permit approval, or authorization to construct.

The owner-facing package panel fills the current official form, stores signed and measured-site PDFs locally as `recorded-unverified` evidence, validates capture/evidence bytes by SHA-256, and downloads the canonical archive. An owner-uploaded field record is never represented as a legal survey. Direct municipal delivery remains a separate, explicit owner-authorized action and is unavailable unless the server channel is configured and all seven gates are satisfied.
