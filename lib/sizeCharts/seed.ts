import { SIZE_TABLE, SIZE_TABLE_MALE, Measurements } from "@/lib/measurements";
import type { Gender, SizeChartData } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

const SIZES = ["PP", "P", "M", "G", "GG"];
const BASE_INDEX = 2; // "M"

// #132: computes the six EXTENDED_MEASUREMENT_KEYS for one size row, from
// values SIZE_TABLE/SIZE_TABLE_MALE already carry, using the exact formulas
// the drafters fall back to when a field is absent (lib/draft/body.ts's
// neckHalf/armholeDepthBase/halfChest, lib/draft/sleeve.ts's bicep) — so
// populating a system chart's baseMeasurements with these changes nothing
// about what it drafts; it only makes the field real, visible and editable.
// Deliberately computed here rather than baked into SIZE_TABLE itself: that
// constant is spread-and-overridden directly by several tests (varying just
// `bust` to see geometry respond), and a fixed extended value living
// alongside would go stale — un-scaled — the moment such a test changes
// bust on its own.
function extendedMeasurementsFor(
  m: Measurements,
  gender: Gender,
  sizeIndex: number,
): Required<
  Pick<
    Measurements,
    "neckGirth" | "highBust" | "shoulderSlope" | "backWidth" | "bicep" | "rise"
  >
> {
  const male = gender === "male";
  return {
    // body.ts: neckHalf = neckGirth/6 + offset. The offset is applied
    // outside neckGirth either way (present or absent), so neckGirth/6 ==
    // bust/14 for ANY offset -- neckGirth itself doesn't need to vary by
    // gender.
    neckGirth: (m.bust * 3) / 7,
    // body.ts: armholeDepthBase reads (highBust ?? bust)/8 + offset. The
    // legacy tables never modelled a cup difference from bust, so "no
    // assumption" -- highBust === bust -- is the honest default; a user who
    // knows their real high-bust measurement can override it per size.
    highBust: m.bust,
    // body.ts: a flat per-gender constant (4.0 female / 4.5 male),
    // independent of size -- a shoulder slope is a frame characteristic,
    // not a girth that scales with bust, so it is NOT graded across sizes
    // here (see seed.test.ts's own note on why this field's progression is
    // legitimately 0, unlike every other measurement).
    shoulderSlope: male ? 4.5 : 4.0,
    // body.ts: halfChest (back panel) reads (backWidth ?? bust... )/... such
    // that backWidth/2 + ease == bust/4 + ease for any ease value (the ease
    // term cancels) -- backWidth = bust/2 reproduces the front/back
    // symmetric width the fallback formula draws today.
    backWidth: m.bust / 2,
    // sleeve.ts's existing BICEP_PROPORTION_OF_BUST.
    bicep: m.bust * 0.3,
    // No drafter reads this yet (#128 will) -- graded independently by
    // size, the same "linear step off the base" shape as
    // skirtLength/hipHeight above, since there's no proportion to
    // reproduce.
    rise: (male ? 27 : 26) + 0.5 * sizeIndex,
  };
}

// The five SIZE_TABLE/SIZE_TABLE_MALE rows for one gender, each widened with
// extendedMeasurementsFor's six fields -- the table buildSystemSizeChart
// actually reads from, so its progression-rule/override derivation below
// (which already iterates Object.keys of whatever it's handed) covers all
// fifteen keys without change. Typed `Required<Measurements>` (every row
// genuinely has every field, unlike a Measurements row in general) so the
// arithmetic below reads plain `number`s instead of `number | undefined` --
// the EXTENDED keys are optional on Measurements itself, but not here.
function extendedTable(gender: Gender): Record<string, Required<Measurements>> {
  const raw: Record<string, Measurements> =
    gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE;
  const table: Record<string, Required<Measurements>> = {};
  SIZES.forEach((size, idx) => {
    table[size] = {
      ...raw[size],
      ...extendedMeasurementsFor(raw[size], gender, idx),
    };
  });
  return table;
}

function deriveProgressionRule(
  table: Record<string, Required<Measurements>>,
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
  const table = extendedTable(gender);
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
