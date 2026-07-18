# Canonical permit readiness

The homeowner Permit stage evaluates submission readiness against one immutable `DP-XXXXXXXX` issue. A project is `ready-to-submit` only when all six gates are recorded for that exact issue:

1. legal parcel/PID;
2. municipal zoning evidence;
3. a field-measured selected house wall plus every required existing-condition capture view;
4. accepted sealed professional evidence and a structured resolution for every derived member, foundation, stair, and connection work package;
5. every required Town of Sidney application field; and
6. an owner-signed application PDF bound to the same design fingerprint.

Any missing item produces a `review-package` state. Stale professional or signed-application evidence is preserved in the archive but never confirms a current gate. The ready label records the app's completeness checks; it does not prove professional standing, municipal completeness, permit approval, or authorization to construct.

The owner-facing package panel fills the current official form, stores a signed PDF locally as `recorded-unverified` evidence, validates capture/evidence bytes by SHA-256, and downloads the canonical archive. Direct municipal delivery remains a separate, explicit owner-authorized action and is unavailable unless the server channel is configured and all six gates are satisfied.
