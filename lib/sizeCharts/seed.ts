import { SIZE_TABLE, SIZE_TABLE_MALE, Measurements } from "@/lib/measurements";
import type { Gender, SizeChartData } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

const SIZES = ["PP", "P", "M", "G", "GG"];
const BASE_INDEX = 2; // "M"

function deriveProgressionRule(
  table: Record<string, Measurements>,
): Partial<Record<keyof Measurements, number>> {
  const base = table[SIZES[BASE_INDEX]];
  const prev = table[SIZES[BASE_INDEX - 1]];
  const rule: Partial<Record<keyof Measurements, number>> = {};
  for (const key of Object.keys(base) as (keyof Measurements)[]) {
    rule[key] = Math.round((base[key] - prev[key]) * 10) / 10;
  }
  return rule;
}

// Builds the name-free SizeChartData for a system-seeded default, from
// today's static SIZE_TABLE/SIZE_TABLE_MALE. The progression rule is derived
// from the M->P step; any size where that rule doesn't reproduce the
// original table exactly gets a manual override, so
// buildSizeTable(this) === the original table.
//
// #3: split out of buildSystemSizeChartData below so seedPattern
// (lib/editor/state.ts) — the one caller that discards the name entirely —
// can build a chart without a Translate at all, rather than being handed one
// scoped to the wrong catalog namespace (its own `t` resolves PatternData.*,
// not SizeCharts.*, and would log IntlError: MISSING_MESSAGE on every blank
// pattern). Making the name-free shape the base type (Omit, not a "" or null
// sentinel) is what makes that mistake a compile error instead of a silent
// wrong-namespace lookup.
export function buildSystemSizeChart(
  gender: Gender,
): Omit<SizeChartData, "name"> {
  const table = gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE;
  const baseMeasurements = table[SIZES[BASE_INDEX]];
  const progressionRule = deriveProgressionRule(table);
  const overrides: Record<string, Partial<Measurements>> = {};
  for (let idx = 0; idx < SIZES.length; idx++) {
    if (idx === BASE_INDEX) continue;
    const size = SIZES[idx];
    const step = idx - BASE_INDEX;
    const diffs: Partial<Measurements> = {};
    for (const key of Object.keys(baseMeasurements) as (keyof Measurements)[]) {
      const ruleValue =
        baseMeasurements[key] + (progressionRule[key] ?? 0) * step;
      const actual = table[size][key];
      if (Math.abs(ruleValue - actual) > 1e-9) diffs[key] = actual;
    }
    if (Object.keys(diffs).length > 0) overrides[size] = diffs;
  }
  return {
    gender,
    bodyType: "straight",
    isSystem: true,
    sizes: [...SIZES],
    baseSizeIndex: BASE_INDEX,
    baseMeasurements,
    progressionRule,
    overrides,
  };
}

// #133: the female chart used to be named "Feminino adulto · ABNT" — a
// standards-body provenance the app cannot substantiate (the numbers come
// from this file's own legacy SIZE_TABLE, not an ABNT document, and the norm
// it would be citing is flagged cancelled). Both names now resolve from the
// catalog rather than a literal, so a rename never needs a second sweep.
//
// `t` MUST be scoped to the `SizeCharts` namespace — see the comment on
// buildSystemSizeChart above for why that split exists.
export function buildSystemSizeChartData(
  gender: Gender,
  t: Translate,
): SizeChartData {
  return {
    name: t("systemChartName." + gender),
    ...buildSystemSizeChart(gender),
  };
}
