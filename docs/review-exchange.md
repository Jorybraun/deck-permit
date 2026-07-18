# Review exchange module contract

## Purpose and ownership

The review exchange publishes one immutable deck-design revision to a private professional reviewer and returns that review to the project owner. The server-side `ReviewExchangeStore` is the sole authority for published packages, capability hashes, expiry, and submitted review bytes.

## Public API — v1

- `POST /api/review-exchange` publishes a validated review package and returns separate one-time owner and reviewer credentials.
- `GET /api/review-exchange/:id/reviewer` requires the reviewer bearer credential and returns the package without sealed-PDF bytes.
- `POST /api/review-exchange/:id/review` requires the reviewer credential and submits or replaces the revision-bound professional decision plus validated sheet redlines.
- `GET /api/review-exchange/:id/owner` requires the owner credential and returns the decision and sealed PDF for local import.

The browser places the reviewer credential in the URL fragment. Fragments are not sent in HTTP requests; the reviewer client moves it into the `Authorization` header. Credentials must not be added to query parameters, analytics, logs, or drawing metadata.

## State and dependencies

- Server state: one mode-0600 JSON record per review package under `DECK_PERMIT_DATA_DIR` (default `.deck-permit-data`). Token hashes—not raw credentials—are stored.
- Owner state: the owner credential and generated reviewer URL are stored in the owner's IndexedDB project snapshot.
- Reviewer state: no durable browser state; the private link is the capability.
- Dependencies: Node crypto and filesystem only. The permit-rule and drawing-generation modules do not depend on the repository.

## Validation and failure semantics

- Packages require a valid `DP-XXXXXXXX` fingerprint, address, deck geometry, design-basis report, and 1–20 bounded SVG sheets.
- Reviews must match the published fingerprint and contain a PDF of at most 10 MB. PDF magic bytes, byte count, and SHA-256 digest are checked server-side.
- Change requests require at least one required redline bound to an actual published sheet. Accepted reviews may include advisory redlines only. Marker bounds, identifiers, categories, severity, and text limits are checked server-side.
- Published packages may carry up to ten prior professional review cycles and owner/designer responses so the next reviewer can verify comment disposition.
- Reviewer profession, registry, registry URL, and a registry check no older than 30 days must agree.
- Capabilities are 256-bit random values, scoped separately, and expire after 30 days.
- Invalid credentials return 401; stale revisions return 409; expired links return 410; oversized requests return 413.

## Security and deployment limits

Anyone holding a reviewer link can act with reviewer scope until expiry. Users must share it privately. This is capability authentication, not account-based identity proof. Official professional directories remain the authority for current registration; automated EGBC scraping is prohibited by its directory terms, so machine verification requires a regulator-approved API or written permission.

Filesystem persistence is suitable for a single durable server instance. Multi-instance deployment requires replacing `ReviewExchangeStore` with an encrypted object/database implementation that provides atomic compare-and-swap or transactions. The route contract and client scopes should remain unchanged.

## Verification

- Boundary tests: `server/reviewExchangeStore.test.ts`
- Client credential test: `src/services/reviewExchange.test.ts`
- Journey: owner publish → reviewer read → registry gate → sealed review → owner import → server restart → owner re-import
- Build gates: `npm run lint`, `npm test`, `npm run build`
