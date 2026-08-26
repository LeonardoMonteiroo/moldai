import {
  MEASUREMENT_KEYS,
  MEASUREMENT_RANGES,
  type Measurements,
} from "@/lib/measurements";
import type { Gender, SizeChartData } from "@/lib/types";
import { buildSystemSizeChart } from "./seed";
import {
  MAX_SIZE_CHART_NAME,
  MAX_SIZE_CHART_SIZES,
  MAX_SIZE_LABEL_LENGTH,
} from "./validate";

/**
 * #12: turns a spreadsheet a modelista already has (an Audaces export, or any
 * atelier's own measurement table) into a candidate SizeChartData, without
 * ever trusting a single cell.
 *
 * Scope decision (see the PR body): **.csv and .tsv only, no .xlsx.** A
 * binary spreadsheet format needs a real parsing dependency (SheetJS), and
 * pulling one in for an MVP import isn't justified when every Audaces export
 * and every atelier's own working table is already plain delimited text.
 * This is a legitimate, honestly-surfaced scope decision, not a silent gap
 * -- ImportSizeChartDialog states the accepted formats before a file is even
 * picked, and an .xlsx upload answers `unsupported_file_type` rather than
 * being silently misread as text.
 *
 * This module stays framework-free like every other lib/sizeCharts module --
 * no DOM access, no next-intl import. It is exercised entirely in the `node`
 * vitest project; ImportSizeChartDialog is the only place that touches
 * File/FileReader.
 *
 * The values this produces are NOT the trust boundary -- they are a
 * candidate for the user to review. `lib/db/sizeChart.ts`'s
 * createSizeChartFromImport re-runs everything through
 * validateSizeChartPatch before it ever reaches a drafter, exactly like a
 * hand-typed PATCH body would (see CLAUDE.md's Size charts section).
 */

export type ImportErrorCode =
  | "unsupported_file_type"
  | "empty_file"
  | "no_sizes_found"
  | "no_measurements_found"
  | "parse_failed";

export type ImportWarningCode =
  | "unmapped_column"
  | "value_out_of_range"
  | "value_not_numeric"
  | "missing_measurement";

export interface ImportWarning {
  code: ImportWarningCode;
  /**
   * `unmapped_column`: the raw column/row header text from the file (data,
   * not display text -- rendered verbatim, the PatternCard.name precedent).
   * Every other code: the MEASUREMENT_KEYS member involved, resolved through
   * the catalog by the caller (SizeChartTable.measurement.* already exists
   * for exactly this key set).
   */
  detail: string;
  /** Present only for a per-cell warning -- the size label the cell belongs to. */
  size?: string;
}

export type ImportResult =
  | { chart: SizeChartData; warnings: ImportWarning[] }
  | { error: ImportErrorCode };

// A pt-BR synonym table, accent- and case-insensitive. Settled in issue #12 --
// not meant to be exhaustive, just the vocabulary an Audaces/atelier table
// actually uses. Longer phrases are listed so `normalize` can match them
// verbatim; a header with extra words around a synonym (e.g. "medida do
// busto") will not match -- the unmatched column is reported and skipped
// rather than guessed at.
const SYNONYMS: Record<string, keyof Measurements> = {
  busto: "bust",
  peito: "bust",
  cintura: "waist",
  quadril: "hip",
  "altura do quadril": "hipHeight",
  "altura de quadril": "hipHeight",
  "comprimento das costas": "backLength",
  costas: "backLength",
  ombro: "shoulder",
  "comprimento da saia": "skirtLength",
  saia: "skirtLength",
  "manga curta": "shortSleeveLength",
  "manga longa": "longSleeveLength",
};

function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function synonymKey(raw: string): keyof Measurements | null {
  return SYNONYMS[normalizeHeader(raw)] ?? null;
}

/**
 * Accepts both "92,5" (pt-BR decimal comma) and "92.5" (dot), plus the
 * full pt-BR thousands+decimal form "1.234,56". Anything else -- blank,
 * "abc", a bare "-" -- is rejected as null rather than coerced: Number("")
 * is 0 and Number("abc") is NaN, and CLAUDE.md records that Math.min/max
 * propagate NaN straight through MEASUREMENT_RANGES.
 */
function parseDecimalCell(raw: string): number | null {
  let s = raw.trim().replace(/[^0-9,.-]/g, "");
  if (s === "" || s === "-") return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function sniffDelimiter(firstLine: string): "," | ";" {
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  return semi > comma ? ";" : ",";
}

/** Quote-aware delimited-text tokenizer (handles `"a; b"`-style quoted cells). */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch === "\r") {
      // swallowed -- the following \n (if any) ends the row
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function transpose(m: string[][]): string[][] {
  const cols = m.reduce((max, r) => Math.max(max, r.length), 0);
  const t: string[][] = [];
  for (let c = 0; c < cols; c++) {
    const row: string[] = [];
    for (let r = 0; r < m.length; r++) row.push(m[r][c] ?? "");
    t.push(row);
  }
  return t;
}

function deriveNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, "").trim();
  return base.slice(0, MAX_SIZE_CHART_NAME);
}

const SUPPORTED_EXTENSIONS = [".csv", ".tsv", ".tab"];

// Guards the hand-written tokenizer/reconstruction against a pathological
// paste (not a real spreadsheet export) locking up the tab -- generous for
// any real measurement table, which is a handful of rows by nine columns.
const MAX_IMPORT_TEXT_LENGTH = 2_000_000;

export function parseSizeChartFile(
  content: string,
  fileName: string,
  gender: Gender,
  baseSizeIndex?: number,
): ImportResult {
  const lower = fileName.toLowerCase();
  const isTsv = lower.endsWith(".tsv") || lower.endsWith(".tab");
  const isSupported = SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!isSupported) return { error: "unsupported_file_type" };

  const stripped = content.replace(/^\uFEFF/, "");
  if (stripped.trim().length === 0) return { error: "empty_file" };
  if (stripped.length > MAX_IMPORT_TEXT_LENGTH)
    return { error: "parse_failed" };

  let matrix: string[][];
  try {
    const firstLine = stripped.split(/\r?\n/, 1)[0] ?? "";
    const delimiter = isTsv ? "\t" : sniffDelimiter(firstLine);
    matrix = parseDelimited(stripped, delimiter)
      .map((row) => row.map((cell) => cell.trim()))
      .filter((row) => row.some((cell) => cell !== ""));
  } catch {
    return { error: "parse_failed" };
  }

  if (matrix.length < 2 || matrix[0].length < 2) {
    return { error: "no_sizes_found" };
  }

  // Orientation: whichever axis's header cells match more synonyms is the
  // measurement axis. Transposing normalizes both orientations onto one code
  // path -- from here on, matrix[0] holds sizes and matrix[i>=1][0] holds a
  // measurement header.
  const headerRowMatches = matrix[0]
    .slice(1)
    .filter((c) => synonymKey(c) !== null).length;
  const firstColMatches = matrix
    .slice(1)
    .filter((r) => synonymKey(r[0] ?? "") !== null).length;
  if (headerRowMatches > firstColMatches) {
    matrix = transpose(matrix);
  }

  const sizesRaw = matrix[0].slice(1);
  const seen = new Set<string>();
  const sizeColumns: { label: string; colIndex: number }[] = [];
  for (let j = 0; j < sizesRaw.length; j++) {
    const label = sizesRaw[j].trim().slice(0, MAX_SIZE_LABEL_LENGTH);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    sizeColumns.push({ label, colIndex: j + 1 });
    if (sizeColumns.length >= MAX_SIZE_CHART_SIZES) break;
  }
  if (sizeColumns.length === 0) return { error: "no_sizes_found" };

  const warnings: ImportWarning[] = [];
  const mappedRows = new Map<keyof Measurements, number>();
  for (let i = 1; i < matrix.length; i++) {
    const rawHeader = (matrix[i][0] ?? "").trim();
    if (!rawHeader) continue;
    const key = synonymKey(rawHeader);
    if (!key) {
      warnings.push({ code: "unmapped_column", detail: rawHeader });
      continue;
    }
    if (!mappedRows.has(key)) mappedRows.set(key, i);
  }
  if (mappedRows.size === 0) return { error: "no_measurements_found" };

  const baseSizeIdx =
    baseSizeIndex !== undefined &&
    Number.isInteger(baseSizeIndex) &&
    baseSizeIndex >= 0 &&
    baseSizeIndex < sizeColumns.length
      ? baseSizeIndex
      : Math.floor((sizeColumns.length - 1) / 2);

  const fallback = buildSystemSizeChart(gender).baseMeasurements;
  const baseMeasurements = {} as Measurements;
  const progressionRule: Partial<Record<keyof Measurements, number>> = {};
  const overrides: Record<string, Partial<Measurements>> = {};

  for (const key of MEASUREMENT_KEYS) {
    const rowIdx = mappedRows.get(key);
    if (rowIdx === undefined) {
      warnings.push({ code: "missing_measurement", detail: key });
      baseMeasurements[key] = fallback[key];
      progressionRule[key] = 0;
      continue;
    }

    const range = MEASUREMENT_RANGES[key];
    const valid: (number | null)[] = sizeColumns.map(({ colIndex, label }) => {
      const raw = (matrix[rowIdx][colIndex] ?? "").trim();
      const parsed = raw === "" ? null : parseDecimalCell(raw);
      if (parsed === null) {
        warnings.push({ code: "value_not_numeric", detail: key, size: label });
        return null;
      }
      if (parsed < range.min || parsed > range.max) {
        warnings.push({ code: "value_out_of_range", detail: key, size: label });
        return null;
      }
      return parsed;
    });

    const validIdx = valid
      .map((v, idx) => (v !== null ? idx : -1))
      .filter((idx) => idx >= 0);

    if (validIdx.length === 0) {
      warnings.push({ code: "missing_measurement", detail: key });
      baseMeasurements[key] = fallback[key];
      progressionRule[key] = 0;
      continue;
    }

    // The two valid points nearest baseSizeIdx set the rule; every other
    // valid cell that doesn't land exactly on that line becomes an
    // override. baseMeasurements[key] is solved for the base INDEX
    // (resolveSizeChartSize always measures step from it), not simply
    // "whichever cell happened to be valid" -- so a missing/invalid base
    // cell still yields a self-consistent chart, at the cost of that one
    // value being a rule-projected estimate rather than a value straight
    // from the file (already flagged by its own per-cell warning above).
    const idxA = validIdx.reduce((best, idx) =>
      Math.abs(idx - baseSizeIdx) < Math.abs(best - baseSizeIdx) ? idx : best,
    );
    let rule = 0;
    if (validIdx.length >= 2) {
      const idxB = validIdx
        .filter((idx) => idx !== idxA)
        .reduce((best, idx) =>
          Math.abs(idx - idxA) < Math.abs(best - idxA) ? idx : best,
        );
      rule =
        Math.round(((valid[idxB]! - valid[idxA]!) / (idxB - idxA)) * 10) / 10;
    }
    const base = valid[idxA]! - rule * (idxA - baseSizeIdx);
    baseMeasurements[key] = base;
    progressionRule[key] = rule;

    for (const idx of validIdx) {
      const predicted = base + rule * (idx - baseSizeIdx);
      if (Math.abs(valid[idx]! - predicted) > 1e-9) {
        const label = sizeColumns[idx].label;
        overrides[label] = { ...overrides[label], [key]: valid[idx]! };
      }
    }
  }

  const chart: SizeChartData = {
    name: deriveNameFromFileName(fileName),
    gender,
    bodyType: "straight",
    isSystem: false,
    sizes: sizeColumns.map((c) => c.label),
    baseSizeIndex: baseSizeIdx,
    baseMeasurements,
    progressionRule,
    overrides,
  };

  return { chart, warnings };
}
