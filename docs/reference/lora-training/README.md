# LoRA training runbook (#269 Fase 5)

> Status: **tooling built, not yet run.** No GPU exists in the environment
> that wrote these scripts. Everything below has been typechecked
> (TypeScript half) and read carefully (Python half), but the Python
> training script itself has never executed. Treat the commands as a
> reviewed starting point, not a proven one.
>
> See [`../../decisions/ai-provider.md`](../../decisions/ai-provider.md) for
> why this is a facade-and-measure approach rather than a hard swap, and for
> the empirical finding below that currently blocks step 2.

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
for a similarly small yield. **Do not do that without first either:**

- narrowing the catalog to entries whose `descriptionEn` names no feature
  outside `styleFieldsByType` (a filter this script does not implement
  today), or
- switching to a **combinatorial generator over `MOLDAI_CAPABILITY` itself**
  — enumerate supported `(type, styleField combination)` tuples directly
  (the same source `lib/ai/eval/fixtures.ts`'s 33 hand-written cases already
  draw from) and have a cheap first pass phrase each as natural pt-BR, the
  way `lib/ai/prompt.ts`'s own `# Vocabulary mapping` section already lists
  real synonyms. This guarantees every generated example is in-scope by
  construction, rather than filtering a corpus built for a different,
  broader capability. **Not built in this pass** — a real design task of
  its own, not a follow-on script.

Real captured user chats (`ChatMessage.decision`/`draftVersion`, landed in
this same pass — see `docs/architecture/ai-provider.md`) are a second future
source, once a retention/consent decision is made; not used here.

## Step 3 — prepare the dataset (on the training host, no Node needed)

```bash
cd scripts/lora
pip install -r requirements.txt   # only needed for step 4, prepare_dataset.py is stdlib-only
python prepare_dataset.py \
  --input ../../data/training/distilled.jsonl \
  --output dataset.jsonl \
  --val-split 0.1
```

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
