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
 *   - Cheap pre-check: `git status --porcelain -uall -- app lib components`. If no
 *     added / modified / renamed / deleted `.ts`/`.tsx` file shows up relative to HEAD,
 *     nothing verifiable changed (conversational turn, docs edit, config tweak) and the
 *     hook exits 0 without spawning anything. Costs ~70ms.
 *   - Time budget: 180s total, split across the two commands; a timeout is reported as
 *     a failure with the partial output, never as a hang.
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
import path from "node:path";

const TOTAL_BUDGET_MS = 180_000;
const GIT_TIMEOUT_MS = 15_000;
const MIN_SLICE_MS = 20_000; // don't start a command with less than this left
const PER_COMMAND_CHAR_CAP = 2200;
const PER_COMMAND_LINE_CAP = 60;
const REASON_CHAR_CAP = 4000;
const SCOPED_DIRS = ["app", "lib", "components"];
const SOURCE_EXT = /\.tsx?$/i;

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

/**
 * Cheap pre-check. Returns the changed .ts/.tsx paths under app/, lib/, components/
 * (index + worktree, relative to HEAD, untracked included), or null if git could not
 * answer — in which case the caller stays silent rather than guessing.
 */
function changedSourceFiles(root) {
  const dirs = SCOPED_DIRS.filter((d) => fs.existsSync(path.join(root, d)));
  if (dirs.length === 0) return [];

  const res = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...dirs], {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
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
  return [...changed];
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

function main() {
  const payload = readStdinJson();
  if (alreadyFired(payload)) ok(); // loop guard

  const startCwd = typeof payload.cwd === "string" && payload.cwd.trim() ? payload.cwd : process.cwd();
  const root = findRepoRoot(startCwd);
  if (!root) ok();

  const changed = changedSourceFiles(root);
  if (changed === null) ok(); // git could not answer -> stay silent
  if (changed.length === 0) ok(); // nothing verifiable changed -> free stop

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

  if (failures.length === 0) ok();

  const scope =
    changed.length <= 6
      ? changed.join(", ")
      : `${changed.slice(0, 6).join(", ")} (+${changed.length - 6} more)`;

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

try {
  main();
} catch {
  ok();
}
