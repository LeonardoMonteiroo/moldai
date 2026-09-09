# ChatGarment spike (#272)

Evidence for #272 — "spike ChatGarment for applicable ideas to our AI generation flow", the
second follow-up spike #270 itself asked to be filed. Same non-goal as its predecessor: this
is not an integration spike, nothing was added to this repo's dependency tree, no drafter was
touched, and the adjacent GarmentCode-family integration question stays declined
([`docs/decisions/drafting.md`](../../decisions/drafting.md), "#266 → #269"). ChatGarment
("ChatGarment: Garment Estimation, Generation and Editing via Large Language Models",
arXiv:2412.17811v3, CVPR 2025, Bian/Xu/Xiu/Grigorev/Liu/Lu/Black/Feng) solves the same shape
of problem our own `lib/ai/*` solves — a large multimodal model produces a structured,
editable garment parameter set, which a deterministic drafter (GarmentCode-family) consumes —
so, like the Design2GarmentCode spike before it, this mines its paper and its published
implementation repository (`biansy000/ChatGarment`, Apache-2.0, cloned read-only outside this
repo, checked 2026-09-07) for technique, not code.

Every figure below was fetched directly from the paper (`arxiv.org/abs/2412.17811v3` and its
HTML rendering) or read directly out of the cloned implementation's own source files — not
recalled from training data or a secondary summary. Where a fetch used a summarizing
intermediate model, the specific quotes it returned were treated as claims to verify, and the
implementation repository's own prompt files and Python source (`docs/prompts/*.txt`,
`llava/garmentcode_utils.py`, `llava/garment_inquire_utils.py`, `README.md`) were read
directly to confirm or correct them — flagged inline wherever that correction happened.

## Correction made before any finding could be trusted: the sibling PRs this spike must not duplicate are open, not merged

The issue's own acceptance criteria (and this batch's task briefing) name #258/#259/#262/#265
as prior art to check before writing anything up. Checked directly (`gh issue view`, `gh pr
view`, `git log origin/main`) rather than assumed: as of `origin/main`'s HEAD (`a998725`),
**none of them has merged.** All four exist only as open PRs against open issues:

| Issue                                                       | State | PR                                                             | State |
| ----------------------------------------------------------- | ----- | -------------------------------------------------------------- | ----- |
| #258 part-by-part image reading                             | OPEN  | #303 `feat(ai): read an attached garment photo part-by-part…`  | OPEN  |
| #259 waist-rise style parameter                             | OPEN  | #300 `feat(draft): add a waist-rise style parameter…`          | OPEN  |
| #260 descriptive length tokens (Design2GarmentCode's claim) | OPEN  | #304 `feat(ai): project descriptive length tokens…`            | OPEN  |
| #262 clarifying-question catalog validation                 | OPEN  | #306 `feat(ai): derive clarifying-question options…`           | OPEN  |
| #265 part-scoped adjustments                                | OPEN  | #293 `feat(ai): let an adjustment scope to the selected piece` | OPEN  |

This matters for how the rest of this document talks about them: each is real, already-written
implementation work against its own cited section — genuinely "already implemented, see PR#X",
never re-proposed here as new — but "already implemented in an open PR" and "already landed"
are different claims, and this spike's own read of each PR's diff (`gh pr diff`) is what backs
the specific comparisons below, not the issue text alone.

## The headline, same shape as before: structural validation is still ours, but the numeric story is now three-way, not two-way

Design2GarmentCode's LMM layer had no structural output constraint at all — free-text GPT-4o
scraped by regex against a hand-duplicated taxonomy. ChatGarment's is a genuine third
architecture, not a restatement of either side of that comparison: it **fine-tunes** an open
VLM (LLaVA-1.5-7B, LoRA on the LLM head/embeddings/projection layers, 4×H100, 40 epochs) to
emit a JSON-shaped text response, but **splits categorical and continuous fields onto two
different output channels**. Categorical/discrete fields (`meta.upper`, `sleeve.armhole_shape`,
…) are ordinary generated text tokens, exactly like Design2GarmentCode's flat vocabulary. Every
continuous numeric field, though, is masked out of the generated text as a placeholder token
(`[SEG]`) whose language-model hidden state at that position is fed to a dedicated two-layer
MLP projection head (`5120×76`, `Ψ`-shaped but far smaller: 76 floats, not GarmentCodeData's 122) trained with its own L1 loss (`λ_n=0.1` against the text cross-entropy loss) — quoted
directly from Section 3.1: _"we encode these continuous values into language token embeddings
and train a projection layer to recover accurate numerical values, such as garment length."_
Read plainly: ChatGarment does not trust its own next-token generation to produce an accurate
float, and builds a second, differently-trained mechanism specifically so it never has to.

Our own `GarmentSpec` puts every continuous field (`necklineDepthCm`, `skirtLengthCm`,
`seamAllowanceCm`, `armholeDeepenCm`, `trouserLengthCm`) through neither of these — a plain
`number`-typed JSON Schema property in the forced `propose_garment` tool call, generated as
text tokens by a frontier general-purpose model, structurally the same shape as ChatGarment's
own **ablated, worse-performing baseline** (see below), not its shipped design. Whether that
gap actually matters for Claude the way it apparently did for a fine-tuned LLaVA-7B backbone
was not tested here — see Validity.

On structural enforcement specifically, the comparison to Design2GarmentCode still holds:
ChatGarment's raw generation is also unconstrained free text, repaired post-hoc by a
general-purpose JSON-repair library (`llava/json_fixer.py`'s `repair_json`, called at every
inference/data-processing site read in this spike) rather than checked against any schema. The
difference from Design2GarmentCode is that ChatGarment's model was actually fine-tuned to
produce this exact shape, so it likely drifts out of format less often in practice than a
zero-shot-prompted GPT-4o — but "likely" is doing real work in that sentence; no failure-rate
comparison between the two was attempted here, and ours remains the only one of the three that
makes an invalid enum or a missing required field structurally impossible rather than merely
less probable.

## Genuinely new, not covered by any predecessor: an ablated (not just claimed) result on numeric prediction

The Design2GarmentCode spike's most important caveat was that its "multiple-choice beats
numeric estimation" claim (source of #260, `docs/reference/design2garmentcode-spike/README.md`
"Already filed as #260/#262, confirmed unablated") had **no ablation backing it** — the paper
compared against external baselines only, never against a version of itself with the design
choice reverted. ChatGarment's own Section 4.1 does exactly the ablation Design2GarmentCode's
paper skipped, on a directly analogous question: it reports a **`LLaVA*` baseline that
"directly output[s] the numerical values for the sewing pattern instead of using the sewing
pattern projection layer"** — i.e., exactly our own and Design2GarmentCode's shared assumption
that an LMM can just emit the number as text — scoring **5.29** Chamfer Distance on Dress4D
against ChatGarment's own **3.12** (lower is better). That is a real, measured, same-paper
ablation showing next-token numeric generation measurably underperforms a purpose-built
alternative, for this specific model family and task.

Read carefully, though, this is corroboration of the **diagnosis** (LLMs are unreliable at
emitting precise continuous numbers via next-token prediction), not the **cure** #260/PR#304
already chose. Design2GarmentCode's fix was to eliminate the continuous value entirely,
substituting an ordinal category the model picks from a closed list (`skirtLength: mini | knee
| midi | maxi`, per PR#304's own diff). ChatGarment's fix keeps the continuous value and
instead builds a second, specially-trained regression channel to predict it accurately. These
are not the same technique converging twice — they are two different architectural answers to
the same diagnosed problem, and only one of them (categorical substitution) is available to us
without an ML investment. So: **the two systems agree on the problem, for the first time with
real ablation evidence behind it, but disagree on the fix** — worth stating as the divergence
this spike's own acceptance criteria asked to investigate rather than silently drop. #260/PR#304
gets a bit more independent support for "raw numeric generation is the wrong instinct" than the
Design2GarmentCode spike alone could establish; it gets no support at all for "categorical
substitution specifically is the right fix" from this second source, since ChatGarment never
tried that path. ChatGarment's own actual fix — the regression head — is out of scope here for
the same reason Design2GarmentCode's projector was in the predecessor spike: it requires
fine-tuning a model we don't own on a training corpus we don't have, to solve a reliability gap
that has not been measured against Claude specifically (no eval harness result cited either
way — see Validity).

## Also new: a real ablation directly backing #258/PR#303's chain-of-thought premise

Appendix S2 (Table S11) ablates training **without** part-level description data
("ChatGarment\*"): image-reconstruction Chamfer Distance degrades from 3.06 to 4.04 on Dress4D
and from 2.94 to 4.06 on CLoSE — quoted verbatim, _"part-level description datasets adversely
affects image reconstruction results"_ [sic, the paper's own wording describes the ablated
model's _absence_ of them, i.e. removing part-level data hurts results]. This is a genuine,
measured ablation for the "describe the garment part-by-part before inferring the spec"
technique #258/PR#303 already implements as `garmentReading` — stronger evidence than the
Design2GarmentCode spike had for its own analogous claim, and worth recording since #303 cites
only "ChatGarment's own two-stage chain of thought" in its summary without this specific
ablation number.

One precision worth adding to PR#303's own description: ChatGarment's **inference-time**
chain-of-thought is a single combined-description call, not the per-part isolated calls this
spike also found in the source (below) — confirmed directly from `docs/prompts/detailed_
textbased_description.txt`/`smplified_image_description.txt` and their usage sites, and from
the paper's own Table S8 example (`"Can you describe the garment outfits in image in the Json
format?"` — one call, one JSON object covering every visible garment/part). PR#303's single
`garmentReading` field, produced by one call describing every relevant style-enum field at
once, matches this shape exactly. The separate, isolated per-part GPT-4o calls this spike found
(`llava/garment_inquire_utils.py`'s `ask_all_parts_questions`, one API call per garment part,
each with its own explicit negative instruction — see next section) are a **training-data
construction detail**, used only to build ChatGarment's own fine-tuning corpus offline, never
part of the fine-tuned model's own runtime inference path. A shallow read of "part-by-part"
could conflate the two; #303's implementation already matches the one that actually runs at
inference time, not the offline one.

## Genuinely portable, not covered by #303: an explicit cross-part non-attribution instruction

`llava/garment_inquire_utils.py`'s `ask_part_question` builds each of its (offline,
dataset-construction-only) per-part prompts from `docs/prompts/prompt_garment_part_inference
.txt`, substituting two placeholders — `[PART]` (the part being described) and, more
interestingly, `[DONOT]`, populated from a hand-written `donot_descriptions` dict pairing every
part with the _other_ parts most likely to bleed into its description (e.g. describing a
collar: `"Strictly avoid mentioning sleeves, shirt torsos"`; describing a sleeve:
`"Strictly avoid mentioning collar, shirt torsos"`). Quoted directly from the prompt template
itself: _"Please only describe geometries and structures of \[PART\]. Strictly avoid mentioning
\[DONOT\] or other garment parts."_

This is a genuinely different idea from anything #258/PR#303 or the Design2GarmentCode spike
already covers: not "describe each part" (already implemented) but **"when describing one
part, explicitly name the neighboring parts not to attribute features to"** — a guard against
one specific failure mode (a wide neckline getting misdescribed as part of the collar, a cuff
detail bleeding into the sleeve description) that a single combined-description call, as #303
implements it, has no equivalent for. Because ChatGarment only applies this at
dataset-labeling time (isolated per-part API calls, not a single-pass description), it isn't a
direct precedent for changing PR#303's prompt the same way — but the underlying idea (naming
what NOT to attribute a feature to, not just what to describe) is cheap to phrase as one added
sentence in `garmentReading`'s own instruction, independent of whether the call is single-pass
or per-part. **Not implemented here** (this is a docs-only unit) — recorded as a candidate
refinement for whoever next touches #303's prompt wording, not as a reason to reopen or
re-scope #258 itself.

## Corroborates #265 with a more concrete source than the paper's own prose

#265's own citation (ChatGarment §3.2, "modify PART-1 to DESC-1 while keeping other parts
unchanged") is confirmed directly — Table S4's editing template, read via the paper fetch,
matches almost verbatim. This spike additionally found the **actual runtime prompt-augmentation
code** implementing that idea in `llava/garmentcode_utils.py`'s `change_prompt`, which
paraphrases the same instruction five different ways during training-time prompt augmentation,
one substituted at random per example, all sharing the same invariant, quoted directly:

> "Adjust the sewing pattern according to the text descriptions. Leave all unspecified parts
> unchanged. The old garment sewing pattern is: {old}. \nThe text descriptions are: {new}."
>
> "Adapt the old sewing pattern based on the descriptions... Keep the untouched sections as
> they are."
>
> "Could you adjust the mentioned part of the old sewing pattern?... the target garment part is
> described as: {new}."

Read together, these confirm the paper's Table S4 line is not an isolated example but the
system's actual, repeated training invariant: every edit instruction, however phrased, pairs
"here is what changes" with an explicit "and here is what must not." #265's own acceptance
criteria (deriving the scope server-side from `pieces`, never accepting free text) already goes
further than ChatGarment's own training data does — ChatGarment names parts by a fixed string
vocabulary (`'waistband'`, `'shirt main body panel'`, …), not an id resolved against a live
pattern — so there's nothing to add to #265's AC itself; this is recorded as corroborating
evidence, not a design change, left as a comment on the issue rather than a new one (see
Method).

## Convergence, and a point where we're already ahead: multi-turn dialogue

Section 3.4, quoted directly: _"it exhibits zero-shot reasoning for garment sewing patterns
within multi-turn dialogues, despite being trained only on single-turn dialogue datasets."_
ChatGarment was never trained on multi-turn conversations and has to hope its single-turn
fine-tuning generalizes when a user asks a follow-up in the same session — described in the
paper as a capability worth specifically calling out because it wasn't a training-time
guarantee. Our own multi-turn handling (`buildHistory`, `lib/ai/history.ts`) is not a
zero-shot hope for a general-purpose frontier model with a native multi-turn Messages API — it
is the default, unremarkable case. Nothing to land here; recorded because the predecessor
spike's document holds itself to naming points where "we are already ahead," not only gaps.

## What this spike did not touch, and why

- **The regression-head/projection-layer mechanism itself** (as above) — requires fine-tuning
  a model we don't own on a training corpus (GarmentCodeRC-derived, ~1M annotated images) we
  don't have and whose schema doesn't match ours, the identical "solves a problem we don't have
  architecturally" reasoning the predecessor spike gave for Design2GarmentCode's projector.
- **GarmentCodeRC's own token-count reduction** (Section 3.1, quoted directly: _"reduces the
  average language token count from 900 to 350"_) — a simplification of GarmentCode's own much
  wider parameter surface for VLM fine-tuning efficiency. Not comparable to our own 39-token
  vocabulary the way the predecessor spike's 409-vs-39 comparison was: GarmentCodeRC's 350 is
  already a _reduction target_ for a system with far more garment-type/style coverage than
  ours, not a vocabulary MoldAI could adopt piecemeal.
- **Normalizing continuous parameters to `[0, 1]`** — every numeric value in ChatGarment's own
  JSON examples (`'waist': 0.501`, `'length': 0.365`) is pre-normalized against GarmentCode's
  own parameter bounds before the LMM ever sees it, a decision entangled with the regression
  head above (the projection layer's output range) and with GarmentCode's own units, not with
  how an LMM should describe a spec in isolation. Our own `MEASUREMENT_RANGES`/`STYLE_LIMITS`
  already give the model real cm bounds directly; normalizing to `[0,1]` would remove
  information (the real-world scale) the model currently has for free.
- **The GPT-4o refusal-avoidance framing landed from the Design2GarmentCode spike** — searched
  the cloned implementation directly (`grep` across every prompt file and every `.py` under
  `llava/`) for any equivalent "do not identify/analyze the person" repetition; found none.
  This is not evidence Claude needs no such framing (that was never established either way,
  per the predecessor spike's own Validity section) — it's that ChatGarment's fine-tuned LLaVA
  backbone was never RLHF'd toward the same refusal behavior GPT-4o's base chat model was, so
  its absence here is unsurprising and not itself a finding.

## Validity: what this spike could not establish

- **The `LLaVA*`/projection-layer ablation is not a test of Claude, or of forced tool-use.**
  It measures a fine-tuned 7B open-weight LLaVA backbone with and without a purpose-built
  regression head, on GarmentCode's own continuous parameter space. Whether Claude's own
  next-token numeric output (inside our forced-tool-use `number` schema fields) shows a
  comparable reliability gap was not measured — no eval harness result was run either way for
  this spike specifically.
- **The eval harness the predecessor spike deferred #260 to (issue #252) has since closed** —
  confirmed directly (`gh issue view 252`, state `CLOSED`) and its code exists on `origin/main`
  (`lib/ai/eval/*`, `scripts/ai-eval.ts`). This spike did not run it against either #260's or
  #304's specific claim; noted only because it changes the precondition the predecessor spike's
  own "reopens only if #252 ships" line named, not because this spike measured anything new
  with it.
- **The part-level-description ablation (S2/Table S11) is ChatGarment's own internal
  comparison**, not an independent replication of the same claim against our schema, our
  vocabulary, or Claude. It is real ablation evidence where the predecessor spike found none —
  a stronger form of evidence than before, not proof the same margin transfers here.
- **PR#303/#300/#304/#306/#293's own designs were read from their diffs, not re-reviewed for
  correctness** — this spike's comparisons describe what each PR does, not whether it does it
  well; that is each PR's own review's job, not this document's.

## Method

1. Fetched `arxiv.org/abs/2412.17811v3` (abstract, metadata) and `arxiv.org/html/2412.17811v3`
   (full HTML rendering) directly via `WebFetch`, in three separate targeted passes: (a)
   section structure and Method/Experiments subsection summaries, (b) verbatim JSON-format
   examples and prompt/instruction text with section numbers, (c) the specific token-count,
   projection-layer, multi-turn, and ablation quotes named above with their exact section/table
   labels. Every quote reproduced above is reported as returned by the fetch and was then
   cross-checked against the cloned implementation's own source wherever the implementation
   contained the same material directly (the prompt templates, the editing-instruction
   variants, the per-part negative-instruction dict) rather than trusted from the fetch alone.
2. `git clone --depth 1 https://github.com/biansy000/ChatGarment.git` into a throwaway
   directory outside this repo (Apache License 2.0, verified by reading `LICENSE` directly);
   read `docs/prompts/*.txt` (all five prompt templates in full), `llava/garmentcode_utils.py`,
   `llava/garment_inquire_utils.py`, and `README.md` directly, not summarized.
3. `WebSearch` located the implementation repository (`biansy000/ChatGarment`) and its project
   page (`chatgarment.github.io`) from the paper's own author list plus a general search — the
   repository was then fetched and read directly per (2), not taken on the search result's own
   description.
4. Checked every sibling issue/PR this spike must not duplicate directly rather than trusting
   the batch task's own "already merged" framing: `gh issue view` on #258/#259/#260/#261/#262/
   #265/#250/#252/#257/#264/#270/#272 and `gh pr view`/`gh pr diff` on #300/#303/#304/#306/#293,
   plus `git log origin/main --oneline` after `git fetch origin main` — this is what surfaced
   that none of the five PRs has merged (see the correction above) and that #252's eval harness
   has since closed with real code on `main`.
5. `grep -rniE "person|identify|recogniz|warning|refus|sorry"` across every prompt file and
   every `.py` under `llava/` in the cloned implementation, to check for a Design2GarmentCode-
   style refusal-avoidance repetition — none found (see "What this spike did not touch").

The cloned implementation was not committed — like its predecessor, this spike's only
artifacts are this document, a short decision entry in
[`docs/decisions/generation-flow.md`](../../decisions/generation-flow.md), and comments left on
#265 and #303 recording the corroborating/portable findings above that belong to those issues
rather than to this write-up.
