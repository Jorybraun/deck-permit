# AI design team

The application now has an explicit three-layer design workflow. These layers have different authority and must not be collapsed into one prompt.

1. **Designer AI** receives the homeowner brief, property/site context, and current canonical design. It returns an alternate platform-and-stair concept in a strict structured schema.
2. **Deterministic engines** materialize that untrusted proposal through the same domain constructors as the editor, then run geometry, terrain, zoning, lot coverage, wall-opening, stair/life-safety, preliminary framing, and professional-review-gate checks.
3. **Independent reviewer AI** receives the proposal, the admitted canonical revision, and every deterministic result. It may explain and critique those results, but cannot override them. Every finding cites a supplied check or rule identifier.

The homeowner must explicitly apply a proposal. If the first proposal cannot be admitted by the canonical geometry engine, the client sends the rejected proposal and exact deterministic error back to Cerebras for one bounded repair attempt. The repaired result must pass the same admission boundary before independent review. If only its stair connections still fail, those stairs are excluded, the exact error is added to the visible unresolved list, and only the admitted platform concept proceeds; invalid stair geometry is never silently retained. Applying an admitted proposal creates a normal editable design revision and participates in the existing undo history. It does not advance permit readiness, satisfy an evidence gate, or invalidate the requirement for professional and municipal review.

## Photo analysis

The server also exposes a multimodal photo-analysis boundary. Source photos are posted only after explicit homeowner action and each observation is bound to the source evidence ID and SHA-256 record. The analysis output is an observation draft. Its dimensions are always `not-measured` until a separate calibrated measurement workflow exists.

## Privacy and configuration

The Cerebras API key is consumed only by the Express server and is never returned by the capabilities endpoint. New environments must use the server-only `CEREBRAS_API_KEY` name. The server temporarily recognizes the existing local `VITE_CEREBRAS_API_KEY` name for backwards compatibility, but application code never reads it through `import.meta.env`.

```dotenv
CEREBRAS_API_KEY=csk-your-server-api-key
CEREBRAS_DESIGN_MODEL=gemma-4-31b
CEREBRAS_REVIEW_MODEL=gpt-oss-120b
CEREBRAS_PHOTO_MODEL=gemma-4-31b
```

The adapter uses Cerebras Chat Completions with strict JSON-schema outputs. Photo analysis uses the vision-capable `gemma-4-31b` model. The current live endpoint accepts two images per request, so the client analyzes up to five selected JPEG/PNG sources in source-bound batches of two and merges the drafts without changing source IDs. The browser creates bounded transient JPEG analysis copies when originals are large; it does not replace the locally stored originals or their SHA-256 evidence records. Cerebras documents a 10 MB combined image limit and says original image payloads are not persisted after processing; transient image tokens or embeddings may be cached ephemerally within the organization. See the official Cerebras [image-input guide](https://inference-docs.cerebras.ai/capabilities/image-inputs), [structured-output guide](https://inference-docs.cerebras.ai/capabilities/structured-outputs), and [Chat Completions reference](https://inference-docs.cerebras.ai/api-reference/chat-completions).

When the key is absent, the UI truthfully reports that AI is not configured and the mutation endpoints fail closed with HTTP 503. There is no fake local AI fallback.

## Authority boundary

An AI review verdict of `candidate-ready-for-professional-review` means only that the proposal can be handed to a qualified reviewer. It never means code compliant, structurally adequate, permit ready, sealed, or approved. Deterministic failures, unresolved evidence, professional work packages, and authority-having-jurisdiction decisions remain controlling.
