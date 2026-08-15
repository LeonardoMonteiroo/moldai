# AI-driven pattern generation — design

## Context

The pattern editor's chat currently "works" only superficially: `POST /api/pattern/generate` debits credits, waits an artificial delay, and returns a scripted response chosen by keyword-matching the message (`"cava"` → hardcoded conflict, `"erro"`/`"forçar erro"` → hardcoded failure, anything else → generic "Ajuste aplicado ao molde." with no visible change). The pieces' SVG geometry in `lib/mock-data.ts` is fixed, hand-authored data — nothing in the request path ever touches it. So sending "manga curta" or "decote V" produces a chat reply and a credit debit but the canvas never visibly changes.

This directly contradicts what a chat-driven pattern generator should do, and the goal of this change is to close that gap: make the chat actually interpret requests via a real AI call and alter the rendered pattern accordingly.

This supersedes two statements currently in `CLAUDE.md`:
- *"There is no real AI, no real pattern-geometry engine... everything is simulated."*
- *"Pieces are illustrative, not computed... Don't try to derive geometry from measurements — there isn't a real relationship between the two yet."*

CLAUDE.md will be updated as part of this work (confirmed with user) once implementation lands.

## Scope

In scope: `POST /api/pattern/generate` only — the message → AI → pattern-mutation path, and the piece geometry becoming parametric/computed instead of static.

Out of scope (unchanged): `graduate`, `conflict/resolve`, `billing/purchase` routes; grading logic; paywall; all UI components except however they render whatever new state shape results; Prova 3D / Ficha técnica / Plano de corte tabs beyond reflecting updated piece data.

## 1. Parametric geometry model

`lib/types.ts` gains a per-piece `params: Record<string, number>` (exact meaning below), seeded in `lib/mock-data.ts` with values that reproduce the current hand-authored shapes exactly (idle-state visuals must not change).

A new pure function, `computeGeometry(pieceId: string, params: Record<string, number>): { outline: PieceOutline; guideOutline?: PieceOutline; grainline?: {...}; dart?: {...} }`, replaces the static `outline`/`guideOutline`/`grainline`/`dart` fields on `Piece` with derived ones. It maps each named param to specific control-point offsets in the existing coordinate space (still not a real CAD/drafting engine — deterministic linear transforms of the existing polygon/path points, not a geometric solver).

Per-piece params:
- **Frente**: `necklineDepth`, `shoulderWidth`, `hemWidth`, `length`, `caseDepth` (cava), `dartSize`, `seamAllowance`
- **Costas**: `shoulderWidth`, `hemWidth`, `length`, `caseDepth`, `seamAllowance`
- **Manga**: `sleeveLength`, `sleeveWidth`, `caseDepth`, `seamAllowance`

`caseDepth` exists on frente/costas/manga because it's the shared measurement a seam conflict compares across pieces.

Each param has a fixed `min`/`max` (defined alongside the param schema) so geometry can never be pushed into a degenerate/self-intersecting shape regardless of what the AI proposes.

`PieceDetails` (the human-readable strings shown in the details panel — "21,4 cm", "1,0 cm", etc.) becomes derived from these same numeric params at read time instead of being separately hand-typed, so they can never drift out of sync with the rendered geometry.

## 2. AI request/response contract

New Anthropic API integration (`@anthropic-ai/sdk`), called from `generate/route.ts`. Requires `ANTHROPIC_API_KEY` in `.env.local` (already covered by the repo's `.env*` gitignore entry). Model: `claude-sonnet-5`.

Request includes:
- Every piece's current `params` plus the param schema (name, unit, current value, min, max) per piece
- The last ~10 messages of chat history, for follow-up context ("aumenta mais 1cm" referring to the prior turn)
- The new user message

The model is forced (via tool use / structured output) to return:

```ts
{
  decision: "apply" | "conflict" | "decline";
  pieceChanges: { pieceId: string; params: Record<string, number> }[]; // only changed params
  conflict?: {
    pieceAId: string;
    pieceBId: string;
    diffCm: number;
    title: string;
    description: string;
    suggestion: string;
  };
  declineReason?: string;
  assistantMessage: string; // chat bubble text in all three cases
}
```

Server-side handling:
1. Clamp every value in `pieceChanges[].params` to that param's `[min, max]`.
2. Recompute affected pieces' geometry via `computeGeometry`.
3. Update `mock-data.ts` state, append `assistantMessage` as an AI chat message, bump pattern version (only for `decision: "apply"` or `"conflict"` — not `"decline"`).

## 3. Conflict handling & rendering

The AI itself judges whether a change creates a seam mismatch (e.g., `caseDepth` diverging between frente and manga past a sane tolerance) — the old hardcoded `message.includes("cava")` branch is removed entirely.

The AI is **not** trusted for pixel/marker coordinates. `ConflictInfo.markers` (the dashed circles drawn on canvas) are computed server-side from each flagged piece's known landmark point for the measurement in question (e.g., each piece's `caseDepth` control-point location in its own coordinate space), using only `pieceAId`/`pieceBId`/`diffCm` from the AI response. This keeps rendering reliable even if the model's spatial reasoning about SVG coordinates is unreliable.

## 4. Error & credit flow

Credit (`COSTS.adjust`) is debited before the API call, same as today. All three non-`"apply"` outcomes refund it:

- `decision: "decline"` → new response `status: "declined"`. AI's own `assistantMessage` is shown as a normal (non-red/non-conflict-toned) chat bubble explaining why nothing changed. No version bump.
- Anthropic API error, network failure, or malformed/unparseable tool response → `status: "error"`, generic red error bubble (same UI treatment as today's error state), refund.
- Insufficient balance → unchanged: still 402 → client paywall flow, no debit attempted.

This removes both the `"forçar erro"`/`"erro"` and `"cava"` keyword-matching branches from `generate/route.ts` — every non-trivial request now genuinely goes through the model.

## Explicitly unchanged

- `graduate`, `conflict/resolve`, `billing/purchase` routes and their credit/mutation logic.
- The paywall mechanism (`lib/store.ts` retry-thunk pattern).
- `GeneratingOverlay` step-progress UI (still shown during the request; step timing may need retuning against real API latency, but that's an implementation detail, not a design change).
- Client-side optimistic message append / cancel-and-refund behavior in `sendMessage`/`cancelGeneration`.

## Follow-up

Once this lands, `CLAUDE.md`'s "What this is" and "Architecture" sections need rewriting to drop the "no real AI" / "illustrative, not computed" claims and document the new parametric-geometry + AI-contract architecture instead.
