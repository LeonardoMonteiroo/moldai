# Learnings — AI provider / LoRA training

> Agent-facing session notes only. See [`README.md`](README.md) for scope and format.
> For the architecture, see [`../architecture/ai-provider.md`](../architecture/ai-provider.md).
> For the why, see [`../decisions/ai-provider.md`](../decisions/ai-provider.md).

## 2026-09-05 — stopping a RunPod pod without a network volume wipes the container disk

- **Symptom** — LoRA training finished (`train_lora.py` printed "LoRA adapter saved
  to ./lora-out"), the pod was stopped (via `stop-pod`) on the reasonable-sounding
  assumption that "stop preserves the disk, only terminate destroys it" — the tool's
  own description says exactly that. On restart to copy the adapter out, `find /
-iname '*lora-out*'` found nothing anywhere on disk, and `df -h` showed `overlay`
  mounted at `/` with only 16M used out of 100G — a fresh, empty container
  filesystem. The trained adapter and the dataset copied onto the pod were both
  gone; only the training host's own local checkout of `dataset.jsonl` /
  `dataset.jsonl.val.jsonl` survived, because it happened to still exist on the
  Windows machine that generated it.
- **What's actually true** — "stop preserves the disk" is true for a pod with a
  RunPod network volume attached (persistent storage independent of the container).
  This pod (`list-pods`/`get-pod` output, no `networkVolume` in the response) had
  none — its container disk is the ephemeral overlay baked from the image, and it
  resets on stop/start same as it would on a fresh pod. Nothing about the pod
  metadata visibly warns of this before the fact; the only way to know is to check
  whether a network volume is attached, or to just never rely on the assumption.
- **Do this instead** — for any rented-GPU workflow (this LoRA pipeline included):
  copy output artifacts (`lora-out/`, or anything else produced on the pod) to the
  local machine or durable storage **immediately after the job finishes, before
  ever stopping the pod** — never "stop first, copy later." If a pod is expected to
  be stopped/restarted across a session, attach a RunPod network volume up front
  instead of trusting container-disk persistence. When advising a user to stop a
  pod, always ask "has everything you need already been copied off?" first, rather
  than treating `stop-pod`'s own tool description as sufficient guarantee for every
  pod's storage configuration.
