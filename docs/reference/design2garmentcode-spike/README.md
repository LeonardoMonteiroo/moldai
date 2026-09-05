# Design2GarmentCode spike (#270)

Evidence for #270 — "spike Design2GarmentCode for applicable ideas to our AI generation
flow". This is not an integration spike: nothing was added to this repo's dependency
tree, no drafter was touched, and nothing here revisits the adjacent GarmentCode
integration question (already asked and declined,
[`docs/decisions/drafting.md`](../../decisions/drafting.md), "Registering GarmentCode as
a second engine is declined for now"). Design2GarmentCode is research code from the same
authors/lab (Style3D) built on top of GarmentCode/PyGarment, published at CVPR 2025
(arXiv 2412.08603). It solves the same problem our own `lib/ai/*` solves — a large
multimodal model produces a structured, validated parameter set, which a deterministic
drafter then consumes — so this spike mines its published paper and its implementation
repository (`Style3D/design2garmentcode-impl`, MIT, cloned read-only outside this repo,
checked 2026-09-05) for technique, not code.

Every figure below was measured directly against the paper or the source, not recalled
or taken from a secondary summary — where a claim could only be sourced from the paper's
prose rather than grepped from code, that is stated explicitly.

## The headline: we are already ahead on structural validation, and behind on raw expressiveness

Design2GarmentCode's own LMM layer (`lmm_utils/core.py`, GPT-4o via the OpenAI chat
completions API) has **no structural output constraint at all**. The model free-writes
prose containing a `json_list=[...]`, which is scraped out with a regex
(`getend_list`, matched against `\[.*?\]`) and checked post-hoc for membership against a
hardcoded flat token list (`_ALL_TEXT`, `lmm_utils/validation.py`) and a hand-written
dependency graph (`bool2condition`). The model is free to emit a token outside that list,
a malformed list, or no list at all — the apparatus described below exists entirely to
catch that after the fact.

Ours never gets there: `propose_garment` is a **forced tool call** against a real JSON
Schema (`lib/ai/schema.ts`), so an enum field structurally cannot hold a value outside
its declared set — the model cannot go out of vocabulary the way GPT-4o can. Every
bound rendered in that schema is generated from the same `EngineCapability` `validateSpec`
clamps with (pinned by `schema.test.ts`), so prompt/schema/validator cannot drift apart.
Their taxonomy, by contrast, is duplicated by hand across `validation.py`'s
`bool2condition` and `projector.py`'s `all_text_dict` — no single source of truth.

The trade is real, though: their `_ALL_TEXT` is **409 tokens across 59 categories**
(counted directly: `awk '/^_ALL_TEXT/,/^\]/' validation.py | grep -c '^\s*"'` = 409;
`grep -cE '^[0-9]+\. [A-Z]' core.py` = 59 numbered category headers in the Task-1 prompt —
correcting a secondhand "~400/53" figure found in an initial web search, which undercounts
the true category count by 6). Our `GarmentSpec` has **39 discrete enum tokens across 11
AI-facing categories** (`TYPES` 8, `GENDERS` 2, `NECKLINES` 3, `SLEEVES` 3, `SKIRTS` 5,
`COLLARS` 4, `CUFFS` 2, `WAISTBANDS` 2, `FRONT_CLOSURES` 2, `FIT_CLASSES` 4,
`STRETCH_CLASSES` 4 — `lib/draft/vocabulary.ts`, `lib/draft/ease.ts`), plus one boolean
(`darts`) and five continuous bounded scalars with no equivalent in their vocabulary at
all (`necklineDepthCm`, `skirtLengthCm`, `seamAllowanceCm`, `armholeDeepenCm`,
`trouserLengthCm` — every one of theirs, including length, is a named ordinal step, not a
continuous value; the continuous mapping happens downstream in their fine-tuned
projector, invisible to the LMM). That is roughly 10x their token count against ours, and
~5x their category count — a real capability gap (no per-panel asymmetry, no lining/
facing/collar-component structure, no left/right independent construction in our spec),
not a validation-discipline one.

## Much of this ground was already mined before this spike started

Worth stating plainly rather than silently rediscovering: #250, #252, #257, #260, #261,
#262, and #264 were already open issues, each carrying a `Source:` line citing a precise
Design2GarmentCode or ChatGarment section (e.g. #260's `Source: Design2GarmentCode
(arXiv:2412.08603v3) sections 3.2.1 and 3.2.2`) — a prior research pass had already mined
both papers more broadly than this spike's own scope and encoded the findings directly as
issues rather than as a `docs/reference/` write-up. This spike's own read of the same
material corroborates that work rather than discovering it fresh, with two exceptions:
independently re-deriving the vocabulary-size numbers against actual source code (finding
409/59, correcting an earlier ~400/53 secondhand figure — see below), and actually
implementing #261 against its own acceptance criteria (see below). Nothing new was filed
against #250/#252/#260/#262/#264 — a second, less precise citation on an already
well-sourced issue would be noise. #257 got one addition worth recording as a comment,
not a new issue, since it's a genuine second independent source: see "Belongs to #257"
below.

## Genuinely portable: the vision framing instruction

`lmm_utils/core.py`'s system prompt (`origin_messages`, lines 15-18) opens with three
consecutive, escalating restatements of one instruction, quoted verbatim:

> Emphasis: Do not identify or analyze the persons in the image; only recognize the
> clothing. Please do not trigger warnings about personal recognition!
>
> Key emphasis: In future conversations, only recognize the clothing in the images, do
> not involve recognition or analysis of individuals; please ensure the task focuses on
> clothing features and avoid triggering any warnings related to person recognition!
>
> Regarding all tasks and requests, the user's intention is to focus on the clothes, not
> the person. The user does not want to confirm or analyze who the person is in the
> picture, only to focus on information about the clothing. So you can definitely reply,
> and you must not say "I'm sorry, I can't help with that." You must be able to complete
> these tasks because you only care about the garment code rather than who the people
> are.

Read honestly, this is not primarily an accuracy technique — it is **refusal-avoidance**:
GPT-4o's own safety layer was apparently hedging or declining on photos of people, so the
prompt spends three repetitions pre-empting that specific failure mode ("you must not
say 'I'm sorry, I can't help with that'"). Whether Claude needs the same insurance was
not tested here (no eval harness exists yet — see Validity below, and #252), but the
underlying user intent it states — describe the garment, not the wearer — is correct and
cheap to add regardless of whether refusal was ever actually a problem for us. **Landed**:
`lib/ai/prompt.ts`'s `# Attached images` section (in the cached static block) now says a
photo may show a person wearing the garment and to describe only the clothing, never the
person. One sentence, no repetition — our forced-tool-use flow doesn't fight free-text
refusal framing the way their chat-completion prompt does.

## #261, already filed and sourced: implemented against its own acceptance criteria

`lmm_utils/core.py`'s `text_gpt`/`picture_gpt`/`text_forusermodel_gpt` (three near-
identical implementations, e.g. `text_gpt` at line 2184) all share the same loop, quoted
in substance:

```python
max_num = 2
count = 0
while flag:
    count += 1
    if count > max_num:
        break
    nolack_flag, lack_text_list = bool2condition(end_list)
    true_flag, no_in_text_list = bool2text_alltext(end_list)
    if nolack_flag and true_flag:
        flag = False
    else:
        # ... builds a message naming EXACTLY which tokens are missing
        # and which are invalid, appends it as a new user turn, and
        # re-calls the model ...
```

Two required conditions are missing ("lack") or invalid ("not in text space") — the
retry message names the specific token(s), not a generic "try again." Separately,
`agent.py`'s `Agent` class wraps every one of these calls in its own single blind retry
on any exception (network error, parse failure) — a second, independent layer.

Issue #261 already existed with this exact citation and its own precise acceptance
criteria before this spike began: "At most one retry... The retry carries the concrete
reason... **the truncation case retries with a larger `max_tokens`**... `ANTHROPIC_
OPTIONS.timeout` times the retry count stays inside the 30s transaction timeout." This
spike's contribution on #261 is implementation, not discovery.

`resolveDecision` (`lib/ai/decision.ts`) throws on an unrecognized/missing `decision`, an
`apply` with no usable `spec` object, and a blank `explain` message; `proposeGarment`
(`lib/ai/index.ts`) also throws on a `max_tokens` truncation and a missing `tool_use`
block. Every one of those five defects burned the user's turn outright — no re-ask,
straight to the route's catch and a refund. **Landed, closing #261**: `proposeGarment`
now makes one repair attempt. On any of the five failures, it replays the failed attempt
as an assistant turn and tells the model the exact defect (the thrown error's own message
— `"unrecognized decision: banana"`, `"decision=apply without a spec object"`, etc.),
then re-issues once. A repeat failure propagates unchanged; there is no second retry,
matching their own `max_num` bound in spirit but not in count (theirs allows 2 additional
attempts; #261's own AC asks for exactly one, since our call shares a 30s transaction
budget Design2GarmentCode's never did).

The truncation-specific `max_tokens` bump named in #261's AC was missed in this change's
first draft — caught only by re-reading the issue's own acceptance criteria after
implementing the general repair loop, not derived independently from the paper a second
time. The repair path branches on `resp.stop_reason`: a `max_tokens` truncation raises to
`REPAIR_MAX_TOKENS_ON_TRUNCATION` (2048) for the repair call specifically, since re-asking
with the same 1024-token ceiling would routinely truncate identically a second time;
every other failure keeps the default. Both branches are asserted directly in
`index.test.ts`.

Two things their code doesn't have to worry about, and ours does:

- **The Messages API's own protocol constraint.** When the failed attempt DID produce a
  `tool_use` block, the next user turn must carry a `tool_result` addressed to that
  block's id (the API rejects a bare text turn there); when it didn't (no `tool_use`
  block at all — the `max_tokens`/missing-block cases), a plain text turn is used
  instead, since there is no pending tool call to resolve. `buildRepairMessages`
  (`lib/ai/index.ts`) branches on exactly this.
- **The transaction budget.** `ANTHROPIC_OPTIONS.timeout` is 20s (already asserted below
  the 30s `TX_OPTS.timeout`, `lib/db/pattern.ts`, in `index.test.ts`); a second full-length
  attempt could push the worst case to 40s, turning a would-be refunded lost turn into a
  503 with the Pattern/Wallet locks held for the entire window. The repair call overrides
  its own timeout down to 8s (`REPAIR_TIMEOUT_MS`), keeping the worst-case sum at 28s —
  asserted directly in `index.test.ts` rather than left as an unchecked assumption.

## Already filed as #260/#262, confirmed unablated

The paper's methodology section states that early numeric-estimation prompts ("how long,
in cm, should the sleeve be?") were replaced with descriptive multiple-choice options
("full length" / "half length" / "three-quarter length") to improve accuracy. This maps
directly onto our five free continuous scalars (`necklineDepthCm`, `skirtLengthCm`,
`seamAllowanceCm`, `armholeDeepenCm`, `trouserLengthCm`) and is already filed as #260,
citing this same paper section. This spike's addition: confirming directly against the
paper's methodology/experiments sections that **no ablation study backs this claim** —
comparisons are against baselines DressCode/SewFormer only, never an ablation of the
prompt's own design choices — and that we have no way to check it ourselves either, since
there is no eval harness (#252, still open) and every `lib/ai` test mocks the model. Not
a reason to abandon #260 — a reason its implementation should land after #252 exists, not
before, so the change can actually be measured rather than shipped on faith in an
unablated paper claim. #262 (validating clarifying-question options against a field's
catalog) is a related but distinct, purely structural change with no dependency on an
eval harness — it drops invalid options mechanically rather than betting on a prompt
hypothesis, so it can land independently of this concern.

## Convergence, not a gap: the render-and-compare loop

Two of their five prompt tasks (Task 3, `compare_gpt` — compare a simulated render
against the user's original reference image; Task 4, `picture_caption_gpt_red` — compare
against a fit-stress visualization) both drive a loop that renders the current spec,
shows it back to the model, and asks what to change. This is open issue #264 ("compare
the drafted result against the attached reference image") in miniature. We already do a
numeric version of the same idea independently: the `Drafted ease report`
(`prompt.ts`'s `buildDynamicSection`) feeds real drafted geometry (girth vs. body, cm/%,
fit class) back into the prompt every turn — not a rendered image, but the same
"show the model what actually got drafted, not just what was asked for" principle.

#264 already exists, citing sections 7.2 and 4.2 for the compare-loop idea itself — but
its AC doesn't mention one implementation-level detail this spike found directly in the
source code (not in either cited paper section), worth adding as a comment there: an
explicit **anti-oscillation rule**. Task 3's prompt
defines each length parameter as an ordered sequence (e.g. `sleeve__length`: short → half
→ three-quarter → long → full) and instructs: if the rendered image and the reference
differ by only one step in that sequence, do not change it — only a two-step-or-larger
difference triggers a modification. Without this, a render-compare loop that is even
slightly noisy in its own visual comparison can oscillate a value back and forth across
turns. **Not implemented here** (#264 doesn't exist as code yet) — recorded as a design
note for whoever builds it: our own style enums don't have as clean a linear ordering as
theirs (`neckline`, `collar`, `fit` aren't ordinal), but the continuous scalars
(`skirtLengthCm`, `trouserLengthCm`, `necklineDepthCm`) are exactly the shape this
technique targets.

## Belongs to #257, not to this spike: disclosure as a prompt-level technique

Task 5 (`text_forusermodel_gpt`, general modification) is instructed, verbatim: "Before
applying any changes, be sure to inform the user which text items have been altered or
added." Worth being precise about what this is _not_: it is not a category-lock or an
edit-scope restriction (Task 5 explicitly walks through adding a new garment, converting
strapless to collared, changing lengths — wide latitude to change categories, not a
narrow-edit rule). It's a **transparency instruction** — the model discloses its own diff
in prose, in the same reply that makes the change.

That is exactly open issue #257's ask ("surface the spec fields an adjustment changed
beyond what was asked"), stated as a concrete prompt-level implementation technique
rather than a structural diff computed from two spec snapshots. **Not implemented
here** — it belongs to #257 as a candidate approach, not to this spike as a landed
change, and is recorded there as a comment rather than duplicated as new work.

## What this spike did not touch, and why

Their fine-tuned parameter projector (Ψ, a decoder-only transformer trained on ~115,000
GarmentCodeData samples, ~10 GPU-hours, mapping their descriptive caption tokens into
GarmentCode's much wider continuous parameter space — 122 quantized leaf tokens for a
single design, per `docs/reference/garmentcode-spike/README.md`) is out of scope for a
better reason than "requires ML investment we haven't budgeted": **it solves a problem we
don't have.** It exists to bridge a 409-token discrete vocabulary into GarmentCode's much
wider continuous space. Our own spec is already the size the projector's _output_ would
be (a few dozen fields), produced directly by forced tool-use with no intermediate
projection step needed. There is also no MoldAI-shaped training corpus to fine-tune one
on — GarmentCodeData is bound to GarmentCode's own schema, not ours — so this isn't a
"someday" item, it's a mismatched problem shape.

## Validity: what this spike could not establish

- **The refusal-avoidance framing was not tested against Claude.** Whether Claude's
  vision handling ever actually hedges or declines on a photo containing a person, the
  way GPT-4o apparently did for this team, was not measured — there is no eval harness
  (#252) and no corpus of attachment-bearing requests to run before/after. The change
  landed on "correct and cheap regardless," not on a measured before/after.
- **The multiple-choice-vs-numeric claim (#260) is sourced from the paper's prose
  only.** No ablation exists in the paper to independently check it against, and no
  eval harness exists here to run our own comparison. See "Already filed as #260/#262,
  confirmed unablated" above.
- **The 409-vs-39 token count is not a fit-quality or usability comparison** — it is a
  raw vocabulary-size measurement. A model choosing correctly among 409 loosely-
  documented tokens with no structural enforcement is a different (probably harder)
  problem than choosing among 39 schema-enforced ones; this spike did not attempt to
  score which system produces better real-world results, only which is structurally
  safer against invalid output.

## Method

1. Cloned `Style3D/design2garmentcode-impl`'s `main` branch (MIT license, `Copyright (c)
2025 Style3D`, verified by reading `LICENSE` directly — not via search) into a
   throwaway directory outside this repo; fetched `lmm_utils/{core,validation,agent,
helper}.py` and `LICENSE` directly (not summarized) so every quote above could be
   checked against the literal source rather than a paraphrase.
2. `_ALL_TEXT` token count: `awk '/^_ALL_TEXT/,/^\]/' validation.py | grep -c '^\s*"'` =
   409; independently confirmed by locating the list's closing `]` at line 411 (list
   starts line 1) = 409 entries.
3. Category count: `grep -cE '^[0-9]+\. [A-Z]' core.py` = 59, over the numbered section
   headers inside Task 1's "text space" explanation (`origin_messages`, starting "1.
   Upper Body Clothing" at line 33 through "59. ..." near line 1527) — this directly
   corrects a "~400 tokens / 53 categories" figure surfaced by an initial web search
   against secondary sources, which undercounted categories by 6.
4. Retry bound and feedback mechanism: read `lmm_utils/core.py`'s `text_gpt` (line 2184
   onward) and its three siblings directly — `max_num = 2`, and the exact string-building
   logic that names missing (`lack_text_list`) vs. invalid (`no_in_text_list`) tokens back
   to the model.
5. Task-prompt text (vision framing, Task 3/4 compare-loop rules) quoted verbatim from
   `origin_messages` in `core.py`, not paraphrased.
6. Our own vocabulary counts: read `lib/draft/vocabulary.ts` and `lib/draft/ease.ts`
   directly for `TYPES`/`GENDERS`/`NECKLINES`/`SLEEVES`/`SKIRTS`/`COLLARS`/`CUFFS`/
   `WAISTBANDS`/`FRONT_CLOSURES`/`FIT_CLASSES`/`STRETCH_CLASSES` array lengths, and
   `STYLE_LIMITS` for the five continuous scalar fields.
7. No-ablation finding cross-checked directly against the paper (arXiv 2412.08603v2)
   methodology and experiments sections — the paper compares against DressCode/SewFormer
   baselines but presents no ablation of any of its own prompt or pipeline design
   choices.
8. Checked `gh issue view` on every candidate finding's likely target before writing it
   up as new — this is what surfaced that #250/#252/#257/#260/#261/#262/#264 already
   existed, each with its own `Source:` citation, before any of the above was written.

The cloned implementation was not committed — `docs/reference/` is covered by both
prettier and eslint, and this spike's only artifacts are this document plus the two
`lib/ai/` changes it names as landed above (`prompt.ts`'s vision-framing sentence,
`index.ts`'s repair retry closing #261), the two follow-up spikes #270 itself asked for
(#272, #273), one newly-found gap filed as #274, and one corroborating comment on #257.
