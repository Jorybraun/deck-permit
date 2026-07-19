# AI design team

The application now has an explicit three-layer design workflow. These layers have different authority and must not be collapsed into one prompt.

1. **Designer AI** receives the homeowner brief, property/site context, and current canonical design. It returns an alternate platform-and-stair concept in a strict structured schema.
2. **Deterministic engines** materialize that untrusted proposal through the same domain constructors as the editor, then run geometry, terrain, zoning, lot coverage, wall-opening, stair/life-safety, preliminary framing, and professional-review-gate checks.
3. **Independent reviewer AI** receives the proposal, the admitted canonical revision, and every deterministic result. It may explain and critique those results, but cannot override them. Every finding cites a supplied check or rule identifier.

The homeowner must explicitly apply a proposal. Applying it creates a normal editable design revision and participates in the existing undo history. It does not advance permit readiness, satisfy an evidence gate, or invalidate the requirement for professional and municipal review.

## Photo analysis

The server also exposes a multimodal photo-analysis boundary. Source photos are posted only after explicit homeowner action and each observation is bound to the source evidence ID and SHA-256 record. The analysis output is an observation draft. Its dimensions are always `not-measured` until a separate calibrated measurement workflow exists.

## Privacy and configuration

The OpenAI API key is server-only. It must never use a `VITE_` prefix or be returned by the capabilities endpoint.

```dotenv
OPENAI_API_KEY=sk-your-server-api-key
OPENAI_DESIGN_MODEL=gpt-5.6-sol
OPENAI_REVIEW_MODEL=gpt-5.6-sol
```

The adapter uses the Responses API with image inputs where applicable, strict structured outputs, and `store: false`. See the official OpenAI [vision guide](https://developers.openai.com/api/docs/guides/images-vision) and [structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

When the key is absent, the UI truthfully reports that AI is not configured and the mutation endpoints fail closed with HTTP 503. There is no fake local AI fallback.

## Authority boundary

An AI review verdict of `candidate-ready-for-professional-review` means only that the proposal can be handed to a qualified reviewer. It never means code compliant, structurally adequate, permit ready, sealed, or approved. Deterministic failures, unresolved evidence, professional work packages, and authority-having-jurisdiction decisions remain controlling.
