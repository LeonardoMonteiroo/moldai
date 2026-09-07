import type { GarmentSpec, GarmentStyle } from "@/lib/types";

// #252: the eval harness's editing fixtures need to tell "the field the
// instruction asked to change" apart from "a field that moved anyway" --
// collateral drift. This is NOT lib/draft/specAdjustments.ts's
// describeSpecAdjustments: that one diffs a raw (untrusted) tool payload
// against what validateSpec did to it (substituted/clamped, one spec). This
// diffs two already-validated GarmentSpecs against each other (before an
// edit vs. after), which is a different comparison and has no other owner
// in the repo. A leaf module, like specAdjustments.ts and vocabulary.ts: no
// import from garment.ts, no drafting logic.

export type SpecField =
  "type" | "gender" | keyof GarmentStyle | "measurementOverrides";

/** One field whose value differs between `before` and `after`. */
export interface SpecFieldChange {
  field: SpecField;
  before: unknown;
  after: unknown;
}

const STYLE_FIELDS: (keyof GarmentStyle)[] = [
  "neckline",
  "necklineDepthCm",
  "sleeve",
  "skirt",
  "skirtLengthCm",
  "darts",
  "seamAllowanceCm",
  "fit",
  "stretch",
  "armholeDeepenCm",
  "sleeveRefit",
  "collar",
  "cuff",
  "waistband",
  "frontClosure",
  "trouserLengthCm",
  "pleats",
];

function overridesEqual(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Pure field-by-field diff of two validated GarmentSpecs. Returns one entry
 * per field whose value differs -- `measurementOverrides` is reported as one
 * entry (a map, not a scalar) rather than exploded per measurement key, since
 * the eval harness's own fixtures name whole fields, never individual
 * measurement keys, as "expected changed/unchanged".
 */
export function diffSpec(
  before: GarmentSpec,
  after: GarmentSpec,
): SpecFieldChange[] {
  const out: SpecFieldChange[] = [];
  if (before.type !== after.type) {
    out.push({ field: "type", before: before.type, after: after.type });
  }
  if (before.gender !== after.gender) {
    out.push({ field: "gender", before: before.gender, after: after.gender });
  }
  if (
    !overridesEqual(before.measurementOverrides, after.measurementOverrides)
  ) {
    out.push({
      field: "measurementOverrides",
      before: before.measurementOverrides,
      after: after.measurementOverrides,
    });
  }
  for (const field of STYLE_FIELDS) {
    const b = before.style[field];
    const a = after.style[field];
    if (b !== a) out.push({ field, before: b, after: a });
  }
  return out;
}
