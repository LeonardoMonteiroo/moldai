# LoRA training runbook (#269 Fase 5)

> Status: **All five steps have now run for real, at least once**, on a
> rented RunPod A100-80GB (2026-09-07). Training completed cleanly (loss
> 1.55 → 0.033, eval loss 0.031, 99.2% mean token accuracy on the held-out
> split) and the trained adapter was served via vLLM and gate-checked
> against the un-adapted base model with `npm run eval:ai`. **The LoRA did
> NOT clear the gate** — it improved editing but regressed generation
> (decision + field accuracy both dropped). See
> [`../../decisions/ai-provider.md`](../../decisions/ai-provider.md)'s
> 2026-09-07 entry for the full numbers and the leading hypothesis (a
> generation-vs-editing imbalance in the training data). A retrain with a
> rebalanced dataset is the natural next step, not yet attempted.
>
> See [`../../decisions/ai-provider.md`](../../decisions/ai-provider.md) for
> why this is a facade-and-measure approach rather than a hard swap, and for
> the empirical finding below that first blocked step 2 and how it was
> resolved.

## The pipeline

```
docs/reference/pattern-catalog-benchmark/entries/*.json
        │  (npm run distill:ai, spends real Anthropic tokens)
        ▼
data/training/distilled.jsonl        (gitignored, local)
        │  (python prepare_dataset.py, no Node dependency)
        ▼
dataset.jsonl + dataset.jsonl.val.jsonl
        │  (python train_lora.py, needs a GPU)
        ▼
lora-out/  (a PEFT adapter directory)
        │  (vLLM --enable-lora --lora-modules moldai-v1=./lora-out)
        ▼
served locally, scored with the SAME harness the base model was scored with
```

## Step 1 — rent a GPU

An A100 40GB (e.g. Lambda, RunPod, on-demand) is comfortably enough for a
7-8B base model in 4-bit with this task's short sequences (well under the
`--max-seq-length 8192` default). Expect on the order of a few dollars for
a training run at this dataset size — hours, not days. `docker-compose.gpu.yml`
already documents the _serving_ side's 12GB cut; this is a **separate**
machine, rented only for the duration of a training run, per
`docs/decisions/ai-provider.md`'s own VRAM decision (serving and training do
not fit on the same 12GB card).

## Step 2 — get a real dataset

```bash
npm run distill:ai              # smoke it first with a cap:
DISTILL_LIMIT=20 npm run distill:ai
```

**Measured finding, not a hypothesis:** two smoke runs against the catalog
benchmark (6 entries, then 20, after fixing a `gender: null` templating bug)
kept **0 of 26** sampled entries. Every case was a legitimate `decline` or
`ask` — the catalog's real-world garments carry construction details
(side panels, cuffs, patch pockets, cropped hems, tapered/cargo trouser
legs) that `MOLDAI_CAPABILITY` genuinely does not draft yet
(`docs/architecture/drafting.md`'s own "no third enum value for an
unsupported shape" rule, working exactly as designed). This is not a bug in
the distillation script — `draftSucceeds`'s self-verifying filter is doing
its job — it means **this specific corpus is a poor source of synthetic
training data for today's capability**, however good it is as a
description→archetype reference (its original, already-documented purpose).

Running the full ~172-entry batch would almost certainly cost real tokens
for a similarly small yield, and was never run. The combinatorial generator
described below is the alternative this finding recommended — built,
run as a small live smoke test, and measured (see
`docs/decisions/ai-provider.md`'s own entry for the full accounting,
including two real bugs the smoke test caught).

### Step 2, alternative — the combinatorial generator

`lib/ai/training/{combinations,phrasings,verify,batch}.ts` plus
`scripts/generate-training-data.ts` enumerate supported
`(type, styleField combination)` tuples directly from `MOLDAI_CAPABILITY`
itself (the same source `lib/ai/eval/fixtures.ts`'s hand-written cases draw
from), phrase each combination in varied pt-BR (a committed, hand-authored
corpus — `lib/ai/training/phrasings.ts` — never a runtime LLM call for
phrasing itself), and verify every phrase through the real `proposeGarment`
facade, keeping a pair only when the model's own returned spec agrees with
what the phrase named. This guarantees every generated example is in-scope
by construction, rather than filtering a corpus built for a different,
broader capability — this script is a NEW, parallel tool;
`scripts/distill-training-data.ts` above is untouched.

```bash
npm run generate:training -- --dry-run                       # zero API calls: coverage report + cost estimate
npm run generate:training -- --transport=live --limit=50      # a real, small smoke run (~US$0.50)
npm run generate:training -- --transport=batch                # the full ~1,000-phrase run, batch pricing (~US$5)
```

Output: `data/training/combinatorial.jsonl`, gitignored like `distilled.jsonl`
above, in the SAME shape `prepare_dataset.py` reads (a strict superset —
`source`, `comboKey`, `arity`, and, for `ask`/`decline`/`explain` examples,
the real `decision`/`questions`/`declineReason`/`assemblyOrder` fields
`resolveDecision` (`lib/ai/decision.ts`) produces). `prepare_dataset.py`
itself needed one change to read a non-`apply` `decision` correctly — see
its own top comment.

Real captured user chats (`ChatMessage.decision`/`draftVersion`, landed in
the #269 provider-facade pass — see `docs/architecture/ai-provider.md`) are
a second future source, once a retention/consent decision is made; not used
here. A future `prepare_dataset.py` run can mix both `source` values from
one directory of JSONL files without a third loader.

## Step 3 — prepare the dataset (on the training host, no Node needed)

```bash
cd scripts/lora
pip install -r requirements.txt   # only needed for step 4, prepare_dataset.py is stdlib-only
python prepare_dataset.py \
  --input ../../data/training/combinatorial.jsonl \
  --output dataset.jsonl \
  --val-split 0.1
```

(`distilled.jsonl` is the catalog-distillation path's own output — empty at
today's yield, per Step 2's measured finding above. Use `combinatorial.jsonl`
unless a future catalog-distillation run actually keeps entries.)

## Step 4 — train

```bash
python train_lora.py \
  --train dataset.jsonl --val dataset.jsonl.val.jsonl \
  --output-dir ./lora-out
```

Defaults: rank 16 / alpha 32 QLoRA over Qwen's standard attention+MLP
projections, 3 epochs, bf16 compute, base model `Qwen/Qwen3-8B` (text-only —
switched from the VL/multimodal candidate after a real run found
`Qwen2.5-VL-7B-Instruct`'s config class isn't one `AutoModelForCausalLM`
recognizes; see `train_lora.py`'s own top comment and the 2026-09-07 entry
in `docs/decisions/ai-provider.md`). On a rented A100-80GB this step took
about 75 minutes wall-clock for the 595-example seed dataset.

## Step 5 — serve and gate

Copy `./lora-out` back to the machine running `docker-compose.gpu.yml`, add
`--enable-lora --lora-modules moldai-v1=/path/to/lora-out` to the `vllm`
service's `command`, then:

```bash
LLM_PROVIDER=local LLM_MODEL=moldai-v1 npm run eval:ai
```

**The gate, restated from `docs/decisions/ai-provider.md`: the LoRA only
ships if it beats the un-adapted base model on `npm run eval:ai`'s own
report, on a split held out before training (`--val-split` above).** No
inspection-only judgment call — the same rule that made building the eval
harness Phase 1 in the first place. Run it twice against the same vLLM
instance — once with `LLM_MODEL=Qwen/Qwen3-8B` (no LoRA), once with
`LLM_MODEL=moldai-v1` — and diff the two reports; `npm run eval:ai` writes
to the committed `docs/reference/ai-eval/report.md`, so save each run's
report elsewhere (e.g. `cp` to an untracked file) before running the other,
and `git checkout -- docs/reference/ai-eval/report.md` once both are
captured, or the committed Anthropic baseline gets silently overwritten.

**First real run of this step (2026-09-07): did not clear the gate.** See
`docs/decisions/ai-provider.md`'s dated entry for the numbers — editing
improved, generation regressed, net result read as a fail per this gate's
own standard.
