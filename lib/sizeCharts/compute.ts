import { MEASUREMENT_RANGES, Measurements } from "@/lib/measurements";
import type { Gender, SizeChartData, SizeChartRecord } from "@/lib/types";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Resolves one size's Measurements from a size chart: base row + progression
// rule scaled by the size's distance from the base column, with any manual
// per-cell override winning outright, then clamped to MEASUREMENT_RANGES.
//
// #3: widened from SizeChartData to Omit<SizeChartData, "name"> -- neither
// this nor buildSizeTable below ever reads `name`, and the widening lets
// lib/sizeCharts/seed.ts's name-free buildSystemSizeChart feed straight into
// this without a placeholder name. Every existing caller passing a full
// SizeChartData/SizeChartRecord still type-checks (a wider parameter type
// accepts the narrower value).
export function resolveSizeChartSize(
  sizeChart: Omit<SizeChartData, "name">,
  size: string,
): Measurements {
  const idx = sizeChart.sizes.indexOf(size);
  const step = idx === -1 ? 0 : idx - sizeChart.baseSizeIndex;
  const override = sizeChart.overrides[size] ?? {};
  const result = {} as Measurements;
  for (const key of Object.keys(
    sizeChart.baseMeasurements,
  ) as (keyof Measurements)[]) {
    // Non-null: `key` came from Object.keys(sizeChart.baseMeasurements)
    // itself, so its value is present by construction -- generic `keyof
    // Measurements` indexing only sees `number | undefined` because SOME
    // measurement keys are optional on the type, not because this specific
    // one might be missing at runtime.
    const ruleValue =
      sizeChart.baseMeasurements[key]! +
      (sizeChart.progressionRule[key] ?? 0) * step;
    const value = override[key] ?? ruleValue;
    const range = MEASUREMENT_RANGES[key];
    result[key] = clamp(value, range.min, range.max);
  }
  return result;
}

// Every size in the chart, fully resolved — frozen onto a Pattern at first
// generation (lib/editor/state.ts's seedPatternSizeSnapshot).
export function buildSizeTable(
  sizeChart: Omit<SizeChartData, "name">,
): Record<string, Measurements> {
  const table: Record<string, Measurements> = {};
  for (const size of sizeChart.sizes)
    table[size] = resolveSizeChartSize(sizeChart, size);
  return table;
}

export interface SizeChartChoice {
  chart: SizeChartRecord;
  /**
   * The account's active chart, when generation could not use it (its gender
   * does not match the garment) and fell back to another. Null whenever the
   * active chart WAS used, or the account has none.
   *
   * Returned rather than discarded so the substitution can be said out loud:
   * it used to happen silently, leaving the user looking at a pattern drafted
   * from measurements they had not chosen, with /size-charts still showing
   * their chart as active.
   */
  rejectedActive: SizeChartRecord | null;
}

// Picks which size chart a NEW generation should draft from: the account's
// active chart if its gender matches the spec being drafted, else the system
// default for that gender. `charts` must contain at least one system chart
// per gender (guaranteed by lib/db/sizeChart.ts's ensureSystemSizeCharts) or
// this degrades to the active chart (if any) or the first chart in the list.
export function pickSizeChartForGeneration(
  charts: SizeChartRecord[],
  activeSizeChartId: string | null,
  gender: Gender,
): SizeChartChoice {
  const active = charts.find((c) => c.id === activeSizeChartId) ?? null;
  if (active && active.gender === gender) {
    return { chart: active, rejectedActive: null };
  }
  const systemMatch = charts.find((c) => c.isSystem && c.gender === gender);
  const chart = systemMatch ?? active ?? charts[0];
  // Only a chart that was actually passed over counts as rejected -- the
  // degenerate fallbacks can land back on `active` itself.
  return {
    chart,
    rejectedActive: active && chart.id !== active.id ? active : null,
  };
}
