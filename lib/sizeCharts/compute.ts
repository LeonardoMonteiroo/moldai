import { MEASUREMENT_RANGES, Measurements } from "@/lib/measurements";
import type { Gender, SizeChartData, SizeChartRecord } from "@/lib/types";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Resolves one size's Measurements from a size chart: base row + progression
// rule scaled by the size's distance from the base column, with any manual
// per-cell override winning outright, then clamped to MEASUREMENT_RANGES.
export function resolveSizeChartSize(
  sizeChart: SizeChartData,
  size: string,
): Measurements {
  const idx = sizeChart.sizes.indexOf(size);
  const step = idx === -1 ? 0 : idx - sizeChart.baseSizeIndex;
  const override = sizeChart.overrides[size] ?? {};
  const result = {} as Measurements;
  for (const key of Object.keys(
    sizeChart.baseMeasurements,
  ) as (keyof Measurements)[]) {
    const ruleValue =
      sizeChart.baseMeasurements[key] +
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
  sizeChart: SizeChartData,
): Record<string, Measurements> {
  const table: Record<string, Measurements> = {};
  for (const size of sizeChart.sizes)
    table[size] = resolveSizeChartSize(sizeChart, size);
  return table;
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
): SizeChartRecord {
  const active = charts.find((c) => c.id === activeSizeChartId);
  if (active && active.gender === gender) return active;
  const systemMatch = charts.find((c) => c.isSystem && c.gender === gender);
  return systemMatch ?? active ?? charts[0];
}
