# Learnings — AI provider / LoRA training

> Agent-facing session notes only. See [`README.md`](README.md) for scope and format.
> For the architecture, see [`../architecture/ai-provider.md`](../architecture/ai-provider.md).
> For the why, see [`../decisions/ai-provider.md`](../decisions/ai-provider.md).

## 2026-09-07 — RunPod's `ssh.runpod.io` proxy has no scp/sftp; only an

interactive PTY shell works, and the base64-over-pty transfer trick that
replaces it

- **Symptom** — `scp file.txt pod@ssh.runpod.io:/workspace/` (both the
  modern sftp-based protocol and `scp -O`, the legacy one) failed with
  `subsystem request failed` / `Error: Your SSH client doesn't support PTY`.
  Running any command non-interactively (`ssh pod@ssh.runpod.io "some cmd"`,
  with or without `-t`) either got the same PTY error or silently hung,
  printing the MOTD and waiting forever — the proxy ignores a command
  argument and always drops into an interactive login shell.
- **What's actually true** — `ssh.runpod.io` is a RunPod-run multiplexing
  proxy in front of the pod's real container, not a transparent TCP forward
  to the container's own sshd. It only supports one thing: an interactive
  PTY session. `getPod()`'s own response (via the `list-pods`/`get-pod` MCP
  tools) also carries a `ssh.direct` field once the pod has been running a
  minute or two (`ssh root@<public-ip> -p <mapped-port>`) — this reaches the
  container's _actual_ sshd and should support normal scp/sftp, but in this
  session it consistently rejected the same public key the proxy accepted
  (`Permission denied (publickey,password)`, verified with `-v` — the key
  was offered and refused outright), for a reason not root-caused before
  moving on. Don't assume `ssh.direct` works without testing it first; the
  proxy is the reliable fallback.
- **Do this instead** — to run a command through the proxy: pipe the whole
  script as newline-separated commands into `ssh -tt user@ssh.runpod.io`'s
  stdin, ending with `exit` (never pass a command as an ssh argument).
  To move a file (either direction) through the proxy: `base64` the file
  (gzip it first — text like JSONL training data compresses 20-30x, turning
  a slow transfer into a fast one; binary weights don't compress, budget
  accordingly) and stream it as the payload of a `cat > file << 'EOF' ...
EOF` (upload) or a `printf '\n%s\n' MARKER; base64 file; printf
'%s\n' MARKER` bracketed by a literal marker string (download, capturing
  the whole session's stdout into a local file and extracting the lines
  between markers). **The `printf '\n'` before the marker is required on
  the download side** — without it, the shell's own bracketed-paste-mode
  escape sequence (`\e[?2004l`) plus a carriage return land directly in
  front of the payload's first bytes with no delimiting newline, silently
  corrupting exactly the first line of every capture. Measured throughput
  on this proxy: ~75 KB/s of base64 text — split anything over roughly 15MB
  raw (fits one `timeout`-bounded round trip well under a 10-minute tool
  call) into chunks with `split -b 15M`, transfer + `sha256sum`-verify each
  chunk separately, then `cat` them back together and verify the whole
  file's checksum before trusting it.
- **Related trap, already paid for once** (see the entry below): a pod's
  container disk is ephemeral unless it has a network volume attached —
  copy anything you need off the pod the moment it's produced, never
  "finish the job, then copy."

## 2026-09-07 — vLLM 0.28.0 removed `--guided-decoding-backend`; check

`vllm serve --help=all` before trusting a flag from an older doc/compose file

- **Symptom** — `vllm serve ... --guided-decoding-backend xgrammar ...`
  (the exact flag `docker-compose.gpu.yml`'s own `vllm` service command
  uses) failed immediately: `vllm: error: unrecognized arguments:
--guided-decoding-backend xgrammar`. `--enable-auto-tool-choice`,
  `--tool-call-parser hermes` (with `hermes` still a valid parser choice)
  and `--enable-lora`/`--lora-modules` were all still accepted unchanged.
- **What's actually true** — `vllm serve --help` in this version prints an
  abbreviated, config-group-level summary (not a full flag list); the old
  standalone decoding-backend flag moved under a structured JSON-style
  config object, `--structured-outputs-config.backend=<name>` (default
  `auto`), discoverable via `vllm serve --help=structured_outputs`. Omitting
  the flag entirely and relying on the `auto` default worked fine for this
  session's forced-tool-call use case. `docker-compose.gpu.yml` is pinned to
  `vllm/vllm-openai:latest` — a future `docker compose ... up vllm` will
  pull whatever "latest" is at that moment and hit this exact break; this
  wasn't fixed in that file during this session (out of scope — a rented
  bare pod running `pip install vllm` directly was used instead, not the
  Docker Compose service), so treat it as a known, not-yet-fixed gap the
  next session touching that file should check for.
- **Do this instead** — before trusting any CLI flag from a doc, compose
  file, or your own training data against a freshly-installed vLLM, run
  `vllm serve --help=all | grep -i <topic>` (the grouped `--help` alone
  won't show it) and confirm the flag still exists under that name. vLLM's
  own version was `0.28.0`, installed via a plain `pip install vllm` inside
  the same environment `train_lora.py` had already set up (torch got
  upgraded from 2.8.0+cu128 to 2.13.0+cu130 as a side effect — harmless here
  since training had already finished and its weights were already copied
  off, but worth knowing if a future session wants to train and serve in
  the same environment without recreating it).

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
