#!/usr/bin/env node
/**
 * check-conventions.mjs — Claude Code PostToolUse hook (matcher: Edit|Write)
 *
 * Enforces four CLAUDE.md conventions on the file that was just edited. It reads the
 * file FROM DISK (the edit has already landed; tool_input.content is only a fragment
 * for Edit), and only inspects .ts/.tsx files under app/ or components/.
 *
 *   CHECK 1  hardcoded pt-BR display text   -> "UI display text is pt-BR ... ALL of it comes
 *            (.tsx only, comments masked)      from messages/pt-BR.json via useTranslations"
 *   CHECK 2  hardcoded hex colors           -> "Design tokens live in app/globals.css as
 *            (.tsx only, comments masked)      Tailwind v4 @theme variables; never hardcode hex"
 *   CHECK 3  direct fetch(                  -> "All server calls go through lib/api-client.ts;
 *            (app/ + components/, NOT         components never call fetch directly"
 *            app/api/** route handlers)
 *   CHECK 4  i18n catalog key existence     -> t("literal") keys must resolve inside the
 *            (.ts + .tsx)                     declared useTranslations/getTranslations namespace
 *
 * Zero dependencies (node: builtins only). Any INTERNAL error exits 0 silently — a broken
 * checker must never block the user's work. Findings -> compact stderr report + exit 2.
 */

import { readFileSync, existsSync, statSync, readSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// tunables
// ---------------------------------------------------------------------------

/** pt-BR accented letters. Deliberately excludes typographic symbols in legitimate
 *  use across this repo (— · → … − – ✕ ⋯ ◆ ◍ ↖ ↔ × ¼ π), which are NOT display text. */
const PT_BR_ACCENTS_G = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g;

const HEX_COLOR_G = /#[0-9a-fA-F]{3,8}\b/g;

/** `fetch(` not preceded by an identifier char, so prefetch(/refetch( don't match
 *  while window.fetch( still does. */
const FETCH_CALL_G = /(?<![A-Za-z0-9_$])fetch\s*\(/g;

const TRANSLATOR_BINDING_G =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(useTranslations|getTranslations)\s*\(\s*(["'])([^"'`]+)\3\s*\)/g;

const MAX_SNIPPET = 96;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Blocking read of all of fd 0. Tolerates EAGAIN (Windows pipes) and an absent stdin. */
function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  let spins = 0;
  for (;;) {
    let n;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (err) {
      const code = err && err.code;
      if (code === "EAGAIN" && spins++ < 500) continue;
      if (code === "EOF" || code === "ENXIO" || code === "EBADF") break;
      break;
    }
    if (!n) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
    if (chunks.length > 256) break; // ~16MB guard
  }
  return Buffer.concat(chunks).toString("utf8");
}

const toPosix = (p) => String(p).replace(/\\/g, "/");

/** Nearest ancestor directory holding package.json (worktrees resolve to their own root). */
function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 40; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Replace every comment character with a space, preserving byte/line offsets, so
 * downstream regexes never see commented-out code. String and template contents are
 * left intact. `//` inside an unquoted JSX text run (a bare URL) is treated as a
 * comment — that only ever hides text, i.e. a false negative, which is the safe side.
 */
function maskComments(src) {
  const out = src.split("");
  const NORMAL = 0, LINE = 1, BLOCK = 2, SQ = 3, DQ = 4, TPL = 5;
  let state = NORMAL;
  let tplDepth = 0; // nesting of ${ } inside the current template
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    switch (state) {
      case NORMAL:
        if (c === "/" && n === "/") { state = LINE; out[i] = " "; out[i + 1] = " "; i++; }
        else if (c === "/" && n === "*") { state = BLOCK; out[i] = " "; out[i + 1] = " "; i++; }
        else if (c === "'") state = SQ;
        else if (c === '"') state = DQ;
        else if (c === "`") { state = TPL; tplDepth = 0; }
        break;
      case LINE:
        if (c === "\n") state = NORMAL;
        else out[i] = " ";
        break;
      case BLOCK:
        if (c === "*" && n === "/") { out[i] = " "; out[i + 1] = " "; i++; state = NORMAL; }
        else if (c !== "\n") out[i] = " ";
        break;
      case SQ:
        if (c === "\\") i++;
        else if (c === "'" || c === "\n") state = NORMAL;
        break;
      case DQ:
        if (c === "\\") i++;
        else if (c === '"' || c === "\n") state = NORMAL;
        break;
      case TPL:
        if (c === "\\") i++;
        else if (c === "$" && n === "{") { tplDepth++; i++; }
        else if (c === "}" && tplDepth > 0) tplDepth--;
        else if (c === "`" && tplDepth === 0) state = NORMAL;
        break;
    }
  }
  return out.join("");
}

/** Line number (1-indexed) for a character offset. */
function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

function snippet(src, index) {
  const start = src.lastIndexOf("\n", index) + 1;
  let end = src.indexOf("\n", index);
  if (end === -1) end = src.length;
  const text = src.slice(start, end).trim();
  return text.length > MAX_SNIPPET ? text.slice(0, MAX_SNIPPET - 1) + "…" : text;
}

/**
 * Ranges (as [start,end) offsets) covered by `export const metadata = {...}` or
 * `generateMetadata`. Next.js route metadata is a Server-Component export that legitimately
 * sits outside next-intl (app/layout.tsx ships pt-BR there today).
 */
function metadataRanges(src) {
  const ranges = [];
  const re = /export\s+(?:const\s+metadata\b|(?:async\s+)?function\s+generateMetadata\b)/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf("{", m.index);
    if (open === -1) continue;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    ranges.push([m.index, i]);
  }
  return ranges;
}

const inRanges = (ranges, idx) => ranges.some(([a, b]) => idx >= a && idx < b);

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

function checkPtBrText(masked, rel, findings) {
  const skip = metadataRanges(masked);
  const seenLines = new Set();
  let m;
  PT_BR_ACCENTS_G.lastIndex = 0;
  while ((m = PT_BR_ACCENTS_G.exec(masked))) {
    if (inRanges(skip, m.index)) continue;
    const line = lineAt(masked, m.index);
    if (seenLines.has(line)) continue;
    seenLines.add(line);
    findings.push({
      check: "1 · hardcoded pt-BR display text",
      line,
      rel,
      message: `hardcoded pt-BR text — display text belongs in messages/pt-BR.json, read via useTranslations("Namespace") → t("key"): ${snippet(masked, m.index)}`,
    });
  }
}

function checkHexColors(masked, rel, findings) {
  let m;
  HEX_COLOR_G.lastIndex = 0;
  while ((m = HEX_COLOR_G.exec(masked))) {
    findings.push({
      check: "2 · hardcoded hex color",
      line: lineAt(masked, m.index),
      rel,
      message: `hardcoded color ${m[0]} — use an @theme token from app/globals.css (add one there if none matches)`,
    });
  }
}

function checkFetch(masked, rel, findings) {
  let m;
  FETCH_CALL_G.lastIndex = 0;
  while ((m = FETCH_CALL_G.exec(masked))) {
    findings.push({
      check: "3 · direct fetch()",
      line: lineAt(masked, m.index),
      rel,
      message:
        "direct fetch() in a client screen — route client server-calls through lib/api-client.ts",
    });
  }
}

/** Walks `messages[ns][a][b]...` for a dotted key; returns the leaf or undefined. */
function resolveKey(messages, ns, key) {
  let node = messages?.[ns];
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object" || Array.isArray(node)) return undefined;
    node = node[part];
  }
  return node;
}

function checkI18nKeys(masked, rel, findings, messages) {
  if (!messages) return;

  // alias -> namespace. An alias bound to two different namespaces in one file is
  // ambiguous; we drop it entirely rather than guess (TabBar.tsx binds `t` twice, same NS).
  const aliases = new Map();
  const ambiguous = new Set();
  let b;
  TRANSLATOR_BINDING_G.lastIndex = 0;
  while ((b = TRANSLATOR_BINDING_G.exec(masked))) {
    const [, alias, , , ns] = b;
    if (aliases.has(alias) && aliases.get(alias) !== ns) ambiguous.add(alias);
    aliases.set(alias, ns);
  }
  for (const a of ambiguous) aliases.delete(a);
  if (aliases.size === 0) return;

  for (const [alias, ns] of aliases) {
    if (!messages[ns]) {
      findings.push({
        check: "4 · unknown i18n namespace",
        line: lineAt(masked, masked.indexOf(alias + " =")),
        rel,
        message: `namespace "${ns}" is not in messages/pt-BR.json`,
      });
      continue;
    }
    // alias(...) or alias.rich(...) / .raw(...) / .markup(...) — first arg only.
    const callRe = new RegExp(
      `(?<![A-Za-z0-9_$.])${alias.replace(/\$/g, "\\$")}(?:\\.(?:rich|raw|markup))?\\s*\\(\\s*(["'])((?:[^"'\\\\]|\\\\.)*)\\1\\s*([,)])`,
      "g"
    );
    let m;
    while ((m = callRe.exec(masked))) {
      // m[3] is the char right after the literal: `,` or `)` means the literal IS the whole
      // first argument. Concatenation (`t("a." + x)`) never reaches here — the regex needs
      // `,`/`)` after the closing quote — and template literals / variables never match at all.
      const key = m[2];
      if (!key || /^\s*$/.test(key)) continue;
      const value = resolveKey(messages, ns, key);
      if (typeof value !== "string") {
        findings.push({
          check: "4 · missing i18n key",
          line: lineAt(masked, m.index),
          rel,
          message: `${ns}.${key} is not in messages/pt-BR.json — add it (UI display text lives only in the catalog)`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const raw = readStdin();
  if (!raw || !raw.trim()) return 0;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return 0; // malformed stdin: never block
  }

  const filePathRaw = payload?.tool_input?.file_path;
  if (typeof filePathRaw !== "string" || !filePathRaw.trim()) return 0;

  const cwd = typeof payload?.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const abs = path.resolve(cwd, filePathRaw);
  const absPosix = toPosix(abs);

  if (/\/(node_modules|\.next|dist|build|coverage)\//.test(absPosix + "/")) return 0;
  if (!/\.(ts|tsx)$/.test(absPosix)) return 0;
  if (/\.(test|spec)\.tsx?$/.test(absPosix)) return 0;
  if (/\.d\.ts$/.test(absPosix)) return 0;

  const root = findRepoRoot(path.dirname(abs)) ?? findRepoRoot(cwd);
  if (!root) return 0;

  const rel = toPosix(path.relative(root, abs));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return 0; // outside the repo
  if (!/^(app|components)\//.test(rel)) return 0; // lib/, scripts/, prisma/, … are out of scope

  let src;
  try {
    if (!statSync(abs).isFile()) return 0;
    src = readFileSync(abs, "utf8");
  } catch {
    return 0; // deleted / unreadable / nonexistent: never block
  }
  if (src.length > 2_000_000) return 0;

  const masked = maskComments(src);
  const isTsx = rel.endsWith(".tsx");
  const isApiRoute = rel.startsWith("app/api/");

  const findings = [];

  // CHECK 1 & 2 — display-text and design-token rules are about rendered UI, so they run
  // on .tsx only. app/api/**/*.ts route handlers hold the pt-BR error strings CLAUDE.md
  // documents as a known, deliberate asymmetry; flagging them every edit would be noise.
  if (isTsx) {
    checkPtBrText(masked, rel, findings);
    checkHexColors(masked, rel, findings);
  }

  // CHECK 3 — the convention is "CLIENT components never call the server directly".
  // app/api/**/* are SERVER route handlers: fetch() there is a legitimate outbound call to an
  // external service (the whole point of a route handler), not a convention violation, so
  // they are exempt. Everything else under app/ (pages, layouts) and components/ is checked.
  if (!isApiRoute) checkFetch(masked, rel, findings);

  // CHECK 4 — key existence applies wherever a namespace is declared, including the two
  // getTranslations("PatternData") call sites inside app/api route handlers.
  let messages = null;
  try {
    const catalog = path.join(root, "messages", "pt-BR.json");
    if (existsSync(catalog)) messages = JSON.parse(readFileSync(catalog, "utf8"));
  } catch {
    messages = null; // unreadable catalog: skip check 4 rather than misreport
  }
  checkI18nKeys(masked, rel, findings, messages);

  if (findings.length === 0) return 0;

  const byCheck = new Map();
  for (const f of findings) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check).push(f);
  }
  const lines = ["CLAUDE.md convention check failed for " + rel + ":"];
  for (const [check, group] of [...byCheck.entries()].sort()) {
    lines.push("", "CHECK " + check);
    for (const f of group.sort((a, b) => a.line - b.line)) {
      lines.push(`  ${f.rel}:${f.line} — ${f.message}`);
    }
  }
  process.stderr.write(lines.join("\n") + "\n");
  return 2;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // internal error: fail open, always
}
process.exit(code);
