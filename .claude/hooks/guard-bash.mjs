#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: "Bash") — repo-root lint guard for the MoldAI repo.
 *
 * Convention enforced (CLAUDE.md / memory "repo-root lint crawls nested worktrees"):
 * `npm run lint` at the repo root runs bare `eslint`, which crawls .claude/worktrees/
 * (nested git worktrees = full copies of the source tree) and reports false alarms in
 * files that are not part of this checkout. Both .husky/pre-push and .github/workflows/ci.yml
 * run `npx eslint app lib components` instead — that is the only correct invocation.
 *
 * MATCHING DECISIONS (deliberately conservative — a noisy guard gets disabled):
 *  - The command is split into segments on `&&`, `||`, `;` and newlines, and every
 *    segment is checked. So `npm run build && npm run lint` IS denied: the fix is a
 *    one-token substitution the model can retry immediately, and letting the lint half
 *    run would reproduce exactly the false alarms this guard exists to prevent.
 *  - A segment is denied only when its ENTIRE text is a bare repo-root lint run:
 *    `npm run lint`, `npm run lint --`, `yarn lint`, `pnpm lint`, `bun run lint`
 *    (optional `run`, optional trailing `--`). Anything else on the segment — extra
 *    args, a pipe, a redirect, a subshell — means the caller wanted something more
 *    specific than the plain run, and the suggested replacement may not behave the
 *    same, so it is allowed through. Deliberate false negatives.
 *  - NOT split on `|`: a piped lint (`npm run lint | tee out.txt`) therefore never
 *    matches the whole-segment rule and is allowed — blocking mid-pipeline would
 *    break a command whose output shape the caller chose on purpose.
 *  - `npx eslint app lib components` (the correct form) and script names that merely
 *    start with "lint" (`npm run lint:fix`, `npm run lint-staged`) never match: the
 *    script name is anchored, so `lint:fix` and `lint-staged` are not `lint`.
 *
 * Zero dependencies (node: builtins only), no network, no subprocesses.
 * Any internal error exits 0 silently — a broken guard must never block work.
 */

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

/**
 * A whole segment that is a bare repo-root lint run.
 *   npm run lint [--]            (npm has no script shorthand — `run` required)
 *   yarn|pnpm|bun [run] lint [--] (these accept the `run`-less shorthand)
 * The script name is anchored, so `lint:fix` / `lint-staged` do not match.
 */
const BARE_LINT =
  /^npm\s+run\s+lint(?:\s+--)?$|^(?:yarn|pnpm|bun)\s+(?:run\s+)?lint(?:\s+--)?$/;

const DENY_REASON = [
  "Blocked: repo-root `npm run lint` runs bare `eslint`, which crawls .claude/worktrees/ — the nested git worktrees hold full copies of the source tree, so eslint reports errors for files that are not part of this checkout (false alarms).",
  "Run `npx eslint app lib components` instead: that is exactly what .husky/pre-push and .github/workflows/ci.yml execute, so it is the invocation whose result actually matters.",
  "If you also need the other half of a chained command, re-issue it with the lint step swapped for `npx eslint app lib components`.",
].join(" ");

/** Split on shell sequencing operators only — NOT on `|` (see matching decisions). */
function segments(command) {
  return command
    .split(/&&|\|\||;|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
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

  const command = payload.tool_input && payload.tool_input.command;
  if (typeof command !== "string" || !command.trim()) return;

  const hit = segments(command).some((segment) =>
    // collapse internal whitespace so `npm  run   lint` still matches
    BARE_LINT.test(segment.replace(/\s+/g, " ")),
  );
  if (!hit) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: DENY_REASON,
      },
    }),
  );
}

main().catch(() => {
  /* internal failure -> exit 0, silent */
});
