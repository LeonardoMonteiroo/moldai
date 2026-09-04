import { SIZE_TABLE, SIZE_TABLE_MALE, Measurements } from "@/lib/measurements";
import type { Gender, SizeChartData } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

const SIZES = ["PP", "P", "M", "G", "GG"];
const BASE_INDEX = 2; // "M"

// #132: computes the remaining EXTENDED_MEASUREMENT_KEYS for one size row,
// from values SIZE_TABLE/SIZE_TABLE_MALE already carry. #269 promoted four
// of the original eight (neckGirth, bicep, bustPointHeight, bustSpan) to
// CORE -- SIZE_TABLE/SIZE_TABLE_MALE carry real, already-rounded values for
// those directly now (lib/measurements.ts's own comment), so this function
// no longer recomputes them; doing so anyway would risk a floating-point
// mismatch against the hand-rounded table values, not just redundant work.
// `highBust`/`shoulderSlope` reproduce the exact formula the corresponding
// drafter falls back to when the field is absent (lib/draft/body.ts's
// armholeDepthBase/shoulderSlope) -- populating a system chart's
// baseMeasurements with those changes nothing about what it drafts; it only
// makes the field real, visible and editable. `backWidth` and `rise` are
// the two deliberate exceptions, each for its own reason. `backWidth` seeds
// a realistic across-back proportion (bust*0.4, not a value that happens to
// cancel out in body.ts's formula), because the field IS the across-back
// measurement a user is told to go measure
// (SizeChartTable.measurementGuide.backWidth) and body.ts consumes it at
// the armhole curve's own control point, not at halfChest -- an earlier
// version of this function seeded bust/2 specifically so it would be a
// no-op through the OLD (incorrect) wiring, which meant the seeded
// "across-back" value (~46cm at a 92cm bust) had nothing to do with a real
// body's ~36-38cm there. Populating the system chart's backWidth with a
// realistic value is therefore a genuine, intentional geometry change for
// the default account (a more accurate back than the old bust-derived
// guess), not a no-op like highBust/shoulderSlope. `rise` is seeded as a
// real, independently-graded crotch depth (see its own comment below)
// rather than reproducing lib/draft/trousers.ts's own hip-derived fallback
// (hip/4 + 4) -- that fallback exists for a chart that doesn't set rise at
// all (a custom chart predating #128, or one built without it); a system
// chart populating it with a real measured-adjacent value is exactly what
// the field is for, the same reasoning as backWidth's own exception, even
// though the two started from different gaps (backWidth corrected a wrong
// wiring; rise simply had no drafter to reproduce yet).
//
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
  Pick<Measurements, "highBust" | "shoulderSlope" | "backWidth" | "rise">
> {
  const male = gender === "male";
  return {
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
    // body.ts: the back panel's armhole-curve control point reads backWidth
    // (halved, one-side) when present. A common quick-draft rule for
    // across-back is roughly 0.4x bust circumference (matches the
    // ~36-38cm range real tape measurements land in around a 92cm bust) --
    // this is a REAL value, not one chosen to cancel out algebraically the
    // way highBust/shoulderSlope above are (see this function's own
    // top-of-file note).
    backWidth: m.bust * 0.4,
    // #128: lib/draft/trousers.ts reads this now. Graded independently by
    // size -- the same "linear step off the base" shape as
    // skirtLength/hipHeight above -- rather than reproducing trousers.ts's
    // own hip-derived fallback (hip/4 + 4), which exists only for a chart
    // that has no rise of its own at all (see the top-of-file note).
    rise: (male ? 27 : 26) + 0.5 * sizeIndex,
  };
}

// The five SIZE_TABLE/SIZE_TABLE_MALE rows for one gender, each widened with
// extendedMeasurementsFor's four remaining fields -- the table
// buildSystemSizeChart actually reads from, so its progression-rule/
// override derivation below (which already iterates Object.keys of
// whatever it's handed) covers every key without change. Typed
// `Required<Measurements>` (every row genuinely has every field, unlike a
// Measurements row in general) so the arithmetic below reads plain
// `number`s instead of `number | undefined` -- the remaining EXTENDED keys
// are optional on Measurements itself, but not here.
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
