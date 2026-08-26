#!/usr/bin/env node
/**
 * verify-on-stop.mjs — Claude Code **Stop** hook for the MoldAI repo.
 *
 * WHAT IT ENFORCES
 *   "Done" must be evidence-backed. Before the turn is allowed to end, this runs the
 *   repo's verification sweep and blocks the stop if it fails, so the model gets the
 *   real failure text back instead of asserting success it never checked.
 *
 *     1. node node_modules/vitest/vitest.mjs run          (== `npx vitest run`)
 *     2. node node_modules/eslint/bin/eslint.js app lib components
 *                                                        (== `npx eslint app lib components`)
 *
 *   Both are invoked as `process.execPath <local js entry>` rather than through `npx`:
 *   on Windows, Node 22 refuses to spawn `npx.cmd` without a shell (EINVAL), and going
 *   through a shell reintroduces the quoting problems this repo's hook contract avoids.
 *   Running the local entrypoints directly is the same code npx would resolve to.
 *
 * WHY THESE EXACT COMMANDS (CLAUDE.md / memory conventions)
 *   - `npm run lint` is NOT used: repo-root eslint crawls `.claude/worktrees/` and
 *     false-alarms. The scoped `eslint app lib components` is the canonical command
 *     (it is also what CI and the husky pre-push hook run).
 *   - bare `tsc --noEmit` is NOT used: under Next.js 16 it emits a spurious
 *     `app/layout.tsx` LayoutProps error. The real typecheck is `npm run build`...
 *   - ...and `npm run build` is NOT run here either: a full Next production build is
 *     far too slow for a hook that fires on every stop. Typechecking stays a manual /
 *     CI step; this hook covers the fast half of the sweep (tests + lint, ~11s here).
 *
 * GUARDS (a hook that is expensive or noisy gets disabled — so it is neither)
 *   - Loop guard: if the payload says the Stop hook already fired (`stop_hook_active`
 *     or any `stop*hook*active`-ish truthy key), exit 0 immediately. Without this, a
 *     blocking Stop hook can re-trigger itself forever.
 *   - Cheap pre-check, in two parts (`changedSourceFiles`):
 *       1. Working tree/index: `git status --porcelain -uall -- app lib components`,
 *          relative to HEAD — same as before. If this alone finds a changed .ts/.tsx
 *          file, the sweep runs, exactly as before. Costs ~70ms.
 *       2. Committed-but-unpushed work: only when (1) found nothing (a clean tree),
 *          diff the branch against its merge-base with a resolvable upstream/default
 *          branch (`@{upstream}`, `origin/HEAD`, `origin/main`, `origin/master`, local
 *          `main`/`master`, tried in that order; the first that resolves wins). This
 *          is what makes "the turn ended with the work committed" still trigger the
 *          sweep — a clean tree no longer reads as "nothing to verify". If no base
 *          resolves (fresh clone, detached HEAD, no remote), this half is skipped and
 *          behaviour is exactly the pre-existing status-only check.
 *     Either half failing to answer (no git, timeout, spawn error) makes the whole
 *     pre-check answer null, and the caller stays silent — never guesses.
 *   - Re-verify cache: once the committed-ahead sweep passes for a given HEAD sha, that
 *     sha is recorded (a small JSON file under the OS temp dir, keyed by the repo root's
 *     path — never inside the repo, so it can't show up in `git status`). A later Stop
 *     on the same, still-clean, still-unmoved HEAD short-circuits instead of re-running
 *     the same sweep on every conversational turn for the rest of the branch's life.
 *     A failed sweep is never cached, so it keeps blocking until either the code changes
 *     (new HEAD) or new working-tree edits appear.
 *   - Time budget: 180s total, split across the two commands; a timeout is reported as
 *     a failure with the partial output, never as a hang. Unchanged by this widening —
 *     the extra pre-check cost is a handful of near-instant `git rev-parse`/`diff` calls.
 *   - Any INTERNAL error (bad stdin, no git, tool not installed, spawn failure) exits 0
 *     silently. A broken checker must never block the user's work, and a false positive
 *     is worse than a false negative.
 *
 * OUTPUT CONTRACT
 *   pass  -> exit 0, no output (no per-stop spam)
 *   fail  -> exit 0 + {"decision":"block","reason":"<compact summary>"} on stdout, so the
 *            reason is fed back to the model. Output is condensed to the actionable lines
 *            (failing test names / `file:line:col  error  rule`) and capped at 4000 chars
 *            with an explicit truncation marker.
 *
 * Node ESM, zero dependencies (node: builtins only).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TOTAL_BUDGET_MS = 180_000;
const GIT_TIMEOUT_MS = 15_000;
const MIN_SLICE_MS = 20_000; // don't start a command with less than this left
const PER_COMMAND_CHAR_CAP = 2200;
const PER_COMMAND_LINE_CAP = 60;
const REASON_CHAR_CAP = 4000;
const SCOPED_DIRS = ["app", "lib", "components"];
const SOURCE_EXT = /\.tsx?$/i;

/** Candidate refs to diff the branch against, in preference order. The first that
 *  `git rev-parse --verify` resolves wins; none resolving means "skip the merge-base
 *  half", not "fail" — a fresh clone / detached HEAD / no-remote checkout is common. */
const BASE_REF_CANDIDATES = ["@{upstream}", "origin/HEAD", "origin/main", "origin/master", "main", "master"];

/** Silent, non-blocking exit. Every internal failure funnels through here. */
function ok() {
  process.exit(0);
}

/** Blocking exit: the model sees `reason` and can act on it. */
function block(reason) {
  const payload = { decision: "block", reason };
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function readStdinJson() {
  try {
    if (process.stdin.isTTY) return {};
    const raw = fs.readFileSync(0, "utf8");
    if (!raw || !raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * True when the payload signals the Stop hook already ran and the model is continuing.
 * The documented field is `stop_hook_active`; the key scan makes it robust to casing or
 * naming drift without guessing at a fixed list.
 */
function alreadyFired(payload) {
  try {
    for (const [key, value] of Object.entries(payload)) {
      if (/stop.?hook.?active/i.test(key) && value) return true;
    }
    const nested = payload.hookSpecificOutput;
    if (nested && typeof nested === "object") {
      for (const [key, value] of Object.entries(nested)) {
        if (/stop.?hook.?active/i.test(key) && value) return true;
      }
    }
  } catch {
    /* fall through: treat as not fired */
  }
  return false;
}

/** Walk up from `start` to the nearest dir holding both package.json and .git. */
function findRepoRoot(start) {
  try {
    let dir = path.resolve(start);
    for (let i = 0; i < 40; i += 1) {
      // `.git` is a directory in a normal clone and a file inside a linked worktree.
      if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, ".git"))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// CSI escape sequences (ESC [ ... final letter). Built via new RegExp from an ASCII
// string so no literal ESC byte ever lands in this source file. Vitest colorizes its
// output even when stdout is a pipe, so stripping is required for a readable reason.
const ANSI_CSI = new RegExp("\\u001b\\[[0-9;]*[A-Za-z]", "g");

function stripAnsi(text) {
  return String(text).replace(ANSI_CSI, "");
}

/** Git quotes paths containing specials as a C-style double-quoted string. */
function unquotePath(p) {
  const trimmed = p.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function runGit(root, args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
}

/**
 * Working tree + index changes under app/lib/components, relative to HEAD (untracked
 * included). Returns a Set of repo-relative .ts/.tsx paths, or null if git could not
 * answer at all (caller stays silent rather than guessing).
 */
function statusChangedFiles(root, dirs) {
  const res = runGit(root, ["status", "--porcelain", "--untracked-files=all", "--", ...dirs]);
  if (res.error || res.status !== 0 || typeof res.stdout !== "string") return null;

  const changed = new Set();
  for (const line of res.stdout.split(/\r?\n/)) {
    if (line.length < 4) continue;
    // porcelain v1: "XY <path>"; renames/copies: "XY <old> -> <new>".
    const body = line.slice(3);
    const parts = body.includes(" -> ") ? body.split(" -> ") : [body];
    for (const part of parts) {
      const rel = unquotePath(part).replace(/\\/g, "/");
      if (!SOURCE_EXT.test(rel)) continue;
      if (!SCOPED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
      changed.add(rel);
    }
  }
  return changed;
}

/** First candidate ref that `git rev-parse --verify --quiet` resolves, or null. */
export function resolveBaseRef(root) {
  for (const cand of BASE_REF_CANDIDATES) {
    const res = runGit(root, ["rev-parse", "--verify", "--quiet", cand]);
    if (!res.error && res.status === 0 && typeof res.stdout === "string" && res.stdout.trim()) {
      return cand;
    }
  }
  return null;
}

/**
 * Files changed on this branch since it diverged from a resolvable upstream/default
 * branch (`<base>...HEAD`), under app/lib/components, plus the actual merge-base commit
 * (independently resolved via `git merge-base`, not just the base ref's name — the ref
 * itself can move). Best-effort: any failure (no resolvable base, git error) returns an
 * empty Set/null sha rather than null outright — this half is a widening on top of the
 * status check, never itself a reason to go silent.
 */
export function mergeBaseChangedFiles(root, dirs) {
  const base = resolveBaseRef(root);
  if (!base) return { changed: new Set(), mergeBaseSha: null };

  const res = runGit(root, ["diff", "--name-only", `${base}...HEAD`, "--", ...dirs]);
  if (res.error || res.status !== 0 || typeof res.stdout !== "string") {
    return { changed: new Set(), mergeBaseSha: null };
  }

  const changed = new Set();
  for (const raw of res.stdout.split(/\r?\n/)) {
    const rel = unquotePath(raw).replace(/\\/g, "/");
    if (!rel) continue;
    if (!SOURCE_EXT.test(rel)) continue;
    if (!SCOPED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
    changed.add(rel);
  }

  const mbRes = runGit(root, ["merge-base", "HEAD", base]);
  const mergeBaseSha =
    !mbRes.error && mbRes.status === 0 && typeof mbRes.stdout === "string" ? mbRes.stdout.trim() || null : null;

  return { changed, mergeBaseSha };
}

function resolveHeadSha(root) {
  const res = runGit(root, ["rev-parse", "HEAD"]);
  if (res.error || res.status !== 0 || typeof res.stdout !== "string") return null;
  const sha = res.stdout.trim();
  return sha || null;
}

/**
 * Cheap pre-check. Returns:
 *   null                                                          -> git could not answer,
 *                                                                     stay silent
 *   { changed: Set<string>, committedOnly, headSha, cacheKey }    -> otherwise
 *
 * `changed` unions working-tree/index changes with (only when the tree is clean)
 * committed-but-unpushed changes against the branch's merge-base. `committedOnly` is
 * true exactly when every changed file came from the merge-base diff (nothing dirty) —
 * that's the case the re-verify cache below is allowed to short-circuit. `cacheKey`
 * combines the HEAD sha with the resolved merge-base sha (not just the base ref's
 * name): if the base ref later moves — a fetch advances origin/main — while HEAD stays
 * put, the merge-base (and therefore the file set a fresh `base...HEAD` diff would
 * report) can change too, and the cache must treat that as a different verification,
 * not the same one it already passed.
 */
export function changedSourceFiles(root) {
  const dirs = SCOPED_DIRS.filter((d) => fs.existsSync(path.join(root, d)));
  if (dirs.length === 0) return { changed: new Set(), committedOnly: false, headSha: null, cacheKey: null };

  const workingTree = statusChangedFiles(root, dirs);
  if (workingTree === null) return null; // git could not answer -> caller stays silent

  let committed = new Set();
  let mergeBaseSha = null;
  if (workingTree.size === 0) {
    ({ changed: committed, mergeBaseSha } = mergeBaseChangedFiles(root, dirs));
  }

  const changed = new Set([...workingTree, ...committed]);
  const committedOnly = workingTree.size === 0 && committed.size > 0;
  const headSha = committedOnly ? resolveHeadSha(root) : null;
  const cacheKey = committedOnly && headSha ? `${headSha}:${mergeBaseSha ?? ""}` : null;
  return { changed, committedOnly, headSha, cacheKey };
}

/** Where the re-verify cache for `root` lives: OS temp dir, never inside the repo
 *  (so it can never show up in `git status` and never needs a .gitignore entry). */
function cacheFilePath(root) {
  const hash = crypto.createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), "moldai-verify-on-stop", `${hash}.json`);
}

/** `key` is `changedSourceFiles`'s `cacheKey` — HEAD sha + resolved merge-base sha,
 *  not a bare commit sha, so a moved base ref invalidates the cache (see that
 *  function's doc comment). Named "Sha" for historical/call-site brevity. */
export function readLastVerifiedSha(root) {
  try {
    const raw = fs.readFileSync(cacheFilePath(root), "utf8");
    const data = JSON.parse(raw);
    return typeof data?.sha === "string" ? data.sha : null;
  } catch {
    return null;
  }
}

export function writeLastVerifiedSha(root, key) {
  try {
    const file = cacheFilePath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ sha: key, at: Date.now() }), "utf8");
  } catch {
    /* best-effort cache; a write failure must never affect the hook's pass/fail contract */
  }
}

/**
 * Run a local JS entrypoint with `node`. Returns null when the tool is not installed
 * (internal condition -> caller stays silent), otherwise a result descriptor.
 */
function runTool({ root, entry, args, timeoutMs }) {
  const abs = path.join(root, entry);
  if (!fs.existsSync(abs)) return null;

  const started = Date.now();
  const res = spawnSync(process.execPath, [abs, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });

  const output = stripAnsi(`${res.stdout || ""}\n${res.stderr || ""}`);
  const timedOut = Boolean(res.error && (res.error.code === "ETIMEDOUT" || res.signal));
  if (res.error && !timedOut) return null; // spawn failure -> internal, stay silent

  return {
    failed: timedOut || res.status !== 0,
    timedOut,
    status: res.status,
    output,
    ms: Date.now() - started,
  };
}

function capLines(lines) {
  if (lines.length <= PER_COMMAND_LINE_CAP) return { lines, dropped: 0 };
  return {
    lines: lines.slice(0, PER_COMMAND_LINE_CAP),
    dropped: lines.length - PER_COMMAND_LINE_CAP,
  };
}

function capChars(text) {
  if (text.length <= PER_COMMAND_CHAR_CAP) return text;
  return `${text.slice(0, PER_COMMAND_CHAR_CAP)}\n… [truncated]`;
}

/** Last-resort condenser: the tail of the raw output. */
function tailOf(output) {
  const lines = output.split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(-PER_COMMAND_LINE_CAP).join("\n");
}

const VITEST_SIGNAL = [
  /\bFAIL\b/,
  /^\s*[×✕✗]\s/,
  /^\s*❯\s/,
  /^\s*(?:Test Files|Tests|Errors)\s+\d/,
  /AssertionError/,
  /^\s*→\s/,
  /^\s*(?:Syntax|Type|Reference|Range)Error\b/,
  /Unhandled (?:Error|Rejection)/,
];

const VITEST_SUMMARY = /^\s*(?:Test Files|Tests)\s+\d/;

function condenseVitest(output) {
  const lines = output.split(/\r?\n/);
  const hits = lines.filter((l) => VITEST_SIGNAL.some((re) => re.test(l))).map((l) => l.trimEnd());
  const chosen = hits.length
    ? hits
    : output
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .slice(-PER_COMMAND_LINE_CAP);

  // Hoist the pass/fail counts to the front so the scale of the breakage survives
  // truncation even when the detail lines below it do not.
  const summary = chosen.filter((l) => VITEST_SUMMARY.test(l)).map((l) => l.trim());
  const detail = chosen.filter((l) => !VITEST_SUMMARY.test(l));

  const { lines: kept, dropped } = capLines(detail);
  const parts = [...summary, ...kept];
  if (dropped) parts.push(`… [${dropped} more line(s) truncated]`);
  return capChars(parts.join("\n"));
}

/**
 * ESLint's default "stylish" formatter prints a bare file path, then indented
 * "line:col  severity  message  rule" rows. Flatten them back into self-contained
 * `file:line:col  error  message  rule` entries so each finding is actionable alone.
 * Warnings are skipped: they do not fail the command, so they are not why we blocked.
 */
function condenseEslint(output, root) {
  const lines = output.split(/\r?\n/);
  const findings = [];
  let current = "";
  let summary = "";

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    if (!/^\s/.test(line) && /[\\/]/.test(line) && /\.[a-z]+$/i.test(line)) {
      current = path.relative(root, line.trim()).replace(/\\/g, "/") || line.trim();
      continue;
    }
    const m = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.*)$/);
    if (m) {
      if (m[3] !== "error") continue;
      findings.push(`${current || "?"}:${m[1]}:${m[2]}  error  ${m[4].replace(/\s{2,}/g, "  ").trim()}`);
      continue;
    }
    if (/\d+\s+problems?\s*\(/.test(line)) summary = line.trim();
  }

  if (findings.length === 0) return capChars(tailOf(output));
  const { lines: kept, dropped } = capLines(findings);
  // Summary first: the total error count must survive the char cap.
  const parts = summary ? [summary, ...kept] : [...kept];
  if (dropped) parts.push(`… [${dropped} more error(s) truncated]`);
  return capChars(parts.join("\n"));
}

export function main() {
  const payload = readStdinJson();
  if (alreadyFired(payload)) ok(); // loop guard

  const startCwd = typeof payload.cwd === "string" && payload.cwd.trim() ? payload.cwd : process.cwd();
  const root = findRepoRoot(startCwd);
  if (!root) ok();

  const precheck = changedSourceFiles(root);
  if (precheck === null) ok(); // git could not answer -> stay silent
  const { changed, committedOnly, cacheKey } = precheck;
  if (changed.size === 0) ok(); // nothing verifiable changed -> free stop

  // Committed-but-unpushed work already verified at this exact HEAD (and merge-base) ->
  // skip the repeat sweep instead of re-running it on every subsequent conversational turn.
  if (committedOnly && cacheKey && readLastVerifiedSha(root) === cacheKey) ok();

  const changedList = [...changed];

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const failures = [];

  const remainingFor = () => deadline - Date.now();

  // 1. tests
  const testSlice = remainingFor();
  if (testSlice >= MIN_SLICE_MS) {
    const tests = runTool({
      root,
      entry: path.join("node_modules", "vitest", "vitest.mjs"),
      args: ["run"],
      timeoutMs: testSlice,
    });
    if (tests && tests.failed) {
      const head = tests.timedOut
        ? `npx vitest run — TIMED OUT after ${Math.round(tests.ms / 1000)}s`
        : `npx vitest run — FAILED (exit ${tests.status})`;
      failures.push(`${head}\n${condenseVitest(tests.output)}`);
    }
  }

  // 2. lint (scoped — never `npm run lint`, which crawls .claude/worktrees/)
  const lintSlice = remainingFor();
  if (lintSlice >= MIN_SLICE_MS) {
    const lint = runTool({
      root,
      entry: path.join("node_modules", "eslint", "bin", "eslint.js"),
      args: [...SCOPED_DIRS],
      timeoutMs: lintSlice,
    });
    if (lint && lint.failed) {
      const head = lint.timedOut
        ? `npx eslint app lib components — TIMED OUT after ${Math.round(lint.ms / 1000)}s`
        : `npx eslint app lib components — FAILED (exit ${lint.status})`;
      failures.push(`${head}\n${condenseEslint(lint.output, root)}`);
    }
  } else if (failures.length > 0) {
    failures.push("npx eslint app lib components — SKIPPED (180s hook budget exhausted)");
  }

  if (failures.length === 0) {
    if (committedOnly && cacheKey) writeLastVerifiedSha(root, cacheKey);
    ok();
  }

  const scope =
    changedList.length <= 6
      ? changedList.join(", ")
      : `${changedList.slice(0, 6).join(", ")} (+${changedList.length - 6} more)`;

  let reason =
    "Verification sweep failed — do not report this work as done yet. " +
    `Changed source files: ${scope}\n\n${failures.join("\n\n")}\n\n` +
    "Fix the failures above, then re-run: npx vitest run  &&  npx eslint app lib components " +
    "(typecheck with `npm run build`, not bare tsc).";

  if (reason.length > REASON_CHAR_CAP) {
    reason = `${reason.slice(0, REASON_CHAR_CAP)}\n… [output truncated — re-run the commands locally for the full report]`;
  }
  block(reason);
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    main();
  } catch {
    ok();
  }
}
