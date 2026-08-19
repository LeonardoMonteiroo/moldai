# Editor AI prompt + module restructure — design

Date: 2026-08-19
Status: approved

## Problem

`lib/ai.ts` (205 lines) holds the editor's whole AI layer: a flat, sentence-per-line
system prompt (`buildSystem`), a verbose hand-written tool schema, the Anthropic call,
and the ask/apply post-processing. Concrete defects:

1. **The model doesn't know the validator's limits.** `validateSpec`
   (`lib/draft/garment.ts`) clamps `necklineDepthCm` to 0–15, `skirtLengthCm` to
   25–120, `seamAllowanceCm` to 0–4, `armholeDeepenCm` to 0–6, and
   `resolveMeasurements` clamps body measurements to `MEASUREMENT_RANGES` — but none
   of those bounds appear in the prompt or the tool schema. The model can apply
   "bust 200 cm", the clamp silently makes it 140, and `assistantMessage` claims
   something that didn't happen.
2. **Prompt structure.** `buildSystem` is 13 loose sentences joined by `\n`, mixing
   role, domain rules, vocabulary mapping, language policy, and state; several rules
   are duplicated in the tool-schema descriptions.
3. **History gaps.** (a) Assistant history turns drop the `questions` the AI asked, so
   an answer like "Round, short" arrives without referents. (b) An API error leaves an
   orphaned user message in the persisted chat (the route's catch still saves state),
   so the next call can send consecutive `user` turns — invalid role alternation.
4. **Silent default garment.** `decision=apply` with a missing `spec` passes
   `undefined` through `validateSpec`, which fabricates a default female blouse
   instead of failing (the route would refund on failure).

## Design

### 1. Shared limits — single source of truth

`lib/draft/garment.ts` exports its existing enum arrays (`TYPES`, `GENDERS`,
`NECKLINES`, `SLEEVES`, `SKIRTS`) and a new `STYLE_LIMITS` const:

```ts
export const STYLE_LIMITS = {
  necklineDepthCm: { min: 0, max: 15 },
  skirtLengthCm: { min: 25, max: 120 },
  seamAllowanceCm: { min: 0, max: 4 },
  armholeDeepenCm: { min: 0, max: 6 },
} as const;
```

`validateSpec` clamps with `STYLE_LIMITS` (same numbers, no behavior change). The AI
module imports these plus `MEASUREMENT_RANGES` so prompt, schema, and validator cannot
drift. No new file: the validator already lives in `garment.ts`, and `lib/ai` already
imports from it (no cycle — `garment.ts` never imports `lib/ai`).

### 2. Module split — `lib/ai.ts` → `lib/ai/`

- `prompt.ts` — `buildSystem(state, answering)`, rewritten as sectioned markdown:
  Role → GarmentSpec domain (fields with explicit numeric ranges rendered from the
  shared constants) → vocabulary mapping → decision policy (apply/ask/decline, the
  blank-pattern underspecified rule, the answering rule, the armhole/seam-conflict
  note) → language rule (mirror the user's language) → current state (blank vs
  applied spec, size-table JSON, current-spec JSON). New rule: when a requested
  value is out of range, clamp it and say so in `assistantMessage` — never claim an
  unclamped value was applied.
- `schema.ts` — the `propose_garment` tool + `RawToolInput`. Enums and
  `minimum`/`maximum` on numeric fields derive from the shared constants;
  descriptions trimmed to what the system prompt doesn't already state (keep the
  behavior-critical ones: COMPLETE spec not delta; questions only when ask).
- `history.ts` — pure `buildHistory(chat)`: maps the last 10 messages to API turns;
  serializes an ai message's `questions` into its text (label + options) so answers
  have referents; merges consecutive same-role turns; drops leading assistant turns
  so history always starts with `user`.
- `decision.ts` — pure `resolveDecision(raw, answering)`: today's ask/apply
  normalization (ask without usable questions → apply; ask while answering → apply)
  plus a guard — if the final decision is `apply` and the model sent no spec object,
  **throw**. The generate route's existing catch refunds the credit and returns
  `status: "error"`; no route change needed.
- `index.ts` — `proposeGarment` (Anthropic call + orchestration), re-exports
  `AiDecision`. `@/lib/ai` imports keep resolving (folder index); only importers are
  the generate route and its test, both untouched.

### 3. Tests

- `lib/ai.test.ts` moves to `lib/ai/index.test.ts` (existing 3 cases kept).
- New pure tests, no SDK mocks: `history.test.ts` (questions serialization, same-role
  merge, leading-assistant drop) and `decision.test.ts` (normalizations,
  missing-spec throw).
- `prompt.ts` assertions: contains the rendered ranges; blank vs applied-spec
  variants; answering variant.
- Verify with `npm test` and `npm run build` (per memory: not bare `tsc`).

## Out of scope / unchanged

- Route behavior for ask/decline/apply/conflict, wire shapes, persisted blobs,
  model id (`claude-sonnet-5`), `max_tokens: 1024`, the server-side `answering` guard.
- Prompt caching: the static prefix is under Sonnet's 1024-token cacheable minimum,
  so `cache_control` would be dead weight.
- The pt-BR canned fallbacks in the generate route (documented i18n asymmetry).
