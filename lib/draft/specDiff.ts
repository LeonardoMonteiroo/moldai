import type { GarmentSpec, GarmentStyle } from "@/lib/types";

// #252: the eval harness's editing fixtures need to tell "the field the
// instruction asked to change" apart from "a field that moved anyway" --
// collateral drift. This is NOT lib/draft/specAdjustments.ts's
// describeSpecAdjustments: that one diffs a raw (untrusted) tool payload
// against what validateSpec did to it (substituted/clamped, one spec). This
// diffs two already-validated GarmentSpecs against each other (before an
// edit vs. after), which is a different comparison. A leaf module, like
// specAdjustments.ts and vocabulary.ts: no import from garment.ts, no
// drafting logic.
//
// #257: this IS the field-by-field comparison lib/editor/state.ts's own
// diffSpec(prev, next): string[] wraps -- that one reshapes SpecFieldChange[]
// into the chat-facing "type" | "gender" | "style.<key>" |
// "measurementOverrides.<key>" path strings ChatBubble resolves through the
// pt-BR catalog. STYLE_FIELDS below is the one place a new GarmentStyle
// field must be added for BOTH consumers to see it change -- do not add a
// second copy of this list anywhere else.

export type SpecField =
  "type" | "gender" | keyof GarmentStyle | "measurementOverrides";

/** One field whose value differs between `before` and `after`. */
export interface SpecFieldChange {
  field: SpecField;
  before: unknown;
  after: unknown;
}

// #279: route.ts's engineStyleUnsupported/specAdjusted turn-scoping now
// depends on this list actually covering every GarmentStyle key -- a
// forgotten one would silently and permanently suppress both notices for
// that field. `STYLE_FIELD_MAP`'s mapped type requires (and forbids extra)
// every GarmentStyle key, so a field added to GarmentStyle without being
// added here is a compile error here, not a silent gap; the display/diff
// order (unaffected by this) is still the object literal's own key order.
const STYLE_FIELD_MAP: Record<keyof GarmentStyle, true> = {
  neckline: true,
  necklineDepthCm: true,
  sleeve: true,
  skirt: true,
  skirtLengthCm: true,
  darts: true,
  seamAllowanceCm: true,
  fit: true,
  stretch: true,
  armholeDeepenCm: true,
  sleeveRefit: true,
  collar: true,
  cuff: true,
  waistband: true,
  frontClosure: true,
  trouserLengthCm: true,
  pleats: true,
  riseCm: true,
};
const STYLE_FIELDS = Object.keys(STYLE_FIELD_MAP) as (keyof GarmentStyle)[];

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
