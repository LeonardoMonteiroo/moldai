#!/usr/bin/env python3
"""#269 Fase 5: QLoRA fine-tune on the propose_garment tool-call task.

Runs on a rented GPU (an A100 40GB is comfortably enough for a 7-8B base in
4-bit with a short-sequence dataset like this one -- see
docs/reference/lora-training/README.md for the exact rental/setup steps).
NOT meant to run on the 12GB card docker-compose.gpu.yml serves inference
from -- docs/decisions/ai-provider.md's own VRAM accounting is why serving
and training are split across two different machines in this design.

Base model defaults to the SAME model docker-compose.gpu.yml serves
(Qwen2.5-VL-7B-Instruct's un-quantized checkpoint -- train against the full
model, not the AWQ-quantized serving copy, then let vLLM quantize/serve the
merged result or the adapter separately). Override with --base-model to
train the text-only Qwen3-8B candidate instead.

Usage (single GPU):
    pip install -r requirements.txt
    python train_lora.py \
        --train dataset.jsonl --val dataset.jsonl.val.jsonl \
        --output-dir ./lora-out

This script has NOT been run -- there is no GPU in the environment that
built it. Treat it as a reviewed, ready-to-run starting point, not a proven
one; watch the first real run's loss curve and eval numbers closely rather
than trusting the defaults blindly.
"""
import argparse
import json

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from trl import SFTConfig, SFTTrainer

DEFAULT_BASE_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct"

# Qwen's own attention/MLP projection names -- the standard QLoRA target set
# for this architecture family (also correct for Qwen3-8B, which shares the
# same module naming).
LORA_TARGET_MODULES = [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base-model", default=DEFAULT_BASE_MODEL)
    p.add_argument("--train", required=True, help="prepare_dataset.py's --output")
    p.add_argument("--val", default=None, help="prepare_dataset.py's <output>.val.jsonl")
    p.add_argument("--output-dir", required=True)
    p.add_argument("--epochs", type=float, default=3.0)
    p.add_argument("--learning-rate", type=float, default=2e-4)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--max-seq-length", type=int, default=8192)
    p.add_argument("--per-device-batch-size", type=int, default=1)
    p.add_argument("--gradient-accumulation-steps", type=int, default=16)
    return p.parse_args()


def format_chat(example: dict, tokenizer) -> dict:
    text = tokenizer.apply_chat_template(
        example["messages"], tokenize=False, add_generation_prompt=False
    )
    return {"text": text}


def main() -> None:
    args = parse_args()

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=LORA_TARGET_MODULES,
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    data_files = {"train": args.train}
    if args.val:
        data_files["validation"] = args.val
    dataset = load_dataset("json", data_files=data_files)
    dataset = dataset.map(lambda ex: format_chat(ex, tokenizer))

    sft_config = SFTConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.per_device_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        max_seq_length=args.max_seq_length,
        logging_steps=10,
        save_strategy="epoch",
        eval_strategy="epoch" if args.val else "no",
        bf16=True,
        dataset_text_field="text",
        report_to=[],
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=dataset["train"],
        eval_dataset=dataset.get("validation"),
        tokenizer=tokenizer,
    )
    trainer.train()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print(f"LoRA adapter saved to {args.output_dir}")
    print(
        "Next: score it with the SAME harness the base model was scored with "
        "(npm run eval:ai, LLM_PROVIDER=local pointed at a vLLM instance serving "
        "this adapter with --enable-lora) -- see docs/architecture/ai-provider.md's "
        "gate: a LoRA only ships if it beats the base model on the held-out split."
    )


if __name__ == "__main__":
    main()
