# LoRA training runbook (#269 Fase 5)

> Status: **Steps 1-2 (get a dataset) are built and have run for real** — see
> Step 2 below for the combinatorial generator that replaced the
> catalog-distillation attempt, and `docs/decisions/ai-provider.md` for the
> measured smoke-run numbers. **Steps 3-5 (train, serve, gate) remain
> tooling built, not yet run.** No GPU exists in the environment that wrote
> `train_lora.py` — that script has been read carefully (it's Python, this
> environment can't execute it) but never run. Treat ITS commands as a
> reviewed starting point, not a proven one; `prepare_dataset.py` is a
> different, weaker claim than `train_lora.py` (its logic has been read and
> the JSONL it consumes is real, inspected output) but it too has never
> actually executed in this environment — no Python interpreter is
> available here either.
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
projections, 3 epochs, bf16 compute. `--base-model` switches to
`Qwen/Qwen3-8B` for the text-only candidate `docker-compose.gpu.yml`'s own
comment names as the harness-decided alternative.

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
harness Phase 1 in the first place.
