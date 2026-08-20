#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: "Edit|Write") — path guard for the MoldAI repo.
 *
 * Enforces two CLAUDE.md / AGENTS.md conventions, by file path only:
 *
 *  (a) DENY writes to secrets + generated files
 *      - `.env`, `.env.local`, `.env.production`, `.env.<anything>` — real secrets
 *        (ANTHROPIC_API_KEY, AUTH_SECRET, DATABASE_URL live in .env.local).
 *        `.env.example` / `.env.sample` are templates and stay editable.
 *      - repo-root `AGENTS.md` — "written and re-added by `next dev`"; CLAUDE.md
 *        says never hand-edit it, just keep it committed.
 *
 *  (b) INJECT a Next.js 16 reminder (never a denial) when an App Router file or a
 *      root config/auth entrypoint is edited, per AGENTS.md: "This is NOT the
 *      Next.js you know … read the relevant guide in node_modules/next/dist/docs/".
 *
 * (a) and (b) are mutually exclusive and a denial wins — at most ONE JSON object
 * is ever printed. Anything else: exit 0, no output.
 *
 * Zero dependencies (node: builtins only), no network, no subprocesses.
 * Any internal error exits 0 silently — a broken guard must never block work.
 */

import path from "node:path";
import fs from "node:fs";

/** Read all of stdin as UTF-8. Resolves with "" on error, or after a short cap. */
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    // Safety net: never hang waiting on a stdin that is not closed.
    const timer = setTimeout(() => finish(data), 2000);
    try {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
      });
      process.stdin.on("end", () => finish(data));
      process.stdin.on("error", () => finish(""));
    } catch {
      finish("");
    }
  });
}

/** Windows-safe: backslashes -> forward slashes, collapse duplicate slashes. */
function toPosix(p) {
  return String(p).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

/** Case-insensitive comparison on Windows, exact elsewhere. */
function samePath(a, b) {
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/** Walk up from `start` looking for a `.git` entry (dir or worktree file). */
function findRepoRoot(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 40; i += 1) {
    try {
      if (fs.existsSync(path.join(dir, ".git"))) return dir;
    } catch {
      /* ignore and keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start);
}

/**
 * Secrets: `.env` and `.env.<suffix>`, but not `.env.example` / `.env.sample`
 * and not unrelated names that merely start with ".env" (e.g. `.environment`).
 */
const ENV_FILE = /^\.env($|\.)/;
const ENV_TEMPLATE = /^\.env\.(example|sample)$/;

/** App Router files that carry Next-version-specific API surface. */
const APP_ROUTER_FILE = /^app\/(?:.*\/)?(?:route\.ts|layout\.tsx|page\.tsx)$/;
const ROOT_NEXT_FILES = new Set([
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "middleware.ts",
  "auth.ts",
]);

const NEXT16_REMINDER = [
  "This repo is on Next.js 16, which has breaking changes versus the Next.js in your training data",
  "(route-handler signatures, async request APIs, config options, App Router conventions).",
  "Per AGENTS.md, read the relevant guide under node_modules/next/dist/docs/ to confirm the current",
  "convention before writing route handlers, config, or App Router APIs — do not assume an older one.",
  "Heed any deprecation notices you find there.",
].join(" ");

function envDenyReason(basename, repoRoot) {
  let templateHint;
  try {
    const hasExample = fs.existsSync(path.join(repoRoot, ".env.example"));
    const hasSample = fs.existsSync(path.join(repoRoot, ".env.sample"));
    const template = hasExample ? ".env.example" : hasSample ? ".env.sample" : null;
    templateHint = template
      ? `Instead: ask the user to edit it themselves, or read the variable names from ${template} — that template is editable and is not blocked.`
      : "Instead: ask the user to edit it themselves. This repo has no .env.example/.env.sample yet; the required variable names are documented in CLAUDE.md and README.md, and creating a .env.example template is allowed (this hook does not block it).";
  } catch {
    templateHint =
      "Instead: ask the user to edit it themselves — the required variable names are documented in CLAUDE.md and README.md.";
  }
  return [
    `Blocked: ${basename} is a real secrets file (this repo keeps ANTHROPIC_API_KEY, AUTH_SECRET and DATABASE_URL in .env.local, git-ignored via ".env*").`,
    "An agent must never write it — a bad edit silently breaks auth, the DB connection, and the Anthropic API call, and the values cannot be recovered from git.",
    templateHint,
  ].join(" ");
}

const AGENTS_DENY_REASON = [
  "Blocked: AGENTS.md at the repo root is auto-generated — it is written and re-added by `next dev`",
  "(see node_modules/next/dist/server/lib/generate-agent-files.js), and CLAUDE.md says never hand-edit it, just keep it committed.",
  "Any hand-edit is thrown away and re-created as an uncommitted change the next time `next dev` runs.",
  "If this guidance needs to change, edit CLAUDE.md instead (it is the repo's source of truth and it @-references AGENTS.md).",
].join(" ");

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}

function inject(context) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: context,
      },
    }),
  );
}

async function main() {
  const raw = await readStdin();
  if (!raw || !raw.trim()) return; // empty stdin -> silent success

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return; // malformed stdin -> silent success
  }
  if (!payload || typeof payload !== "object") return;

  const filePath = payload.tool_input && payload.tool_input.file_path;
  if (typeof filePath !== "string" || !filePath.trim()) return;

  const cwd =
    typeof payload.cwd === "string" && payload.cwd.trim() ? payload.cwd : process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const absolute = path.resolve(cwd, filePath); // handles relative and absolute alike
  const absolutePosix = toPosix(absolute);
  const basename = path.posix.basename(toPosix(filePath));

  // --- (a) denials -------------------------------------------------------
  if (ENV_FILE.test(basename) && !ENV_TEMPLATE.test(basename)) {
    deny(envDenyReason(basename, repoRoot));
    return;
  }

  const rootAgents = toPosix(path.resolve(repoRoot, "AGENTS.md"));
  if (samePath(absolutePosix, rootAgents)) {
    deny(AGENTS_DENY_REASON);
    return;
  }

  // --- (b) Next.js 16 reminder ------------------------------------------
  const relative = toPosix(path.relative(repoRoot, absolute));
  if (!relative || relative.startsWith("../")) return; // outside the repo -> stay silent

  if (APP_ROUTER_FILE.test(relative) || ROOT_NEXT_FILES.has(relative)) {
    inject(NEXT16_REMINDER);
  }
}

main().catch(() => {
  /* internal failure -> exit 0, silent */
});
