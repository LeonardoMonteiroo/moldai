#!/usr/bin/env node
/**
 * check-conventions.mjs — Claude Code PostToolUse hook (matcher: Edit|Write)
 *
 * Enforces four CLAUDE.md conventions on the file that was just edited. It reads the
 * file FROM DISK (the edit has already landed; tool_input.content is only a fragment
 * for Edit), and inspects .ts/.tsx files under app/, components/ or lib/.
 *
 *   CHECK 1  hardcoded pt-BR display text   -> "UI display text is pt-BR ... ALL of it comes
 *            (.tsx anywhere in scope, plus     from messages/pt-BR.json via useTranslations"
 *            .ts under app/api/** and lib/,    Wire payloads under app/api/** now carry only
 *            minus RAW_OUTPUT_TEXT_EXEMPT,     machine-readable codes (the wire-error-codes
 *            comments masked)                  sweep), and lib/ is pure logic that must stay
 *                                               framework-free — so a pt-BR literal in either
 *                                               is a defect, not the old deliberate asymmetry.
 *   CHECK 2  hardcoded hex colors           -> "Design tokens live in app/globals.css as
 *            (.tsx anywhere in scope, plus     Tailwind v4 @theme variables; never hardcode hex"
 *            .ts under app/api/**, minus
 *            RAW_OUTPUT_COLOR_EXEMPT)
 *   CHECK 3  direct fetch(                  -> "All server calls go through lib/api-client.ts;
 *            (app/ + components/, NOT         components never call fetch directly". Does NOT
 *            app/api/** route handlers,       run on lib/ — a leaf module legitimately calling
 *            NOT lib/)                        an external API isn't the convention this guards.
 *   CHECK 4  i18n catalog key existence     -> t("literal") keys must resolve inside the
 *            (.ts + .tsx, wherever a           declared useTranslations/getTranslations
 *            useTranslations/getTranslations   namespace, and their {placeholder} values must
 *            alias is declared)                be supplied. A template-built or concatenated
 *                                               key (`t(`ns.${x}`)`, `t("a." + x)`) can't be
 *                                               statically resolved — it is reported as a
 *                                               distinct, NON-BLOCKING "unresolvable" finding
 *                                               so a human checks it by hand, rather than being
 *                                               silently skipped.
 *
 * WHY CHECK 1/2's lib/ WIDENING CARRIES AN EXEMPT LIST (RAW_OUTPUT_TEXT_EXEMPT /
 * RAW_OUTPUT_COLOR_EXEMPT below), NOT A BLANKET "ALL OF lib/"
 *   Before shipping this widening, it was run across the *entire* current repo (not just
 *   hand-picked fixtures) — the exercise issue #7 itself calls for ("no false positives;
 *   every real hit is either fixed or owned by a linked issue"). CHECK 2 alone produced
 *   32 hits and every one was a false positive: lib/export/*.ts (svg/dxf/dxf-aama) and
 *   lib/editor/thumbnail.ts hand-build raw SVG strings (`stroke="#4a5a3a"`), and
 *   lib/mail/templates.ts hand-builds a raw HTML email (`style="color:#6b7a4a"`) — none of
 *   that is a Tailwind/@theme-consuming component, so CHECK 2's actual rule ("never
 *   hardcode hex *in components*") doesn't apply; an email client can't read a CSS
 *   variable, and neither can the CAD/cutting software that opens an exported .dxf/.svg.
 *   CHECK 1 similarly false-positived on lib/export/{svg,dxf,dxf-aama}.ts's embedded
 *   file-metadata comment ("tam ... folga ... linha de costura líquida") — text baked
 *   into the exported *file* for a human opening it in Illustrator/Audaces, not
 *   next-intl-routed app UI — and on lib/ai/prompt.ts's English system prompt, which
 *   legitimately quotes pt-BR pattern-making jargon ("cava (armhole), copa (sleeve
 *   cap)...") for the model. Zero true positives were found anywhere in lib/ for either
 *   check (the one known real one, lib/sizeCharts/seed.ts's hardcoded chart names, was
 *   already fixed by issue #3 before this widening landed). The exempt lists name those
 *   specific non-UI raw-output modules so a *future* accidental pt-BR/hex leak elsewhere
 *   in lib/ (a drafter, a Zustand store, …) is still caught.
 *
 * Zero dependencies (node: builtins only). Any INTERNAL error exits 0 silently — a broken
 * checker must never block the user's work. Blocking findings -> compact stderr report +
 * exit 2. Warning-only findings (unresolvable/unused i18n calls) are also printed to stderr
 * for visibility, but never change the exit code.
 */

import { readFileSync, existsSync, statSync, readSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

/** CHECK 1's lib/ exemptions: modules whose text is baked into an exported *file* or an
 *  AI prompt, never rendered as next-intl-routed app UI. See the header comment above
 *  for the whole-repo audit that justifies each entry. */
const RAW_OUTPUT_TEXT_EXEMPT = ["lib/export/", "lib/ai/"];

/** CHECK 2's lib/ exemptions: modules that hand-build a raw SVG/HTML string consumed
 *  outside the app's own Tailwind/@theme pipeline (an exported file, an email client),
 *  where a literal color is the actual content, not a design-token violation. */
const RAW_OUTPUT_COLOR_EXEMPT = ["lib/export/", "lib/mail/", "lib/editor/thumbnail.ts"];

const isUnderAny = (rel, prefixes) => prefixes.some((p) => rel === p || rel.startsWith(p));

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
export function findRepoRoot(startDir) {
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
export function maskComments(src) {
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

/**
 * Classifies a repo-relative path for the four checks, or returns null when the path
 * is out of scope entirely (scripts/, prisma/, node_modules/, …).
 */
export function classifyPath(rel) {
  const isLib = rel.startsWith("lib/");
  const inScope = isLib || /^(app|components)\//.test(rel);
  if (!inScope) return null;
  return {
    isLib,
    isTsx: rel.endsWith(".tsx"),
    isApiRoute: rel.startsWith("app/api/"),
    isRawOutputText: isLib && isUnderAny(rel, RAW_OUTPUT_TEXT_EXEMPT),
    isRawOutputColor: isLib && isUnderAny(rel, RAW_OUTPUT_COLOR_EXEMPT),
  };
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

export function checkPtBrText(masked, rel, findings) {
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

export function checkHexColors(masked, rel, findings) {
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

export function checkFetch(masked, rel, findings) {
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
export function resolveKey(messages, ns, key) {
  let node = messages?.[ns];
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object" || Array.isArray(node)) return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Extracts every `{name}` / `{name, ...}` ICU placeholder from a resolved catalog
 * string — at any nesting depth — ignoring text inside `'...'` escapes (ICU's
 * literal-text quoting, also how a literal `{`/`}` is escaped).
 *
 * A bare `/\{name/g` scan over-matches: a plural/select construct's own branch bodies
 * are ALSO `{...}`-delimited and are literal message text, not placeholders —
 * `{count, plural, =0 {Nenhum molde} one {# molde} other {# moldes}}` must yield only
 * `["count"]`, not `["count","Nenhum"]`. The naive scan matched "{Nenhum molde}"'s own
 * opening brace as a second placeholder, a real false positive verified against this
 * repo's own catalog (`PatternGrid.countLabel`, `ConflictInfoCard.gapLabel`'s
 * `{direction, select, ...}`).
 *
 * The fix is a syntactic peek at each `{`: a genuine placeholder's identifier is
 * followed (after optional whitespace) by `,` or the closing `}` — nothing else. A
 * branch body's opening brace fails that test (its content is arbitrary message text,
 * e.g. "Nenhum" followed by " molde}", not "," or "}"), so it is walked over (depth
 * tracked, not recorded) rather than misread as a name. This also correctly finds a
 * placeholder genuinely nested *inside* a branch body (`{diff}` inside `"falta {diff}
 * cm na copa"`), which the simpler depth-0-only version could not.
 */
export function placeholdersOf(value) {
  if (typeof value !== "string") return [];
  const stripped = value.replace(/'[^']*'/g, "");
  const names = new Set();
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] !== "{") continue;
    let j = i + 1;
    while (j < stripped.length && /\s/.test(stripped[j])) j++;
    const start = j;
    if (/[A-Za-z_$]/.test(stripped[j] ?? "")) {
      while (j < stripped.length && /[\w$]/.test(stripped[j])) j++;
    }
    const name = stripped.slice(start, j);
    let k = j;
    while (k < stripped.length && /\s/.test(stripped[k])) k++;
    if (name && (stripped[k] === "}" || stripped[k] === ",")) names.add(name);
  }
  return [...names];
}

/**
 * From `start` (an index into `src`), scans one call-argument's raw source, respecting
 * nested (), {}, [] and quoted strings. Returns { text } for the argument up to (but not
 * including) the next top-level `,` or the call's closing `)`, or null if unbalanced.
 */
function scanArgument(src, start) {
  let depth = 0;
  let i = start;
  while (i < src.length && /\s/.test(src[i])) i++;
  const argStart = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0 && c === ")") return { text: src.slice(argStart, i) };
      depth--;
    } else if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
    } else if (c === "," && depth === 0) {
      return { text: src.slice(argStart, i) };
    }
  }
  return null;
}

/**
 * Parses the top-level keys of an object-literal argument's raw source (`{a, b: c}` ->
 * `["a","b"]`). Returns null when the argument isn't (syntactically) an object literal —
 * a variable, a spread-only call, a function — which the caller treats as unresolvable
 * rather than wrong.
 */
function parseObjectLiteralKeys(argText) {
  const t = argText.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  const inner = t.slice(1, -1);
  let depth = 0;
  let segStart = 0;
  const segments = [];
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      segments.push(inner.slice(segStart, i));
      segStart = i + 1;
    }
  }
  segments.push(inner.slice(segStart));
  const keys = new Set();
  for (const seg of segments) {
    const s = seg.trim();
    if (!s || s.startsWith("...")) continue; // spread — can't statically resolve that key
    const m = s.match(/^(?:\[[^\]]*\]|["'`]?([A-Za-z_$][\w$]*)["'`]?)\s*(?::|$)/);
    if (m && m[1]) keys.add(m[1]);
  }
  return keys;
}

export function checkI18nKeys(masked, rel, findings, messages) {
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
    const escapedAlias = alias.replace(/\$/g, "\\$");

    // alias(...) or alias.rich(...) / .raw(...) / .markup(...), literal first arg only,
    // optionally followed by a second (values) argument.
    const callRe = new RegExp(
      `(?<![A-Za-z0-9_$.])${escapedAlias}(\\.(?:rich|raw|markup))?\\s*\\(\\s*(["'])((?:[^"'\\\\]|\\\\.)*)\\2\\s*([,)])`,
      "g"
    );
    let m;
    while ((m = callRe.exec(masked))) {
      const isRich = Boolean(m[1]);
      const key = m[3];
      const terminator = m[4];
      if (!key || /^\s*$/.test(key)) continue;
      const line = lineAt(masked, m.index);
      const value = resolveKey(messages, ns, key);
      if (typeof value !== "string") {
        findings.push({
          check: "4 · missing i18n key",
          line,
          rel,
          message: `${ns}.${key} is not in messages/pt-BR.json — add it (UI display text lives only in the catalog)`,
        });
        continue;
      }

      const needed = placeholdersOf(value);
      let suppliedKeys = null; // null = "not statically checkable"
      if (terminator === ",") {
        const arg = scanArgument(masked, callRe.lastIndex);
        if (arg) suppliedKeys = parseObjectLiteralKeys(arg.text);
      }

      if (suppliedKeys === null) {
        // No second argument, or one we can't statically parse (variable, spread-only,
        // function). Only "no argument at all while placeholders are needed" is checkable.
        if (needed.length > 0 && terminator !== ",") {
          findings.push({
            check: "4 · missing i18n value",
            line,
            rel,
            message: `${ns}.${key} needs {${needed.join(", ")}} — call site passes no values object`,
          });
        }
        continue;
      }

      const missing = needed.filter((n) => !suppliedKeys.has(n));
      if (missing.length > 0) {
        findings.push({
          check: "4 · missing i18n value",
          line,
          rel,
          message: `${ns}.${key} needs {${missing.join(", ")}} — call site doesn't supply ${missing.length === 1 ? "it" : "them"}`,
        });
      }
      // Rich-text calls legitimately pass tag-rendering functions (<b>...</b>-style) that
      // are not {placeholder} names at all, so "extra" would be a guaranteed false positive.
      if (!isRich) {
        const extra = [...suppliedKeys].filter((k) => !needed.includes(k));
        if (extra.length > 0) {
          findings.push({
            check: "4 · unused i18n value",
            line,
            rel,
            severity: "warning",
            message: `${ns}.${key} call passes {${extra.join(", ")}}, which the catalog string doesn't use — check for a stale value`,
          });
        }
      }
    }

    // Template-built or concatenated keys can't be statically resolved at all. Report them
    // instead of silently skipping, so a human verifies the key by hand.
    const unresolvedRe = new RegExp(
      `(?<![A-Za-z0-9_$.])${escapedAlias}(?:\\.(?:rich|raw|markup))?\\s*\\(\\s*(?:` +
        "`(?:[^`\\\\]|\\\\.)*`" + // template literal first arg
        `|(["'])(?:[^"'\\\\]|\\\\.)*\\1\\s*\\+` + // string literal immediately followed by '+'
        `)`,
      "g"
    );
    let u;
    while ((u = unresolvedRe.exec(masked))) {
      findings.push({
        check: "4 · unresolvable i18n key",
        line: lineAt(masked, u.index),
        rel,
        severity: "warning",
        message: `template-built or concatenated i18n key — not statically verifiable, check by hand: ${snippet(masked, u.index)}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export function main() {
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

  const scope = classifyPath(rel);
  if (!scope) return 0; // scripts/, prisma/, … stay out of scope
  const { isLib, isTsx, isApiRoute, isRawOutputText, isRawOutputColor } = scope;

  let src;
  try {
    if (!statSync(abs).isFile()) return 0;
    src = readFileSync(abs, "utf8");
  } catch {
    return 0; // deleted / unreadable / nonexistent: never block
  }
  if (src.length > 2_000_000) return 0;

  const masked = maskComments(src);

  const findings = [];

  // CHECK 1 & 2 — display-text and design-token rules run on any .tsx in scope, plus .ts
  // under app/api/** (wire payloads are machine-readable codes now — a pt-BR literal there
  // is a defect, not the old deliberate asymmetry) and lib/ (pure logic that must stay
  // framework-free per CLAUDE.md — this is what would catch e.g. a hardcoded chart name),
  // minus each check's own RAW_OUTPUT_*_EXEMPT (see the header comment's whole-repo audit).
  if (isTsx || isApiRoute || (isLib && !isRawOutputText)) checkPtBrText(masked, rel, findings);
  if (isTsx || isApiRoute || (isLib && !isRawOutputColor)) checkHexColors(masked, rel, findings);

  // CHECK 3 — the convention is "CLIENT components never call the server directly".
  // app/api/**/* are SERVER route handlers: fetch() there is a legitimate outbound call to an
  // external service (the whole point of a route handler), not a convention violation. lib/ is
  // likewise exempt — a leaf module calling an external API is not this convention's target.
  if (!isApiRoute && !isLib) checkFetch(masked, rel, findings);

  // CHECK 4 — key existence applies wherever a namespace is declared. lib/ stays framework-free
  // (no next-intl import, CLAUDE.md), so no alias is ever found there and this is a no-op.
  let messages = null;
  try {
    const catalog = path.join(root, "messages", "pt-BR.json");
    if (existsSync(catalog)) messages = JSON.parse(readFileSync(catalog, "utf8"));
  } catch {
    messages = null; // unreadable catalog: skip check 4 rather than misreport
  }
  checkI18nKeys(masked, rel, findings, messages);

  if (findings.length === 0) return 0;

  const blocking = findings.filter((f) => f.severity !== "warning");

  const byCheck = new Map();
  for (const f of findings) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check).push(f);
  }
  const lines = ["CLAUDE.md convention check for " + rel + ":"];
  for (const [check, group] of [...byCheck.entries()].sort()) {
    const allWarnings = group.every((f) => f.severity === "warning");
    lines.push("", "CHECK " + check + (allWarnings ? "  [warning — does not block]" : ""));
    for (const f of group.sort((a, b) => a.line - b.line)) {
      lines.push(`  ${f.rel}:${f.line} — ${f.message}`);
    }
  }
  process.stderr.write(lines.join("\n") + "\n");
  return blocking.length > 0 ? 2 : 0;
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  let code = 0;
  try {
    code = main();
  } catch {
    code = 0; // internal error: fail open, always
  }
  process.exit(code);
}
