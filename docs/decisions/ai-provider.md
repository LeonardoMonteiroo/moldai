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

## Follow-up: the ~70% decision accuracy was a prompt defect, not a model limit

**Issue #252 was reopened at the wrong milestone.** The eval harness itself
(fixtures, scoring, report, `npm run eval:ai`) was complete and correct —
every one of #252's acceptance criteria is satisfied by the code above. But
the commit that built it also claimed to "close out issue #252" and the
issue stayed open, which conflated "the harness exists" with "the harness's
own finding is resolved." It wasn't: the baseline's ~70% decision accuracy
sat unresolved for a day of in-repo time. This entry closes that finding
out, separately from the harness that surfaced it.

**Root cause, found with `--verbose`, not guessed.** `scripts/ai-eval.ts`
gained an `--only <ids>` + `--verbose` flag pair (never writes the committed
report — only a full run does) specifically to see the model's own
`assistantMessage`/`questions` on a mismatch instead of just its pass/fail
verdict. Read against the ten failing fixtures, the pattern was not "blank
patterns are genuinely underspecified" (this file's own prior paragraph's
hypothesis) — it was that the model asked about fields that already have a
safe drafter-side default. `blouse-v-long` ("decote em V e manga longa")
still got asked for `fit`; `skirt-aline` ("saia evasê") got asked for
length, fit, _and_ waistband. `lib/draft/garment.ts:107`'s `validateSpec`
and the drafters themselves (`lib/draft/body.ts:295`, `lib/draft/ease.ts:98`,
`lib/draft/garment.ts:331-333`) already fall back to a concrete default —
`"straight"` neckline, `"none"` sleeve, `"fitted"` fit — for every style
field the AI leaves unset. Nothing about the drafting engine required the
model to collect them first; the prompt's own `# Decision policy` bullet
just named `neckline, sleeve, fit, length, size` as generic "relevant
detail," which read to the model as a checklist to fill rather than a list
of things that already have an answer.

**The fix: rewrite what "underspecified" means, not just the blank-pattern
example.** Two spots, both in `lib/ai/prompt.ts`: the static `# Decision
policy` ask bullet (touches the cached prefix — a deliberate, expected
sha256 regeneration in `prompt.test.ts`, not a silent one) now says ask is
for a request naming NOTHING beyond the garment type, and that naming even
one silhouette/feature/adjective is enough to apply since every other field
already has a default; and `buildDynamicSection`'s blank-pattern paragraph
(the per-request, uncached half) was reworded to match and point back at
it, rather than repeating its own, narrower field list.

**Negative controls came before the prompt edit, not after.** Before
touching `prompt.ts`, `lib/ai/eval/fixtures.ts` gained five more non-`apply`
cases — `ask-blouse-bare`, `ask-trousers-bare` (genuinely bare requests that
must still `ask`), `decline-trouser-silhouette` (a second `decline`, a
flare/bootcut leg — the policy's own named out-of-scope silhouette), and
`explain-armhole` (a second `explain`). Loosening an ask-vs-apply policy is
unmeasurable in the direction it can hurt without something that can
actually regress; a single `ask-underspecified` fixture would have let an
over-eager rewrite score as pure improvement.

**Measured, not asserted, again.** Full `npm run eval:ai` after the rewrite:
decision accuracy **100%** (37 generation cases, up from 33), field accuracy
98.6% (one single-run miss on `tshirt-low-stretch`'s `stretch` field that
re-ran clean in isolation — sampling noise on a non-zero-temperature model,
not a regression this fix introduced), draft-success 100%, editing 100%
with zero collateral. Every widened negative control (`ask-blouse-bare`,
`ask-trousers-bare`, `decline-trouser-silhouette`, `explain-armhole`, plus
the original `ask-underspecified`/`decline-jacket`/`explain-dart`) passed —
the harness did not just get better at the ten it was built to fix, it held
the line on the cases meant to catch the fix going too far.

**A small provider-facade gap fixed in passing, because this work depended
on trusting it.** `scripts/ai-eval.ts`'s report header hardcoded
`MODEL = "claude-sonnet-5"` / `PROVIDER = "anthropic"` as a second copy of
the literal that now lives at `lib/ai/provider/anthropic.ts`'s `MODEL`
const — CLAUDE.md's "never a second copy of a fact that already has an
owner," and one that would have silently mislabeled a `LLM_PROVIDER=local`
report as an Anthropic one. `LlmProvider` gained a `model(): string` method
(a function, not a static field, since `openaiCompatProvider` resolves
`LLM_MODEL` from the environment at call time, the same reason
`getProvider()` itself reads `LLM_PROVIDER` at call time rather than once at
module load) and the runner now reads `getProvider().id`/`.model()` instead
of its own literals.

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
Built in the pass documented immediately below.

**Decision: the combinatorial generator, built as a second, parallel
tool.** `lib/ai/training/{combinations,phrasings,verify,batch}.ts` plus
`scripts/generate-training-data.ts` (`npm run generate:training`) —
`scripts/distill-training-data.ts` and everything else from the #269 Fase
1-4 pass are untouched. The core framing: a (combination, phrase) pair IS a
`lib/ai/eval/fixtures.ts` `GenerationCase` — enumerate thousands of them from
`MOLDAI_CAPABILITY` itself, run each through the same `proposeGarment`
facade the app uses, and keep a pair only when the model's own returned spec
agrees with the fields the phrase actually named. This reuses
`lib/ai/eval/score.ts`'s scoring shape rather than inventing a second one.

**Decision: phrasing is authored, verification is paid — and that split is
deliberate, not a cost-cutting shortcut.** A batched Anthropic call for
phrasing was considered and costed (~5% of total spend, since verification —
one `proposeGarment` call per phrase — dominates at Sonnet 5 pricing) but
rejected in favor of a committed, hand-composed pt-BR corpus
(`lib/ai/training/phrasings.ts`): free, diffable, reviewable by a pt-BR
native in a PR, and deterministic across re-runs, with an opt-in
`--fill-gaps` API path (a plain phrasing-only completion, never routed
through `proposeGarment`) reserved for scaling past what the composer's own
fragment/template/use-case combinatorics can produce distinctly. The
composer deliberately isn't a rigid template grammar: 2-4 alternative
fragments per (field, value), at least one of them phrased WITHOUT
`lib/ai/prompt.ts`'s own `# Vocabulary mapping` synonyms, rotated in
mechanically rather than authored as a separate adversarial track.

**Decision: negatives are derived from the same enumeration, not
hand-listed, except where there is genuinely nothing to derive from.** `ask`
comes from low-arity (1-2 named fields) combinations — real requests vary in
richness, and a thin one is exactly what the prompt's own blank-pattern rule
already pushes toward `ask`, so whichever decision the model actually
returns for a thin combination is kept as real signal rather than forced to
one expected answer. `decline` is the capability's own complement (a
`GarmentType` outside `MOLDAI_CAPABILITY.types`, or a shape `lib/ai/prompt.ts`
itself names as unbuilt — Peter Pan collar, tapered/flare/skinny/wide
trouser leg, elastic waistband, a lined/lapelled jacket) — a fixed, small,
hand-authored list, since there is no capability to enumerate a GAP from.
`explain` is fully hand-written modeling-knowledge questions, the same
footing as `lib/ai/eval/fixtures.ts`'s own single `explain` case, just more
of them.

**A correction made mid-implementation: `armholeDeepenCm` needed its own
verification rule, not `lib/ai/eval/score.ts`'s `draftSucceeds`.** That
field's own documented behavior (`lib/ai/prompt.ts`'s own line) is to deepen
the body's armhole WITHOUT touching the sleeve cap — BY DESIGN a real,
user-resolvable "armhole-cap" `seamCheck` conflict, since `sleeveRefit` (the
field that would pre-empt it) is internal-only. The first version of this
generator's own test caught every one of its `armholeDeepenCm` combinations
failing `draftSucceeds`'s "fully empty seamCheck" bar — not a drafting bug,
a verification bar that was wrong for this one field. Fixed with a shared
`lib/ai/training/verify.ts#draftsCleanly` that allows exactly the
"armhole-cap" conflict through when `expectsArmholeCapConflict` says the
combination expects it, used by both the test and the generator script so
neither can drift from the other's definition of "drafts cleanly".

**Two real bugs, both found by live-testing the tool against the real API
before committing to the full run, not by inspection.** (1) The Batch API
caps `custom_id` at 64 characters — well under this generator's own
descriptive task ids (a combo key alone can exceed that) — fixed by sending
a short hash on the wire while keeping the full descriptive id in the output
JSONL. (2) The batch sidecar (`data/training/combinatorial.batch.json`,
written so a resumed run doesn't re-submit an in-flight batch) was never
deleted after a batch's results were fully collected — a second invocation
would have "resumed" an already-finished batch instead of submitting fresh
work for whatever was still pending. Both confirmed fixed by re-running a
small real batch afterward. A third, narrower gap — a crash between
collecting a batch's results and clearing its sidecar could re-append
already-written examples on the next resume — is closed with an `already`-id
dedup guard rather than left as a known risk.

**Measured, not asserted: a small live smoke run.** 131 `apply` combinations
enumerated from `MOLDAI_CAPABILITY` (blouse 36, dress 42, tshirt 26,
skirt 16, trousers 11), zero dropped by the offline pre-filter, zero
under-covered `(type, field, value)` triples at the shipped seed, 825 total
tasks (786 apply + 24 decline + 15 explain) at the ~1,000-phrase budget. A
53-call live smoke (`--transport=live`) kept 40/53 (~75%) — arity-1
combinations returned `ask` 11/12 times (consistent with the baseline
`docs/reference/ai-eval/report.md` already measured: the blank-pattern rule
genuinely biases a thin request toward `ask`), arity-3/4 combinations never
returned `ask` in this sample. Full accounting of what these numbers do and
don't prove — a small sample, not a statistically powered measurement — and
the LoRA gate itself, are unchanged from the sections above.

**Decision: the LoRA training scaffold is built and reviewed.**
`scripts/lora/{prepare_dataset.py,train_lora.py,requirements.txt}` plus the
runbook above give a complete, dependency-clean (no Node on the training
host) QLoRA pipeline: rank-16 LoRA over Qwen's standard attention+MLP
projections, Hermes-style `<tool_call>` targets matching
`docker-compose.gpu.yml`'s own `--tool-call-parser hermes`, a held-out
validation split fixed before training. It has since been run for real (see
the entry immediately below) — the gate from the top of this section stands
unchanged regardless: a LoRA ships only once it beats the un-adapted base
model on `npm run eval:ai`, scored on a split held out before training.

## 2026-09-07: a real training run, and the LoRA did not clear the gate

**What ran.** A rented RunPod A100-80GB (`moldai-lora-training`) trained
`train_lora.py`'s defaults (rank 16, 3 epochs, Qwen3-8B base) on the 595/66
train/val split the combinatorial generator had already produced
(`scripts/lora/dataset.jsonl` + `.val.jsonl`, committed nowhere — gitignored
local data). Training completed cleanly: loss fell from 1.55 (step 1) to
0.033 (final), eval loss ended at 0.031 with 99.2% mean token accuracy on
the held-out split, no sign of overfitting collapse between epoch 2 and 3.
Two real bugs surfaced by this first actual run, both fixed in `3f78fc7`
(base model default corrected from the VL/multimodal candidate to text-only
Qwen3-8B; two `trl` 1.12.0 API renames) — see that commit and
`train_lora.py`'s own top comment.

**The gate check: served via vLLM (`--enable-lora`, `--tool-call-parser
hermes`, `--enable-auto-tool-choice`) on the same rented pod, `npm run
eval:ai` run twice against it — once with `LLM_MODEL=Qwen/Qwen3-8B` (the
un-adapted base), once with `LLM_MODEL=moldai-v1` (the trained adapter) —
same held-out fixtures both times.** Result was a genuine split, not a clean
win:

| Metric                                  | Base Qwen3-8B | LoRA (moldai-v1) |
| --------------------------------------- | ------------- | ---------------- |
| Decision accuracy (37 cases)            | 94.6%         | 91.9%            |
| Field accuracy (73 fields, apply cases) | 98.6%         | 90.4%            |
| Draft-success rate                      | 100.0%        | 100.0%           |
| Editing change accuracy (8 cases)       | 87.5%         | 100.0%           |
| Editing collateral-change rate          | 50.0%         | 37.5%            |

The LoRA measurably improved editing (fixed every one of the base model's
4 collateral/missed-change failures) but regressed generation: it now
misreads **all three** `ask` fixtures as `apply` (the base model still
missed 2 of 3, but not all), and field accuracy on `apply` cases dropped
8.2 points — new misses on dress/skirt/tshirt fields the base model got
right unaided. Generation is 37 of the 45 scored cases; a regression there
is not offset by an improvement on the smaller editing set.

**Decision: does not ship.** Per this document's own gate ("a LoRA only
ships if it beats the un-adapted base model"), a mixed result where the
larger, more central task (generation) got worse is read as a fail, not a
partial pass — the same standard that keeps a prompt/schema change from
shipping on inspection alone applies here to a fine-tune. Leading
hypothesis, not yet verified: the combinatorial dataset's `apply`-vs-`ask`
mix (arity-1 combinations biased toward `ask`, see the smoke-run entry
above) may be under-representing the decision boundary relative to how
much of the corpus teaches editing-style behavior, pushing the fine-tuned
model toward "always apply." Not investigated further in this pass — next
attempt should look at the trained example's decision-label distribution
before changing rank/epochs/learning-rate.

**Both full eval reports, and the training/eval run logs, are kept as local
scratch files (`scripts/lora/eval-{base,lora}-report.md`,
`scripts/lora/eval-{base,lora}-run.log`, gitignored, not committed) — the
committed `docs/reference/ai-eval/report.md` baseline (Anthropic) was
restored via `git checkout` immediately after both experimental runs, never
overwritten by this pass.** The trained checkpoints themselves
(`scripts/lora/lora-checkpoints/checkpoint-{38,76}/`,
`scripts/lora/lora-out-final/`) are kept locally, also gitignored, in case a
future session wants to resume from them (e.g., retrain from the same base
with a rebalanced dataset) rather than paying for a second full run from
scratch.

## Related, prior decisions this one builds on

- `drafting.md`'s "#266 → #269" entries: the precedent for a swappable
  facade behind a stated capability contract, and the "never tell the
  model a range the validator doesn't enforce" rule this decision extends
  to a second axis (provider, not just engine).
- `generation-flow.md`'s Design2GarmentCode spike (`#270`): the repair-retry
  precedent (`#261`) this refactor relocated into each provider unchanged,
  and the "no eval harness exists" gap (`#252`) this issue finally closes.
