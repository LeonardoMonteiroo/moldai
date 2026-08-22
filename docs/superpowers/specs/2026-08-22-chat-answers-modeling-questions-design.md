# Chat answers modeling and product questions — design

Date: 2026-08-22
Status: approved
Issue: #20 (`feat(editor): implement the modeling glossary`, redirected — see "Issue rewrite")

## Problem

`PieceDetailsPanel` ends with a static `Glossário: o que é pence? · em breve` line
(`PieceDetailsPanel.glossaryTitle`/`glossaryText`) — plain text with a `title`
attribute, no trigger, no content. Issue #20 asked for a glossary screen behind it.

A glossary screen is the wrong shape for this product. The editor already has a
conversation with a model that knows pattern-making; a separate hand-written term list
would be a second, thinner source of the same knowledge, limited to whatever terms
someone remembered to write, and unable to answer "por que minha manga não fecha?".
The user's decision: drop the screen, teach the chat to answer.

Today the chat cannot. `lib/ai/prompt.ts` opens with "You are MoldAI's pattern-drafting
engine" and its decision policy has three branches — `apply`, `ask`, `decline` — where
`decline` is defined as "not a garment this spec can represent (pants, accessories,
requests unrelated to a draftable piece)". "O que é pence?" is not a draftable piece,
so it lands in `decline`: the model brushes the question off, the credit is refunded,
and the user learns the chat only takes orders.

## Design

### 1. A fourth decision: `explain`

`explain` = the user asked a question rather than requesting a garment. The model
answers in `assistantMessage`; nothing is drafted.

**`lib/ai/schema.ts`** — the `decision` enum becomes
`["apply", "decline", "ask", "explain"]`. `assistantMessage`'s description notes that
for `explain` it carries the entire answer. `RawToolInput.decision` widens to match.

**`lib/ai/decision.ts`** — `AiDecision.decision` widens the same way. `explain` falls
through the existing normalization untouched and reuses the `decline` shape: no spec is
required, and `validateSpec(input.spec)` still fills the unused `spec` field exactly as
the decline path already does (`AiDecision.spec` stays non-optional; no call site reads
it for a non-`apply` decision).

One new guard, mirroring "decision=apply without a spec object": an `explain` whose
`assistantMessage` is empty or whitespace **throws**. For `explain` the message _is_ the
payload, so an empty one is unusable; throwing routes it into the generate route's
catch, which refunds and returns `status: "error"` — honest failure over an empty
bubble.

`explain` is accepted regardless of `answering`. A user answering clarifying questions
should get an answer if they asked something back; the prompt already tells the model
not to re-`ask` in that state, and no automatic normalization is added for a case the
model has no reason to produce.

### 2. Prompt: two new knowledge sections

**Decision policy** gains:

> - explain: the user asked a question instead of requesting a garment or an
>   adjustment — about pattern-making, or about how MoldAI works. Answer it in
>   assistantMessage; don't draft, don't fill in spec. If the message both asks
>   something and requests a change, prefer apply/ask and answer inside
>   assistantMessage.

Two sections are added after the vocabulary mapping:

**`# Modeling knowledge`** — the model may answer pattern-making and sewing questions:
vocabulary (pence, cava, fio, folga de costura, graduação, copa da manga, decote),
technique, and the practical difference between knit and woven. Free-form domain
knowledge; nothing in the codebase to derive it from.

**`# Product facts`** — what MoldAI itself does, rendered from code constants so the
prompt cannot quote a price the app doesn't charge or a format it doesn't write:

- Credit costs from `COSTS` (`lib/types.ts`), rendered as `key: N créditos` lines the
  same way `MEASUREMENT_LINES` renders `MEASUREMENT_RANGES` today.
- Export formats from `EXPORT_FORMATS` (see §3).
- Prose for what no constant carries: export runs in the browser and costs nothing;
  "Corrigir manga" re-drafts the sleeve cap for the adjusted armhole for free; size
  charts live in Medidas e grades and a pattern freezes its chart at its first
  generation.
- A closing rule: **if unsure about a MoldAI behaviour, say so instead of guessing.**

Two guardrails stated in the prompt:

- Out of scope stays out of scope. Questions that are neither pattern-making nor MoldAI
  still `decline` (refunded, unchanged behaviour) — this is not a general assistant.
- A question asked against a blank pattern must be answered with `explain`; the existing
  "BLANK pattern … a generic request is UNDERSPECIFIED: use decision=ask" rule applies
  to garment _requests_, not questions. The blank-state line in `buildSystem` is amended
  to say so.

### 3. `EXPORT_FORMATS` — a runtime list for the prompt

`ExportFormat` is a bare TS union in `lib/export/index.ts`, so the prompt has nothing to
render from, and `index.ts` pulls in the DXF/SVG/PDF serializers plus the DOM-touching
`download.ts` — not something `lib/ai/prompt.ts` should import.

New leaf module **`lib/export/formats.ts`**:

```ts
export const EXPORT_FORMATS = [
  "svg",
  "dxf",
  "dxf-aama",
  "pdf-a4",
  "pdf-single",
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
```

`lib/export/index.ts` re-exports both (its `export type ExportFormat = …` line becomes a
re-export), so every existing import path and the `switch`/`never` exhaustiveness in
`exportPattern` are unchanged. `components/editor/Footer.tsx` keeps its own display list
(it carries per-format catalog keys and menu order); this spec does not touch it.

### 4. Route and wire

`GenerateResult.status` (`lib/api-client.ts`) gains `"answered"`.

`POST /api/patterns/[id]/generate` gains an `explain` branch, placed with the existing
`ask`/`decline` branches and differing from both in one way — **it keeps the debit**:

```
addMessage(state, { author: "ai", text: decision.assistantMessage,
                    chips: [{ label: t("chat.creditChip", { cost }), tone: "credit" }] })
return { status: "answered", state: composeEditorState(state, wallet, now) }
```

No refund, no `applyGarmentSpec`, no `bumpVersion`, no `seedPatternSizeSnapshot`, no
conflict check. An answer costs `COSTS.adjust` (1 credit) — the user's decision: the
Anthropic call is real either way, and "you pay when you get value" is truer here than
"you pay only when pieces move". The chip makes the charge visible in the bubble, as it
already is for an applied generation.

Consequences that need no new code: an account with 0 credits asking a question hits the
existing 402 path and the paywall's retry closure re-asks after purchase; the ledger
records a `debit / generate` row like any other spend.

**Client:** none. `sendMessage` branches only on `insufficient_credits` and `error`;
`"answered"` flows through `applyState` → `generationStatus: "idle"` like `ok`. Since
`version` is unchanged, the measure-tool clear doesn't fire, and with no pieces added
the auto-select doesn't either. Both are already conditional.

### 5. UI and catalog

- `components/editor/PieceDetailsPanel.tsx` — delete the trailing `<span>` and the
  `flex-1` spacer that pushed it to the foot. The panel ends after the Graduar button.
- `messages/pt-BR.json` — delete `PieceDetailsPanel.glossaryTitle` and `.glossaryText`.
  No new catalog keys: the answer is model-produced prose, which per the i18n rule is
  outside the catalogs entirely and already mirrors the user's language.

### 6. Known trade-off (not fixed)

While a question is in flight, `GeneratingOverlay` still announces "traçando peças /
conferindo costuras" and the composer shows "−1 crédito · gerando…". The client cannot
know the message was a question until the model has decided, so this is inherent to a
single generate endpoint — and pre-existing for the `ask` and `decline` paths. The
credit line is at least accurate for `explain`, which is charged.

## Testing

Unit (`node` project):

- `lib/ai/decision.test.ts` — `explain` passes through with its message intact and
  requires no spec; `explain` with an empty/whitespace `assistantMessage` throws;
  `explain` survives `answering: true`.
- `lib/ai/schema.test.ts` — the tool's `decision` enum contains all four values.
- `lib/ai/prompt.test.ts` — the prompt renders every `COSTS` entry's real number and
  every `EXPORT_FORMATS` member (so changing a price or adding a format fails the test
  until the prompt is regenerated), and the blank-pattern section states that a question
  is answered rather than clarified.
- `app/api/patterns/[id]/generate/route.test.ts` — an `explain` decision answers
  `status: "answered"`, appends one AI message carrying the credit chip, leaves
  `pattern.version` and `pattern.pieces` untouched, and writes a ledger with **one**
  debit and **no** refund (the assertion that separates `explain` from `decline`).

Existing suites must stay green — particularly the route's decline/ask tests, which
prove the refund paths were not disturbed.

## Evidence for the issue

Per the standing rule for backlog issues: test names + real pass output, plus a
screenshot of the running app (host `npm run dev`, not the Docker dev stack) showing the
chat answering a modeling question ("o que é pence?") and a product question, with the
credit chip on the answer and the pattern version unchanged.

## Issue rewrite

#20's title and acceptance criteria describe a glossary screen behind the panel link and
no longer describe the work. Retitle to `feat(ai): answer modeling and product questions
in the chat` and replace the criteria with:

- [ ] A modeling question in the chat ("o que é pence?") is answered rather than
      declined, with no draft and no version bump
- [ ] A question about MoldAI itself (credit costs, export formats) is answered from
      facts rendered out of the code's own constants
- [ ] An out-of-scope question still declines and is refunded
- [ ] An answer costs `COSTS.adjust` and shows the credit chip
- [ ] The panel's "Glossário: o que é pence? · em breve" line and its catalog keys are
      removed

## CLAUDE.md

The "Generation flow" section gains `explain` beside `apply`/`decline`/`ask` — noting it
is the one non-drafting decision that is _not_ refunded — and the `lib/ai/` bullet notes
that `# Product facts` renders from `COSTS` and `EXPORT_FORMATS`, extending the existing
never-hardcode-a-bound-in-the-prompt rule to prices and formats.
