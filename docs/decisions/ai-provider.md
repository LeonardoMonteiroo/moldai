# AI provider

> This is the _why_. For the operative rule, see [`../architecture/ai-provider.md`](../architecture/ai-provider.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

## #269: a self-hosted, fine-tunable model with RAG, evaluated against the existing Anthropic call

**The ask.** Replace the hosted Anthropic model with a self-hosted model that
can be fine-tuned on the app's own pt-BR modeling vocabulary and backed by
RAG, accepting more latency for it. Explicitly a quality goal, not a cost
one — with the static system section (~6.2k tokens) cached at a 1h TTL,
Anthropic at this app's volume is cheaper than any GPU kept warm for it.

**What was true before this landed.** `lib/ai/index.ts:90` hardcoded
`model: "claude-sonnet-5"` as a literal, constructed the SDK client inline,
and owned the whole request/repair loop itself. There was no seam to swap
providers — no base URL, no env var, no interface. The surface was small
(one value import of the SDK, one type-only import, one client
construction, two `messages.create` calls) but soldered.

**Decision: a facade, not a replacement.** Mirrors
`lib/draft/engine/facade.ts` exactly, and for the identical reason
`drafting.md`'s own justification gives for that abstraction: in-repo
scoring (the eval harness this issue also had to build, since none existed
— see below), a stated contract (`LlmProvider`), and a per-request choice
(`LLM_PROVIDER`). Anthropic stays the default; the self-hosted provider is
additive, selected by an env var that defaults to unset.

**Decision: no production path yet, and that's deliberate, not an
oversight.** The app runs on a single public VPS with no GPU
(`docs/architecture/infra.md`) and the AI call runs _inside_ a 30s Prisma
transaction holding `Pattern`+`Wallet` row locks
(`lib/db/pattern.ts:TX_OPTS`) — `ANTHROPIC_OPTIONS`'s 20s timeout plus an 8s
repair budget is sized specifically to fit under that ceiling
(`lib/ai/index.ts`'s own comment, before this refactor). A self-hosted
model, especially unquantized or under load, will not reliably answer in
20s. Moving the AI call outside that transaction (reserve credit → call →
settle) is real, separate work this issue does not do — the facade exists
so that work can happen later without re-touching every call site, not so
it can be skipped. Until then, `LLM_PROVIDER=local` is for `npm run eval:ai`
and manual testing only, gated behind `docker-compose.gpu.yml`, an optional
Compose file never in `docker:prod`'s own file list.

**Decision: the eval harness is Phase 1, before any provider code.**
Issue #252 ("add an eval harness for spec generation and editing") was
already filed, open, priority high, and unimplemented — `lib/ai/` was the
one subsystem with zero measurement. Building a second provider without a
way to compare it against the first would be exactly the failure mode
`docs/decisions/generation-flow.md` already names: a prompt/schema change
shipped on inspection alone. `lib/ai/eval/{types,fixtures,score,report}.ts`
plus `scripts/ai-eval.ts` (excluded from both vitest projects' globs, run
via `npm run eval:ai`) closes #252: 33 generation fixtures across the five
`MOLDAI_CAPABILITY` types plus one case per non-`apply` decision, 8 editing
fixtures covering every `GarmentType` and every numeric `STYLE_LIMITS`
field, scored for decision accuracy, per-field accuracy, a draft-success
rate (applies, drafts, `seamCheck` empty — the in-repo analogue of
Design2GarmentCode's Simulation Success Rate the issue's own Context
section names), and a collateral-change rate.

**A correction made mid-implementation: #252's own acceptance criteria cited
a `diffSpec` that didn't exist.** It asked for collateral drift to be scored
"with the same `diffSpec` the editor uses" — no such function existed
anywhere in the repo. `lib/draft/specDiff.ts`'s `diffSpec(before, after)`
was written to fill exactly that gap: a pure field-by-field comparison of
two already-validated `GarmentSpec`s. It is deliberately **not** the same
function as `lib/draft/specAdjustments.ts`'s `describeSpecAdjustments`
(landed separately, closing #250) — that one diffs a raw AI payload against
what `validateSpec` did to it (substitution/clamping), a different
comparison with a different owner. Two functions doing two different
diffs, not one function doing both badly.

**The baseline, measured, not asserted.** The first `npm run eval:ai` run
against `claude-sonnet-5` (see `docs/reference/ai-eval/report.md`) scored
100% field accuracy, 100% draft-success, 100% editing accuracy with zero
collateral drift, but only ~70% decision accuracy — the model chose `ask`
on several fixtures this issue's own author expected to be clear-cut
`apply` cases (e.g. "quero uma blusa feminina com decote em V e manga
longa"). That is a real, honest finding the harness was built to surface,
not a bug in the harness: a blank-pattern prompt genuinely gives the model
less to go on than an adjustment to an existing spec does, and the prompt's
own decision policy explicitly favors `ask` when it judges detail
insufficient. It is left unresolved here — the harness's job is to make
this measurable and comparable across commits, not to force today's number
to look better by loosening the fixtures.

**Decision: 12GB VRAM buys one model, not two.** With the static+dynamic
prompt alone near 8.4k tokens before any attachment, and up to four
attachments adding several thousand more, a 7-8B model in 4-bit already
uses most of a 12GB card's headroom for context. Serving a VLM _and_
training a LoRA on the same card does not fit. `docker-compose.gpu.yml`
therefore serves exactly one model at a time —
`Qwen2.5-VL-7B-Instruct-AWQ` by default (text and the attachment/vision
path from one model), with `Qwen3-8B-AWQ` (text-only, likely stronger
structured pt-BR output, no vision) as the harness-decided alternative,
never chosen ahead of the numbers. LoRA training is explicitly pushed to a
rented GPU (an A100 for a few hours, on the order of a few dollars per
run) rather than attempted locally.

**Decision: the fine-tuning risk gets named, not hidden.** The prompt and
tool schema are _rendered_ from `EngineCapability` at request time — "never
tell the model a range the validator doesn't enforce"
(`docs/decisions/drafting.md`). A fine-tuned model's weights are a second,
frozen copy of that same vocabulary, taken at whatever moment training ran.
Add a `GarmentType` or an enum value later, and the prompt/schema/validator
all follow the capability automatically — the fine-tuned model does not.
This is the exact "never a second copy of a fact that already has an
owner" failure `CLAUDE.md` already prohibits elsewhere (`Wallet.planLabel`,
`Pattern.savedAgo`), just showing up in model weights instead of a database
column. Mitigation, not yet built: a LoRA sits on top of the full rendered
prompt (never replaces it), and a capability-hash check should fail loudly
when the capability changes without a corresponding retrain marker — the
same mechanism `prompt.test.ts`'s pinned sha256 already uses, aimed at
weights instead of prompt text.

**Decision: RAG stays narrow, on purpose.** Enums, numeric bounds, and
measurement ranges continue to come from `EngineCapability` exclusively,
with no exception — a retrieval layer that could suggest vocabulary would
be exactly the second, driftable source this repo has already paid down
twice (`validateSpec` vs. `checkEngineSupport`'s "may substitute" / "may
only report" split; the capability-vs-form-fields disagreement pinned by
`capability.test.ts`). RAG is scoped to `decision=explain` and to the
prompt's own `# Vocabulary mapping` synonym table — open pt-BR
modeling-knowledge prose, exactly where a 7-8B open model is expected to
lose the most ground to Sonnet, and where retrieving real domain text
plausibly helps. Not yet built in this pass; gated on the harness showing
`explain` quality actually improves, same as the LoRA gate above.

**Decision: capture the decision, not a second copy of the prompt.** The
original Fase 4 sketch proposed a new `AiTurn` Prisma model duplicating
`ChatMessage.text`. Built instead: two additive, optional `ChatMessage`
fields — `decision` (the model's actual `apply`/`decline`/`ask`/`explain`
choice, set on the primary AI bubble of every `proposeGarment` branch in
`app/api/patterns/[id]/generate/route.ts`) and `draftVersion` (only on
`apply`, `state.pattern.version` read immediately after `bumpVersion`, so a
future exporter joins to `PatternVersion` via its own existing
`(patternId, version)` key). No new table, no duplicated `promptText` —
the user's own message is already in `Pattern.data.chat`, and storing it
twice would be exactly the "never a second copy of a fact that already has
an owner" failure this document already calls out for the fine-tuning risk
above. Reviewed by the `migration-safety` agent (PASS — additive optional
blob keys on both `lib/types.ts`'s `ChatMessage` and
`lib/schemas/pattern.ts`'s `ChatMessageSchema` together, `draftVersion` read
at the correct point relative to the bump, no consumer mishandles the new
keys, no reset/backfill needed). This also sidesteps the retention/consent
question the original sketch raised: no new raw text is collected, only
structured tags on data the app already retains to operate the pattern
editor — using it to train a model later remains a separate purpose-
limitation decision, not resolved here, and not required to be, since
nothing in this pass sends that data anywhere.

**Decision, then a measured reversal: synthetic data from the catalog
benchmark, tried and found unproductive.** `scripts/distill-training-data.ts`
translates a catalog entry's `descriptionEn`/`category`/`gender` into a
pt-BR customer request (one plain-text Anthropic call), feeds it through
the real `proposeGarment`, and keeps the pair only if the result is
`decision=apply` AND `lib/ai/eval/score.ts`'s own `draftSucceeds` passes —
the identical self-verifying criterion the eval harness scores against.
**Two smoke runs (6, then 20, entries — after fixing a `gender: null`
templating bug that was producing the literal string "Gênero: null") kept
0 of 26.** Reading the misses: nearly every one is a legitimate `decline`,
because the catalog's real garments carry construction details
(side panels, patch pockets, cropped hems, tapered/cargo trouser legs)
`MOLDAI_CAPABILITY` genuinely does not draft — `checkEngineSupport`'s "no
third enum value for an unsupported shape" rule (`docs/architecture/
drafting.md`) working exactly as designed, not a bug in the pipeline. The
full ~172-entry batch was deliberately NOT run at this yield rate — it
would spend real tokens for a similarly small return. Full accounting and
the recommended pivot (a combinatorial generator enumerating
`MOLDAI_CAPABILITY`'s own supported combinations directly, so every
generated example is in-scope by construction, rather than filtering a
corpus built for a broader capability) is in
[`../reference/lora-training/README.md`](../reference/lora-training/README.md).
Not built in this pass — a real design task of its own.

**Decision: the LoRA training scaffold is built, reviewed, and explicitly
unexecuted.** `scripts/lora/{prepare_dataset.py,train_lora.py,
requirements.txt}` plus the runbook above give a complete, dependency-clean
(no Node on the training host) QLoRA pipeline: rank-16 LoRA over Qwen's
standard attention+MLP projections, Hermes-style `<tool_call>` targets
matching `docker-compose.gpu.yml`'s own `--tool-call-parser hermes`, a
held-out validation split fixed before training. **None of it has run** —
no GPU exists in the environment that wrote it, and the dataset it would
train on is currently empty (the finding immediately above). Calling this
"done" would be exactly the overclaiming this document's own honesty
standard exists to prevent; it is reviewed, ready code, not a proven
result. The gate from the top of this section stands unchanged: a LoRA
ships only once it beats the un-adapted base model on `npm run eval:ai`,
scored on a split held out before training.

## Related, prior decisions this one builds on

- `drafting.md`'s "#266 → #269" entries: the precedent for a swappable
  facade behind a stated capability contract, and the "never tell the
  model a range the validator doesn't enforce" rule this decision extends
  to a second axis (provider, not just engine).
- `generation-flow.md`'s Design2GarmentCode spike (`#270`): the repair-retry
  precedent (`#261`) this refactor relocated into each provider unchanged,
  and the "no eval harness exists" gap (`#252`) this issue finally closes.
