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

// #326: does a resolved size table actually vary a given measurement across
// its own sizes? Reads the already-resolved `sizeTable` (a pattern's own
// frozen snapshot, buildSizeTable's own return shape) rather than
// `progressionRule` directly, which is what lets one check cover every
// reason a measurement might fail to grade without needing to know which
// applies: a chart persisted before that measurement was promoted to CORE
// (the #269 backfill only ever wrote baseMeasurements, never
// progressionRule -- scripts/backfill-freesewing-measurements.ts), an
// imported chart (lib/sizeCharts/import.ts's unmapped-column branch writes
// an explicit flat `progressionRule[key] = 0`), a chart whose PATCH body
// dropped the rule for this key (validateSizeChartPatch replaces
// progressionRule wholesale rather than merging it, lib/sizeCharts/
// validate.ts), or simply a chart with only one size. Used to surface
// trousers' own length-grading limitation (lib/draft/trousers.ts) rather
// than let it degrade silently -- see the generate route's own
// chat.trouserLengthNotGraded notice.
export function measurementGradesAcrossSizes(
  sizeTable: Record<string, Measurements>,
  key: keyof Measurements,
): boolean {
  const values = Object.values(sizeTable)
    .map((row) => row[key])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (values.length < 2) return false;
  return values.some((v) => Math.abs(v - values[0]) > 1e-6);
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

// Picks which size chart a NEW generation should draft from: the chart the
// request itself named, else the account's active chart if its gender
// matches the spec being drafted, else the system default for that gender.
// `charts` must contain at least one system chart per gender (guaranteed by
// lib/db/sizeChart.ts's ensureSystemSizeCharts) or this degrades to the
// active chart (if any) or the first chart in the list.
export function pickSizeChartForGeneration(
  charts: SizeChartRecord[],
  activeSizeChartId: string | null,
  gender: Gender,
  requestedId?: string | null,
): SizeChartChoice {
  // A per-molde choice wins outright, and its gender is not re-checked: the
  // drafted spec's gender comes FROM this chart (see the generate route), so
  // there is no mismatch left to fall back over. rejectedActive is null
  // because nothing was passed over silently -- the substitution notice
  // exists to report a chart the account chose and generation could not use,
  // and naming the active chart here would report a substitution the user
  // made deliberately.
  //
  // An id naming no chart in the list falls through to every branch below
  // unchanged. That is also what makes the deleted-between-check-and-lock
  // race resolve to today's safe behavior rather than an error.
  if (requestedId) {
    const requested = charts.find((c) => c.id === requestedId);
    if (requested) return { chart: requested, rejectedActive: null };
  }
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
