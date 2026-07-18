# Orthographic projection module

Responsibility: derive a deterministic orthographic building model from the canonical site, deck, and framing graphs.

- Kind/owner: pure domain module, owned by the deck-design domain.
- Public API/version: `createOrthographicProjection`, `projectionAxisForView`, and the typed `orthographic-projection/v1` result.
- State: none. `SiteModel`, `DeckDesign`, and `FramingDesign` remain the canonical state owners.
- Dependencies: deck geometry, terrain interpolation, preliminary section rules, and optional generated framing.
- Consumers: the interactive side-elevation editor and the canonical A3.0 permit sheet.
- Prohibited dependencies: React, SVG/DOM APIs, browser state, storage, PDF generation, municipal providers, and AI output.
- Failure/recovery: invalid axes and missing geometry produce typed `OrthographicProjectionError` failures; consumers retain the previous valid view and prompt for valid geometry.
- Privacy/security: the result contains project geometry but no image bytes, contact details, provider credentials, or reviewer secrets.
- Verification: domain contract tests cover linked multi-level stairs, structure, guards, grade, height previews, axis selection, and typed invalid input. Browser journeys verify editor and issued-sheet rendering.

Dependency direction:

`canonical site/design/framing → orthographic projection → UI or plan-sheet renderer`

The UI and drawing generator must not derive their own platform heights, stair endpoints, post positions, or grade values.
