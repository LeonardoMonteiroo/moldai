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
}

// Every Measurements field, in the order the size-chart table renders its rows.
// Exported so the table, the validator and any future consumer iterate one
// list instead of each restating the shape.
export const MEASUREMENT_KEYS: (keyof Measurements)[] = [
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
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
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
