# Generation flow

> This is the _why_. For the operative rule, see [`../architecture/generation-flow.md`](../architecture/generation-flow.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

### Generation flow (`POST /api/patterns/[id]/generate`)

- Debits `COSTS.adjust` immediately, then `proposeGarment` (`lib/ai/`) asks the active provider (`claude-sonnet-5` via Anthropic by default — see `#269` below and [`ai-provider.md`](../architecture/ai-provider.md)), via forced tool-use, for `{ decision: "apply" | "decline" | "ask" | "explain", spec, questions?, declineReason?, assistantMessage, assemblyOrder? }` — `assemblyOrder` is only ever meaningful alongside `decision: "explain"` (see Assembly / sewing order below).
- **`lib/ai/` is split by responsibility, all derived from one source of truth:** `prompt.ts` (sectioned system prompt), `schema.ts` (the `propose_garment` tool), `history.ts` (pure `buildHistory` — normalizes the persisted chat into Messages-API turns: serializes an ai turn's `questions` into its text, merges consecutive same-role turns, drops leading assistant turns), `decision.ts` (pure `resolveDecision` — ask/apply normalization + validation), `index.ts` (the API call; the only file importing the SDK). **The prompt's and schema's every enum and numeric bound render from `lib/draft/garment.ts`'s exported `TYPES`/`GENDERS`/`NECKLINES`/`SLEEVES`/`SKIRTS`/`STYLE_LIMITS` plus `MEASUREMENT_RANGES`** — the same constants `validateSpec` clamps with, so the model is never told a range the validator doesn't enforce. Add a style field in one place and all three follow; never hardcode a bound in the prompt or schema. The rule now covers prices and formats too: the prompt's `# Product facts` section renders its credit costs from `COSTS` and its format list from `EXPORT_FORMATS` (`lib/export/formats.ts` — a leaf module holding the array plus the `ExportFormat` type derived from it, so `prompt.ts` can name the formats without importing the export facade's serializers and `download.ts`'s DOM access; `lib/export/index.ts` re-exports both, so existing `@/lib/export` importers are unchanged).
- A `decision: "apply"` carrying no usable `spec` object (missing, null, or an array) **throws** rather than letting `validateSpec` fabricate a default blouse — the route's existing catch refunds the credit.
- **Trust boundary:** the returned `spec` is never trusted as-is — `validateSpec` (`lib/draft/garment.ts`) re-checks every enum and clamps every numeric field before use; `questions` go through `validateQuestions` the same way. The AI never emits SVG or pixel coordinates — only a `GarmentSpec`. **The same rule now covers the _user's_ size-chart patch** (`lib/sizeCharts/validate.ts`, see Size charts) — it was written for the AI's input and initially forgotten on the human's, which reaches the identical drafter.
- `apply` → `applyGarmentSpec` → `draftGarment(spec, baseMeasurements, t)` recomputes `pieces`/`viewBox`/`baseMeasurements` from scratch and bumps the version.
- `decline`, and any API/parse error, refunds the credit.
- `ask` (underspecified request) → 1–4 single-choice `questions` attached to the AI chat message (`ChatMessage.questions`), credit refunded, response `status: "clarify"` — no draft, no version bump. The client renders `ClarifyCard`; answering calls `sendMessage(phrase, { answering: true })` with the picks as natural-language text, and the `answering` flag (threaded to `proposeGarment`, enforced by a server-side guard) prevents the AI from asking again.
- **`explain` is the one non-drafting decision that is _not_ refunded.** The user asked a question — about pattern-making, or about MoldAI itself — instead of ordering a garment: the route posts the answer with the credit chip, keeps the `COSTS.adjust` debit, and responds `status: "answered"` with no draft, no version bump and no size-chart snapshot. It is charged because the Anthropic call is as real as a draft's and the user got what they asked for, where `ask`/`decline` refund precisely because they delivered nothing. `resolveDecision` throws on an `explain` carrying a blank `assistantMessage` — the message _is_ the payload there — so the route's catch refunds instead of charging for an empty bubble. This replaced the planned glossary screen (issue #20): a hand-written term list would have been a second, thinner source of knowledge the chat's model already has, and it could not answer "por que minha manga não fecha?". The prompt's `# Modeling knowledge` and `# Product facts` sections are what the decision reads from, and out-of-scope questions still `decline`.
- **#18: a chat message can carry one photo/sketch attachment, sent as an image content block in the same `propose_garment` call — and never persisted.** `components/editor/AttachmentChips.tsx`'s photo/sketch chips (the `.dxf` chip stays disabled — #11's parser now exists in `lib/import/`, but it backs the standalone `/import` screen and does not yet feed a chat attachment) open a hidden file input; `lib/editor/attachment.ts`'s `prepareImage` downscales to `MAX_ATTACHMENT_LONG_EDGE_PX` (1568 px long edge) and re-encodes as JPEG (quality 0.85) client-side, rejecting an unsupported type or a source over `MAX_ATTACHMENT_SOURCE_BYTES` (10 MB) before any decode work — the DOM-free half, exercised in the `node` test project; everything past it is genuinely DOM-only (`createImageBitmap`/canvas). The prepared attachment travels only with the request (`useEditorStore.sendMessage`'s `opts.image` → `lib/api-client.ts`'s `generate` → the route body's `image: {mediaType, data}` → `proposeGarment(state, answering, image)`), never written to the persisted `PatternState` — only `ChatMessage.hasImage` (additive/optional) records that one was used, rendered as a small "imagem enviada" chip (`ChatBubble`), never a thumbnail that would vanish on reload.
- **The browser's own preparation is a UX affordance, not the trust boundary.** `POST /api/patterns/[id]/generate` re-validates `body.image` with `lib/editor/attachment.ts`'s `validateAttachmentInput` (the `isPurchaseType`/`validateSizeChartPatch` precedent — narrows an unknown media type, rejects an empty or over-`MAX_ATTACHMENT_BASE64_CHARS` payload) before any debit or Anthropic call, answering `invalid_attachment` (400) otherwise. The route also reads its body through a route-local, larger `readJsonObject` ceiling (`lib/api/body.ts`'s `readJsonObject` now takes an optional `maxBytes`, defaulting to the shared `MAX_BODY_BYTES` every other, text-only route keeps using) — `MAX_ATTACHMENT_BASE64_CHARS` plus headroom, since an attachment's base64 payload would otherwise blow past the 64 KB ceiling sized for plain form fields.
- **Prompt injection via an attached image's own text is not a new attack surface.** `lib/ai/prompt.ts`'s `# Attached images` section tells the model to treat any text visible inside the image as content to describe, never as an instruction — but the actual defence is structural and pre-existing: `applyGarmentSpec` drafts through `resolveMeasurements`, which clamps every measurement to `MEASUREMENT_RANGES` regardless of what the model claims prompted the value (a mocked "the image said set bust to 500" spec is clamped to `MEASUREMENT_RANGES.bust.max`, asserted in the route's own test rather than in `lib/ai/index.test.ts` — `resolveDecision` itself passes `measurementOverrides` through unclamped; the range is applied downstream, at draft time).
- Costs exactly `COSTS.adjust`, identical to a text-only message — one `propose_garment` call either way.

---

## Design2GarmentCode mined for technique, not adopted; one gap it surfaced closed (#270 → #261)

**Decided and built.** #270 asked whether Design2GarmentCode (CVPR 2025, Style3D,
research code built on GarmentCode) — a published system solving the same shape of
problem (LMM produces a structured parameter set, a deterministic drafter consumes it) —
surfaces anything actionable for our prompt design, structured-output validation, or the
attachment/vision path. Full evidence: [`docs/reference/design2garmentcode-spike/README.md`](../reference/design2garmentcode-spike/README.md).

**Why the question came up at all.** `lib/ai/*` was built without reference to
comparable published research using the same architecture. Design2GarmentCode is a rare
case of a working system solving the identical problem shape, so it was worth checking
before assuming our own choices were already optimal — this was never an integration
spike (the adjacent question, registering GarmentCode itself as a drafting engine, was
already asked and declined above in this file's sibling, `drafting.md`'s "#266 → #269"
entry).

**The headline finding, on our side of the ledger.** Their LMM layer has no structural
output constraint — free-text GPT-4o output scraped by regex, checked post-hoc against a
409-token/59-category flat list duplicated by hand across two files. Ours is a forced
tool call against a JSON Schema whose every bound renders from one `EngineCapability`,
so an invalid enum value is structurally impossible rather than caught after the fact.
The trade: their vocabulary is ~10x wider (409 tokens vs. our 39, across 59 categories
vs. our 11) — real expressiveness we don't have, not a validation-discipline gap.

**A correction made mid-spike: much of this ground was already mined.** #250, #252,
#257, #260, #261, #262, and #264 turned out to already be open, each carrying a `Source:`
line citing a precise Design2GarmentCode or ChatGarment section (e.g. #260's `Source:
Design2GarmentCode (arXiv:2412.08603v3) sections 3.2.1 and 3.2.2`) — a prior pass had
already done a broader literature mining than this spike's own scope, encoding its
findings directly as issues rather than as a `docs/reference/` write-up. This spike's
independent read of the same source material (with direct code measurements this time,
not a secondhand summary — see the 409/59 correction above) corroborates rather than
discovers most of that ground, so nothing new was filed against #250/#252/#260/#262/#264:
restating an already better-cited issue with a second, less precise citation would be
noise, not signal. #257 got one addition worth recording here since it's a genuine
second, independent source: it already cited ChatGarment section 5 for the
"disclose what an edit changed" idea; this spike found the same idea, independently,
in `design2garmentcode-impl`'s Task 5 prompt (`lmm_utils/core.py`) — two unrelated
research systems landing on the same technique is a stronger signal than either citation
alone, noted as a comment on #257 rather than a new issue.

**Landed: two portable techniques, actually closing #261's own acceptance criteria.**

1. **Vision framing** — no prior issue existed for this one, a genuinely new finding.
   `# Attached images` (`lib/ai/prompt.ts`, cached static block) now states that a photo
   may show a person wearing the garment and to describe only the clothing, never the
   wearer — their own prompt spends three escalating repetitions on the same
   instruction, read honestly as GPT-4o refusal-avoidance rather than an accuracy
   technique. Cheap regardless of whether Claude ever actually needed it (not measured
   either way — no eval harness exists, see below).
2. **#261's repair retry, implemented against its own already-filed acceptance
   criteria** — `proposeGarment` (`lib/ai/index.ts`) previously threw straight to the
   route's catch (and a refund) on any of five malformed-payload shapes with zero repair
   attempt. It now replays the failed attempt and feeds the specific defect back once,
   capped at one retry (not #261's own quoted two, since our call shares a 30s
   transaction budget Design2GarmentCode's never did) — `REPAIR_TIMEOUT_MS` (8s) keeps
   both attempts' worst case at 28s, asserted directly in `index.test.ts`. #261's own AC
   specifically required the truncation case to retry with a _larger_ `max_tokens` rather
   than repeating the same ceiling — caught only by re-reading the issue's own text after
   drafting the first version of this change, which had missed it; the repair path now
   branches on `resp.stop_reason` and raises to `REPAIR_MAX_TOKENS_ON_TRUNCATION` (2048)
   only for that specific failure.

**Explicitly not implemented, and why.** Their prompt claims descriptive multiple-choice
options beat numeric estimation for length-like fields — directly relevant to our five
free scalars and to open issues #260/#262, both already filed and cited — but the paper
presents no ablation for this or any other design choice, and we have no eval harness
(#252, still open) to check it ourselves. Changing the schema on an unablated claim with
no way to measure the result would be exactly the kind of decision this document exists
to avoid making. Their fine-tuned parameter projector (bridging descriptive tokens into
GarmentCode's much wider continuous space) is out of scope for a sharper reason than
cost: it solves a problem we don't have — our spec is already the size its output would
be, produced directly by forced tool-use.

**The honest close.** Two follow-up spikes are filed as #270 itself asked for (#272
ChatGarment, #273 Style3D). One genuinely new gap, unrelated to any pre-existing issue,
was found while tracing the attachment path and filed as #274 (the editor chat sends one
image where the dashboard form sends four). This reopens only if #252's eval harness
ships and gives us a way to actually test the unablated multiple-choice claim above.

---

## `validateSpec`'s own substitutions get the same reporting channel `checkEngineSupport` already has (#250)

**Decided and built.** `validateSpec` (`lib/draft/garment.ts`) is deliberately
permissive — `pick()` swaps an unrecognized enum for a default, `clamp()` bounds
every scalar — and until this issue, neither left any trace. `lib/ai/prompt.ts`
already told the model to mention a clamp in its own `assistantMessage`, but that
is honour-system: a model that hallucinated `collar: "peterPan"` would happily
describe a Peter Pan collar in prose while `validateSpec` silently turned it into
`"none"` and the drafter built no collar at all — charged at full price, and with
nothing on screen to say so. `checkEngineSupport` (`lib/draft/engine/capability.ts`,
#267) already solved the identical shape of problem for a different boundary —
"an engine capability gap is reportable, never silently defaulted" — and the
generate route already turns its `EngineGap[]` into `tone: "notice"` bubbles. This
gives `validateSpec`'s own silent half the same channel.

**Why a pure sibling, not a change to `validateSpec` itself.** The issue's own
AC #4 required `validateSpec`'s signature and its three call sites
(`lib/ai/decision.ts` ×2, `lib/ai/formSpec.ts`) to stay untouched — widening its
return type would have forced every one of them (and every existing test) to
handle a payload they don't need. `lib/draft/specAdjustments.ts`'s
`describeSpecAdjustments(raw, validated)` is a pure, leaf-module diff instead —
same discipline as `lib/draft/vocabulary.ts` and `capability.ts`: imports only
types and the vocabulary catalogs, nothing from `garment.ts`.

**Why the diff has to be computed inside `resolveDecision`, not the route.**
`validateSpec` runs _inside_ `resolveDecision` — the route only ever sees
`decision.spec`, the already-validated result. Both halves of the diff (the raw
tool payload and the validated spec) exist together only at `resolveDecision`'s
own return sites, so that's where `describeSpecAdjustments` is called; the result
rides along as `AiDecision.adjustments`, optional and omitted when empty so every
existing bare-object mock of `proposeGarment` in `route.test.ts` keeps typechecking
unchanged.

**Two scope calls, made deliberately narrow:**

- **One notice bubble, not two.** A substitution and a clamp are structurally
  distinct (`SpecAdjustment`'s own discriminated union keeps them apart), but both
  say the same thing to the user — "this wasn't drafted exactly as asked" — so
  they render as one `chat.specAdjusted` bubble listing every field, in the same
  "one bubble per distinct kind of correction" shape the chart-substitution and
  engine-gap notices already use.
- **`measurementOverrides` stays out of this diff entirely.** `validateSpec` only
  key/finite-filters an override (an unrecognized key or non-numeric value is
  dropped, silently, same as before); the actual range clamp against
  `MEASUREMENT_RANGES` happens one trust boundary later, in
  `resolveMeasurements` (`lib/measurements.ts`) — folding that in here would mean
  `specAdjustments.ts` re-deriving a boundary it does not own and reporting a
  change `validateSpec` itself never made.

**The route also has to filter, not just render.** `mergeFormSpec` re-applies the
user's own explicit form choice over the model's inference, and the named chart's
gender always wins over the model's — either can make the FINAL drafted spec no
longer carry the value `validateSpec` substituted. Reporting a substitution that
did not survive into the drafted geometry would be worse than the silence this
issue closes: a stated correction the user cannot verify by looking at the
result. The `apply` branch filters `decision.adjustments` against the
post-merge, post-`chartGender` spec before rendering anything.

---

## #269: `proposeGarment` no longer talks to Anthropic directly

The request/repair loop this file's bullets describe above (the 20s/8s
timeout budget, the one-repair-attempt rule, the two-block cached system
prompt) used to live entirely in `lib/ai/index.ts`, which constructed the
Anthropic SDK client itself. It now lives behind a provider facade
(`lib/ai/provider/`) — every behavior described above is unchanged, but
`index.ts` itself no longer imports the SDK, and the repair loop's exact
wire protocol (Anthropic's `tool_result`, or an OpenAI-compatible `role:
"tool"` message for the self-hosted alternative) is decided by whichever
provider is active. Full rationale, including why this stayed a facade
rather than a hard swap, and the eval harness (#252) this issue built as
its own prerequisite: [`ai-provider.md`](ai-provider.md).

---

## ChatGarment mined for technique, second spike in the pair #270 asked for; nothing new landed here (#272)

**Decided and not built — a docs-only unit.** #272 asked whether ChatGarment
(CVPR 2025, Bian et al., a second independent published system solving the
same shape of problem as Design2GarmentCode: an LMM produces a structured
garment parameter set, a deterministic GarmentCode-family drafter consumes
it) surfaces anything the Design2GarmentCode spike missed, and where the two
diverge, which one is more likely right. Full evidence:
[`docs/reference/chatgarment-spike/README.md`](../reference/chatgarment-spike/README.md).

**A correction made before anything else could be trusted.** The batch this
issue shipped in described #258/#259/#262/#265 as already-merged PRs
(#303/#300/#306/#293 respectively). Checked directly against
`origin/main` rather than assumed: none of the five sibling PRs in this
batch (`#300`, `#303`, `#304`, `#306`, `#293`) had merged as of this spike.
Each is real, correctly-cited implementation work against its own issue —
nothing below re-proposes any of it — but the spike's own write-up is
careful to say "implemented in an open PR," not "landed," throughout.

**The headline: a genuine third architecture for structured output, not a
restatement of the Design2GarmentCode-vs-ours comparison.** ChatGarment
fine-tunes an open VLM (LLaVA-1.5-7B) to emit categorical fields as
ordinary text tokens — Design2GarmentCode's own shape — but routes every
continuous numeric field through a masked placeholder token and a
separately-trained regression head (a small MLP, its own L1 loss) instead
of generating it as text at all. Its raw output is still unconstrained free
text repaired post-hoc (no schema enforcement), so our forced-tool-use
`propose_garment` call remains the only one of the three architectures that
makes an invalid enum or a missing field structurally impossible rather
than merely less likely — the Design2GarmentCode spike's headline finding
holds up against a second independent system, not just the first.

**The divergence this spike's own acceptance criteria asked to investigate,
found and not silently dropped.** Design2GarmentCode's "multiple-choice
beats numeric estimation" claim (source of #260, now implemented as the
still-open #304) had no ablation behind it. ChatGarment's own Section 4.1
does run the analogous ablation: a baseline that generates continuous
values as plain text (no regression head) scores markedly worse (5.29 vs.
3.12 Chamfer Distance on Dress4D) than its shipped design. Read carefully,
this corroborates the **diagnosis** both systems share (LLMs are unreliable
at emitting precise continuous numbers as text tokens) but not the **cure**
#260/#304 already chose (categorical substitution) — ChatGarment's own fix
is a different, heavier technique (a fine-tuned regression channel) that
requires an ML investment neither system's predecessor spike found
justified for us. Two independent systems agreeing on the problem, for the
first time with real ablation evidence, is still a stronger signal than
one — it just isn't the same as agreeing on the fix, and this document says
so explicitly rather than force-fitting a clean convergence.

**A second real ablation, this one strengthening ground already covered.**
Appendix S2 ablates training without part-level image descriptions and
shows it measurably hurts reconstruction accuracy — direct, measured
support for the "describe the garment part-by-part before inferring the
spec" technique #258/#303 (open, unmerged) already implements as
`garmentReading`. The spike also traced #303's design against ChatGarment's
actual inference-time mechanism (a single combined-description call,
confirmed from the paper's own Table S8 example) rather than the
implementation's separate, per-part-isolated GPT-4o calls found in its
source — the latter is a dataset-construction-only detail, never part of
ChatGarment's own runtime path, so #303 already matches the right one.

**One genuinely new, portable idea, not implemented (docs-only unit).**
ChatGarment's per-part dataset-labeling prompts each carry an explicit
negative instruction — naming the _other_ parts not to attribute a feature
to (e.g., describing a collar: "strictly avoid mentioning sleeves, shirt
torsos"). #303's single combined description has no equivalent guard
against one part's feature bleeding into another's in the same pass.
Recorded in the spike as a candidate one-sentence addition to
`garmentReading`'s own prompt instruction — not built here, and not urgent
enough to justify reopening or re-scoping #258 for it alone.

**Confirmed, not changed: #265's own acceptance criteria already exceed
ChatGarment's own training-data design.** The spike found the actual
runtime prompt-augmentation code behind #265's cited "keep other parts
unchanged" instruction (five paraphrased template variants, all sharing
the same invariant) — real corroborating evidence, left as a comment on
#265 rather than a change to its AC, since #265 already scopes by a live
piece id rather than ChatGarment's fixed string vocabulary.

**The honest close.** No code changed in this unit by design — see
[`docs/reference/chatgarment-spike/README.md`](../reference/chatgarment-spike/README.md)'s
own Validity section for what a same-paper ablation on a fine-tuned 7B
LLaVA backbone does and does not tell us about Claude's own forced-tool-use
numeric reliability. Reopens only if the eval harness (#252, closed since
the Design2GarmentCode spike, code now on `main`) is ever run against the
specific claim either #260/#304 or this document's numeric-prediction
finding rests on.
