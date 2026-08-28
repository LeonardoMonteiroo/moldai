// A hand-written reader for the ANSI/AAMA "grade rule table" (.RUL)
// companion file that routinely ships alongside an AAMA/ASTM DXF pattern
// export (Gerber AccuMark, Optitex, CLO3D and Molde.me all write this
// pairing) — see issue #231's research comment on #212 for the corroborating
// sources. A bare DXF import (lib/import/dxf.ts) has no way to recover the
// grading deltas this file carries.
//
// The format is plain ASCII: "KEY: VALUE" header lines (AUTHOR, GRADE RULE
// TABLE, CREATION DATE/TIME, UNITS, ANSI/AAMA VERSION, SIZE LIST, SAMPLE
// SIZE, PRODUCT) followed by one "RULE: DELTA <n> <dx>,<dy> <dx>,<dy> ..."
// line per graded point — one [dx, dy] pair per entry in SIZE LIST, in that
// same order, with the sample/base size's own pair always [0, 0].
//
// That shape is corroborated by multiple independent secondary sources
// (industry file-format references and grading-software documentation), but
// — like lib/export/dxf-aama.ts's own AAMA writer — it has never been
// checked against a real vendor-exported .RUL file. This stays a "beta"
// companion parser for exactly that reason: it never throws, caps input
// size, and a line it cannot recognise is counted rather than guessed at
// (`unrecognizedLines`), the same drop-don't-persist trust boundary
// `parseDxf`/`validateSizeChartPatch` document elsewhere.
//
// `NUMBER OF SIZES` is read off the file but never trusted over the actual
// `SIZE LIST` length — the same "no second rank table" rule
// `isPlanUpgrade` documents for plan tiers, applied here to a redundant
// count that could disagree with the list it's supposed to describe.

import type { ImportCheck, RulSummary } from "./types";

export interface RulRule {
  ruleNumber: number;
  /** One [dx, dy] delta per `RulDocument.sizeList` entry, same order, raw file units. */
  deltas: [number, number][];
}

export interface RulDocument {
  author: string | null;
  product: string | null;
  tableId: string | null;
  creationDate: string | null;
  creationTime: string | null;
  version: string | null;
  units: "metric" | "english" | null;
  sizeList: string[];
  sampleSize: string | null;
  rules: RulRule[];
  /** Lines that matched neither a header "KEY: VALUE" pair nor a "RULE: DELTA" line. */
  unrecognizedLines: number;
  /** True if any defensive cap below (file size/rule count/deltas-per-rule) discarded data. */
  truncated: boolean;
}

// Defensive caps — an uploaded file is untrusted input, exactly like an
// uploaded DXF. These bound both the work a malformed/hostile file can force
// and the memory a legitimate but enormous one can consume.
export const MAX_RUL_CHARS = 2_000_000; // ~2 MB of text
export const MAX_RULES = 2_000;
export const MAX_DELTAS_PER_RULE = 200;

function emptyDocument(): RulDocument {
  return {
    author: null,
    product: null,
    tableId: null,
    creationDate: null,
    creationTime: null,
    version: null,
    units: null,
    sizeList: [],
    sampleSize: null,
    rules: [],
    unrecognizedLines: 0,
    truncated: false,
  };
}

const DELTA_PAIR_RE = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;

/** Parses a "RULE: DELTA <n> <dx>,<dy> <dx>,<dy> ..." line's remainder (after "RULE:"). */
function parseRuleLine(
  rest: string,
): {
  ruleNumber: number;
  deltas: [number, number][];
  truncated: boolean;
} | null {
  if (!rest.toUpperCase().startsWith("DELTA")) return null;
  const afterDelta = rest.slice(5).trim();
  const match = afterDelta.match(/^(-?\d+)\s*(.*)$/);
  if (!match) return null;
  const ruleNumber = Number(match[1]);
  if (!Number.isFinite(ruleNumber)) return null;

  // Truncated only when a real (cap+1)th pair was actually found — not
  // merely when the line happens to carry exactly `cap` pairs and nothing
  // more (the same distinction dxf.ts's `collectXY` documents).
  const deltas: [number, number][] = [];
  let pair: RegExpExecArray | null;
  let truncated = false;
  DELTA_PAIR_RE.lastIndex = 0;
  while ((pair = DELTA_PAIR_RE.exec(match[2]))) {
    if (deltas.length >= MAX_DELTAS_PER_RULE) {
      truncated = true;
      break;
    }
    deltas.push([Number(pair[1]), Number(pair[2])]);
  }
  if (deltas.length === 0) return null;
  return { ruleNumber, deltas, truncated };
}

function parseUnits(value: string): "metric" | "english" | null {
  const upper = value.toUpperCase();
  if (upper.startsWith("METRIC")) return "metric";
  if (upper.startsWith("ENGLISH")) return "english";
  return null;
}

export function parseRul(text: string): RulDocument {
  if (typeof text !== "string" || text.length === 0) return emptyDocument();

  const source =
    text.length > MAX_RUL_CHARS ? text.slice(0, MAX_RUL_CHARS) : text;
  let truncated = source.length !== text.length;

  const doc = emptyDocument();
  let unrecognizedLines = 0;

  for (const rawLine of source.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      unrecognizedLines++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim().toUpperCase();
    const rest = line.slice(colonIdx + 1).trim();

    if (key === "RULE") {
      const parsed = parseRuleLine(rest);
      if (!parsed) {
        unrecognizedLines++;
        continue;
      }
      if (parsed.truncated) truncated = true;
      if (doc.rules.length >= MAX_RULES) {
        truncated = true;
        continue;
      }
      doc.rules.push({ ruleNumber: parsed.ruleNumber, deltas: parsed.deltas });
      continue;
    }

    switch (key) {
      case "AUTHOR":
        doc.author = rest || null;
        break;
      case "PRODUCT":
        doc.product = rest || null;
        break;
      case "GRADE RULE TABLE":
        doc.tableId = rest || null;
        break;
      case "CREATION DATE":
        doc.creationDate = rest || null;
        break;
      case "CREATION TIME":
        doc.creationTime = rest || null;
        break;
      case "ANSI/AAMA VERSION":
        doc.version = rest || null;
        break;
      case "UNITS":
        doc.units = parseUnits(rest);
        break;
      case "SIZE LIST":
        doc.sizeList = rest.split(/\s+/).filter(Boolean);
        break;
      case "SAMPLE SIZE":
        doc.sampleSize = rest || null;
        break;
      case "NUMBER OF SIZES":
        // Deliberately not trusted — see the module doc above.
        break;
      default:
        unrecognizedLines++;
        break;
    }
  }

  doc.unrecognizedLines = unrecognizedLines;
  doc.truncated = truncated;
  return doc;
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").toLowerCase();
}

/**
 * document → the wire-shaped `RulSummary` (lib/import/types.ts), machine
 * readable and never prose — every check carries a code the screen resolves
 * as `t("checks." + code, values)`, the same `analyzeDxf` contract.
 * `dxfFileName` is the currently-loaded DXF's own name, used only to flag a
 * companion whose base filename doesn't match — a warning, not a rejection,
 * since a renamed pair is still usable.
 */
export function analyzeRul(
  doc: RulDocument,
  rulFileName: string,
  dxfFileName: string | null,
): RulSummary {
  const checks: ImportCheck[] = [];

  checks.push(
    doc.rules.length > 0
      ? { code: "rulLoaded", level: "ok", values: { count: doc.rules.length } }
      : { code: "rulNoRulesFound", level: "warning" },
  );

  if (doc.units === null) {
    checks.push({ code: "rulUnitsUnknown", level: "warning" });
  }

  if (doc.unrecognizedLines > 0 && doc.rules.length > 0) {
    checks.push({
      code: "rulUnrecognizedLines",
      level: "warning",
      values: { lines: doc.unrecognizedLines },
    });
  }

  if (doc.truncated) {
    checks.push({ code: "rulFileTruncated", level: "warning" });
  }

  if (dxfFileName && baseName(dxfFileName) !== baseName(rulFileName)) {
    checks.push({
      code: "rulNameMismatch",
      level: "warning",
      values: { dxfName: dxfFileName, rulName: rulFileName },
    });
  }

  return {
    fileName: rulFileName,
    tableId: doc.tableId,
    product: doc.product,
    author: doc.author,
    units: doc.units,
    sizeList: doc.sizeList,
    sampleSize: doc.sampleSize,
    ruleCount: doc.rules.length,
    checks,
  };
}
