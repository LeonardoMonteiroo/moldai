#!/usr/bin/env python3
"""#269 Fase 5: turns data/training/distilled.jsonl (written by
scripts/distill-training-data.ts, in the Node project) into the chat-format
SFT dataset train_lora.py consumes.

Deliberately has ZERO dependency on the Node/TypeScript project -- this runs
on the GPU training host, which does not have this repo's node_modules or
even Node itself installed. Every input JSONL line is fully self-contained:
{sourceId, promptPt, spec, assistantMessage, system} -- "system" is already
the EXACT static+dynamic prompt text that example was generated under (see
distill-training-data.ts's own comment on why it captures that verbatim).

Output format: one JSON object per line, {"messages": [...]}, the same
"messages" shape trl's SFTTrainer and Axolotl both load natively via
datasets.load_dataset("json", ...). The assistant turn is written in the
Hermes tool-call convention (<tool_call>{"name": ..., "arguments": ...}
</tool_call>) to match docker-compose.gpu.yml's own vLLM flag
--tool-call-parser hermes -- the fine-tune's output must match whatever the
serving stack expects to parse back into a real tool call, or every
constrained-decoding gain docs/architecture/ai-provider.md describes is lost
at serving time.

Usage:
    python prepare_dataset.py --input ../../data/training/distilled.jsonl \
        --output dataset.jsonl [--val-split 0.1]

A held-out validation split is written to <output>.val.jsonl when
--val-split is given -- train_lora.py expects both files to exist
separately, never a single file it re-splits itself, so the SAME split is
reused across every training run (including a later run with more data
appended) rather than silently reshuffling and changing what "held out"
means.
"""
import argparse
import json
import random
import sys


def build_example(entry: dict) -> dict:
    # #269 Fase 5 (dataset): scripts/generate-training-data.ts (the
    # combinatorial generator, a NEW tool parallel to
    # scripts/distill-training-data.ts) writes real ask/decline/explain
    # examples alongside apply ones -- entry["decision"] defaults to
    # "apply" only for backwards compatibility with an
    # already-distilled.jsonl written before this field existed (that
    # script only ever kept decision=apply pairs). questions/declineReason/
    # assemblyOrder are the same optional AiDecision fields
    # lib/ai/decision.ts's own resolveDecision produces -- included only
    # when the entry actually carries them, so an apply-only entry's tool
    # call is unchanged from before this fix.
    arguments = {
        "decision": entry.get("decision", "apply"),
        "spec": entry["spec"],
        "assistantMessage": entry["assistantMessage"],
    }
    if entry.get("questions") is not None:
        arguments["questions"] = entry["questions"]
    if entry.get("declineReason") is not None:
        arguments["declineReason"] = entry["declineReason"]
    if entry.get("assemblyOrder"):
        arguments["assemblyOrder"] = entry["assemblyOrder"]
    tool_call = {
        "name": "propose_garment",
        "arguments": arguments,
    }
    assistant_content = (
        "<tool_call>\n" + json.dumps(tool_call, ensure_ascii=False) + "\n</tool_call>"
    )
    return {
        "messages": [
            {"role": "system", "content": entry["system"]},
            {"role": "user", "content": entry["promptPt"]},
            {"role": "assistant", "content": assistant_content},
        ]
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="distilled.jsonl path")
    parser.add_argument("--output", required=True, help="training dataset output path")
    parser.add_argument(
        "--val-split",
        type=float,
        default=0.0,
        help="fraction held out to <output>.val.jsonl, e.g. 0.1",
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        entries = [json.loads(line) for line in f if line.strip()]

    if not entries:
        print(
            f"No entries in {args.input} -- nothing to prepare. "
            "See docs/decisions/ai-provider.md's own note on the pattern-catalog-benchmark "
            "corpus's measured near-zero yield against today's drafting capability "
            "before spending a training run on an empty or tiny dataset.",
            file=sys.stderr,
        )
        sys.exit(1)

    examples = [build_example(e) for e in entries]
    random.Random(args.seed).shuffle(examples)

    if args.val_split > 0:
        n_val = max(1, int(len(examples) * args.val_split))
        val, train = examples[:n_val], examples[n_val:]
        val_path = args.output + ".val.jsonl"
        with open(val_path, "w", encoding="utf-8") as f:
            for ex in val:
                f.write(json.dumps(ex, ensure_ascii=False) + "\n")
        print(f"{len(val)} validation examples -> {val_path}")
    else:
        train = examples

    with open(args.output, "w", encoding="utf-8") as f:
        for ex in train:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    print(f"{len(train)} training examples -> {args.output}")


if __name__ == "__main__":
    main()
