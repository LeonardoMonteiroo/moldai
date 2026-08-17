import { SizeLabel, Gender } from "./types";

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

export const SIZE_TABLE: Record<SizeLabel, Measurements> = {
  PP: {
    bust: 84,
    waist: 66,
    hip: 92,
    hipHeight: 20.0,
    backLength: 40.0,
    shoulder: 17.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  P: {
    bust: 88,
    waist: 70,
    hip: 96,
    hipHeight: 20.3,
    backLength: 40.5,
    shoulder: 18.0,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
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
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  GG: {
    bust: 100,
    waist: 82,
    hip: 108,
    hipHeight: 21.3,
    backLength: 42.0,
    shoulder: 19.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
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
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
  },
  P: {
    bust: 96,
    waist: 84,
    hip: 96,
    hipHeight: 21.3,
    backLength: 43.5,
    shoulder: 21.5,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
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
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
  },
  GG: {
    bust: 108,
    waist: 96,
    hip: 108,
    hipHeight: 22.3,
    backLength: 45.0,
    shoulder: 23.0,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
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

export function resolveMeasurements(
  size: SizeLabel,
  overrides: Partial<Measurements>,
  gender: Gender = "female",
): Measurements {
  const base = { ...(gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE)[size] };
  for (const k of Object.keys(overrides) as (keyof Measurements)[]) {
    const v = overrides[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const r = MEASUREMENT_RANGES[k];
      base[k] = clamp(v, r.min, r.max);
    }
  }
  return base;
}
