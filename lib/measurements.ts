import { SizeLabel } from "./types";

export interface Measurements {
  bust: number; // bust circumference (cm)
  waist: number; // waist circumference (cm)
  hip: number; // hip circumference (cm)
  hipHeight: number; // waist → hip (cm)
  backLength: number; // nape → waist (cm)
  shoulder: number; // width of one shoulder (cm)
  skirtLength: number; // default skirt length (cm)
  shortSleeveLength: number; // (cm)
  longSleeveLength: number; // (cm)
  // #132: widened vocabulary beyond the original nine proportional keys —
  // each of these is optional because a size chart may not set it, and
  // every drafter that reads one falls back to today's hardcoded proportion
  // (documented at each call site in lib/draft/body.ts/sleeve.ts) when it's
  // absent. That's what keeps an existing chart or a pattern's already-frozen
  // sizeTable snapshot (which predates these fields and will never have
  // them) drafting byte-identically forever, while a chart that DOES set one
  // — a duplicated/edited system chart, an imported spreadsheet, or an AI
  // measurementOverride — gets real, personalized geometry instead of the
  // proportion.
  neckGirth?: number; // neck circumference, at the base where a collar sits (cm)
  highBust?: number; // chest circumference above the bust, below the armpits (cm) — see #132's "cup size" decision below
  shoulderSlope?: number; // vertical drop from the neck/top edge to the shoulder tip (cm) — a real body proportion, not an angle
  backWidth?: number; // across-back width, armhole to armhole (cm)
  bicep?: number; // upper-arm circumference, at its widest point (cm)
  rise?: number; // trouser rise: waist to crotch seam (cm) — no drafter reads this yet (see #128), added here so a chart can already carry it
}

// Every Measurements field, in the order the size-chart table renders its
// rows. Exported so the table, the validator and any future consumer
// iterate one list instead of each restating the shape.
//
// Split into CORE (the original nine, always required on a resolved
// Measurements row — see assertResolvedMeasurements) and EXTENDED (#132's
// six additions, optional everywhere: a Measurements value, a SizeChartData
// row, a Pattern's frozen sizeTable, all of it). MEASUREMENT_KEYS itself
// stays the single flat list every screen/validator/schema iterates — the
// CORE/EXTENDED split exists only for the few places (this file's own
// runtime guard, lib/schemas/measurements.ts's Zod schema) that need to
// know which keys a legacy row is allowed to omit.
export const CORE_MEASUREMENT_KEYS: (keyof Measurements)[] = [
  "bust",
  "waist",
  "hip",
  "hipHeight",
  "backLength",
  "shoulder",
  "skirtLength",
  "shortSleeveLength",
  "longSleeveLength",
];

export const EXTENDED_MEASUREMENT_KEYS: (keyof Measurements)[] = [
  "neckGirth",
  "highBust",
  "shoulderSlope",
  "backWidth",
  "bicep",
  "rise",
];

export const MEASUREMENT_KEYS: (keyof Measurements)[] = [
  ...CORE_MEASUREMENT_KEYS,
  ...EXTENDED_MEASUREMENT_KEYS,
];

// #118: skirtLength/shortSleeveLength/longSleeveLength used to be held
// constant across every size, so a GG garment got the exact same hemline and
// sleeve as a PP one. Both correlate with stature the same way backLength
// and hipHeight already do, so they now step linearly from the base (M) by
// the same kind of per-size increment, not derived from any single
// standard — chosen so a longer body segment gets more absolute growth per
// size than a shorter one, same relationship as backLength (0.5) vs.
// hipHeight (0.3): skirtLength +2.0 cm/size (full-length hem drop tracks
// stature the most directly of the three), longSleeveLength +1.5 cm/size
// (an arm segment, so less than the skirt), shortSleeveLength +0.5 cm/size
// (the same arm, but a much shorter cut of it, so it grows proportionally
// less in absolute cm). Both genders share these increments, matching how
// every other row here already uses identical steps for female and male
// and differs only in the base values.
//
// #132: SIZE_TABLE/SIZE_TABLE_MALE deliberately stay exactly the original
// nine fields — no EXTENDED_MEASUREMENT_KEYS added here. Both constants are
// spread-and-overridden directly by several existing call sites (tests that
// build a one-off Measurements row via `{...SIZE_TABLE.M, bust: X}` to see
// geometry respond to a single changed field, e.g.
// components/editor/Proof3DTab.test.tsx and garment.test.ts's #82 repro) —
// baking a FIXED extended value (a bicep, a backWidth) into this table would
// leave it stale and un-scaled whenever such a call site varies bust on its
// own, silently reintroducing the exact kind of inconsistent-measurements
// bug this issue exists to prevent. The two seeded system charts populate
// the six new fields instead (lib/sizeCharts/seed.ts's buildSystemSizeChart
// derives them from each size's own row here, using today's formulas, before
// this table is ever consulted) — that derivation lives beside the seeding
// logic it's only ever used by, not on this shared, widely-spread constant.
export const SIZE_TABLE: Record<SizeLabel, Measurements> = {
  PP: {
    bust: 84,
    waist: 66,
    hip: 92,
    hipHeight: 20.0,
    backLength: 40.0,
    shoulder: 17.5,
    skirtLength: 56,
    shortSleeveLength: 17,
    longSleeveLength: 55,
  },
  P: {
    bust: 88,
    waist: 70,
    hip: 96,
    hipHeight: 20.3,
    backLength: 40.5,
    shoulder: 18.0,
    skirtLength: 58,
    shortSleeveLength: 17.5,
    longSleeveLength: 56.5,
  },
  M: {
    bust: 92,
    waist: 74,
    hip: 100,
    hipHeight: 20.6,
    backLength: 41.0,
    shoulder: 18.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  G: {
    bust: 96,
    waist: 78,
    hip: 104,
    hipHeight: 21.0,
    backLength: 41.5,
    shoulder: 19.0,
    skirtLength: 62,
    shortSleeveLength: 18.5,
    longSleeveLength: 59.5,
  },
  GG: {
    bust: 100,
    waist: 82,
    hip: 108,
    hipHeight: 21.3,
    backLength: 42.0,
    shoulder: 19.5,
    skirtLength: 64,
    shortSleeveLength: 19,
    longSleeveLength: 61,
  },
};

export const SIZE_TABLE_MALE: Record<SizeLabel, Measurements> = {
  PP: {
    bust: 92,
    waist: 80,
    hip: 92,
    hipHeight: 21.0,
    backLength: 43.0,
    shoulder: 21.0,
    skirtLength: 56,
    shortSleeveLength: 21,
    longSleeveLength: 59,
  },
  P: {
    bust: 96,
    waist: 84,
    hip: 96,
    hipHeight: 21.3,
    backLength: 43.5,
    shoulder: 21.5,
    skirtLength: 58,
    shortSleeveLength: 21.5,
    longSleeveLength: 60.5,
  },
  M: {
    bust: 100,
    waist: 88,
    hip: 100,
    hipHeight: 21.6,
    backLength: 44.0,
    shoulder: 22.0,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
  },
  G: {
    bust: 104,
    waist: 92,
    hip: 104,
    hipHeight: 22.0,
    backLength: 44.5,
    shoulder: 22.5,
    skirtLength: 62,
    shortSleeveLength: 22.5,
    longSleeveLength: 63.5,
  },
  GG: {
    bust: 108,
    waist: 96,
    hip: 108,
    hipHeight: 22.3,
    backLength: 45.0,
    shoulder: 23.0,
    skirtLength: 64,
    shortSleeveLength: 23,
    longSleeveLength: 65,
  },
};

export const MEASUREMENT_RANGES: Record<
  keyof Measurements,
  { min: number; max: number }
> = {
  bust: { min: 70, max: 140 },
  waist: { min: 55, max: 130 },
  hip: { min: 78, max: 150 },
  hipHeight: { min: 15, max: 28 },
  backLength: { min: 34, max: 50 },
  shoulder: { min: 14, max: 26 },
  skirtLength: { min: 25, max: 120 },
  shortSleeveLength: { min: 8, max: 35 },
  longSleeveLength: { min: 40, max: 70 },
  neckGirth: { min: 28, max: 48 },
  highBust: { min: 65, max: 135 },
  shoulderSlope: { min: 2, max: 7 },
  backWidth: { min: 26, max: 46 },
  bicep: { min: 18, max: 45 },
  rise: { min: 20, max: 36 },
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// #140: draftAll (lib/draft/garment.ts) calls this first, so it's the one
// choke point every drafted garment's base row passes through -- an
// incomplete/missing-field row (e.g. a corrupted `Pattern.sizeTable[size]`)
// used to sail through as `undefined`s, which the drafters' arithmetic turns
// into NaN outline coordinates. NaN comparisons are always false, so
// lib/export/bezier.ts's flattenCubic never meets its tolerance check and
// recurses to MAX_DEPTH on every curved span (65536 points each), which then
// feeds lib/export/offset.ts's O(n²) removeSelfCrossingLoops -- not a true
// infinite loop, but a combinatorial blowup indistinguishable from one
// (measured: 95+ seconds of spinning CPU before a forced kill). Failing fast
// here, before any geometry is touched, is cheaper than bounding every
// downstream loop against non-finite input individually.
//
// #132: only CORE_MEASUREMENT_KEYS are required to be present -- an
// EXTENDED key is allowed to be missing entirely (that's the fallback path
// every drafter reading one implements), but if it IS present it still has
// to be finite, for the same NaN-propagation reason as a core field.
function assertResolvedMeasurements(base: Measurements): void {
  const invalidCore = CORE_MEASUREMENT_KEYS.filter(
    (k) => !Number.isFinite(base[k]),
  );
  const invalidExtended = EXTENDED_MEASUREMENT_KEYS.filter(
    (k) => base[k] !== undefined && !Number.isFinite(base[k]),
  );
  const invalid = [...invalidCore, ...invalidExtended];
  if (invalid.length > 0) {
    throw new Error(
      `resolveMeasurements: base row is missing or has non-finite field(s): ${invalid.join(", ")}`,
    );
  }
}

// Applies chat-driven overrides on top of an already-resolved base row (from
// a size chart's sizeTable — see lib/sizeCharts/compute.ts's
// resolveSizeChartSize) and clamps to MEASUREMENT_RANGES. No longer does a
// size/gender table lookup itself — that responsibility moved to the size
// chart layer.
export function resolveMeasurements(
  base: Measurements,
  overrides: Partial<Measurements>,
): Measurements {
  assertResolvedMeasurements(base);
  const result = { ...base };
  for (const k of Object.keys(overrides) as (keyof Measurements)[]) {
    const v = overrides[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const r = MEASUREMENT_RANGES[k];
      result[k] = clamp(v, r.min, r.max);
    }
  }
  return result;
}
