import {
  MEASUREMENT_KEYS,
  MEASUREMENT_RANGES,
  type Measurements,
} from "@/lib/measurements";
import { BODY_TYPES, type SizeChartData } from "@/lib/types";
import { GENDERS } from "@/lib/draft/garment";

export const MAX_SIZE_CHART_NAME = 80;
/** Generous bound on a per-size-step cm delta — a guard, not a design rule. */
const MAX_PROGRESSION_STEP = 20;
// #97: generous for PP..GG plus numeric ranges (e.g. 34..54), but bounded --
// the resolved sizeTable is frozen into every pattern's blob and then
// JSON.stringify'd into the AI system prompt on *every* subsequent
// generation for that pattern, so an unbounded list is both an unbounded
// per-call Anthropic cost and, past the model's context window, a
// permanently unusable pattern (proposeGarment throws forever).
export const MAX_SIZE_CHART_SIZES = 40;
export const MAX_SIZE_LABEL_LENGTH = 12;
// #69: written via fromCharCode rather than a literal escape in a string --
// see the identical constant and comment in lib/api/body.ts.
const NUL = String.fromCharCode(0);

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** A finite number, clamped — anything else (string, null, NaN) yields null. */
function numberInRange(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value, min, max);
}

function measurementValue(
  key: keyof Measurements,
  value: unknown,
): number | null {
  const range = MEASUREMENT_RANGES[key];
  return numberInRange(value, range.min, range.max);
}

/**
 * Sanitises an untrusted PATCH body for a size chart.
 *
 * This is the size-chart half of the trust boundary that validateSpec already
 * provides for the AI's GarmentSpec. A size chart feeds the same drafter, so an
 * unchecked patch was just as dangerous: `baseMeasurements: {}` replaced the
 * whole row, resolveSizeChartSize then iterated zero keys, and generation
 * happily persisted a pattern whose every dimension was NaN and whose viewBox
 * was {w: null, h: null} -- while answering `status: "ok"`.
 *
 * Philosophy matches validateSpec: drop or clamp, never throw. An unusable
 * field is ignored so the rest of the patch still applies, and no combination
 * of inputs can produce a chart that does not resolve.
 */
export function validateSizeChartPatch(
  current: SizeChartData,
  patch: unknown,
): Partial<SizeChartData> {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return {};
  }
  const input = patch as Record<string, unknown>;
  const out: Partial<SizeChartData> = {};

  if (typeof input.name === "string") {
    const name = input.name.trim().slice(0, MAX_SIZE_CHART_NAME);
    // #69: a NUL code point survives trim/slice and would abort the jsonb
    // write with no coded error -- dropped like any other unusable name,
    // matching this module's drop-or-clamp-never-throw contract.
    if (name && name.indexOf(NUL) === -1) out.name = name;
  }

  if (GENDERS.includes(input.gender as never)) {
    out.gender = input.gender as SizeChartData["gender"];
  }

  if (BODY_TYPES.includes(input.bodyType as never)) {
    out.bodyType = input.bodyType as SizeChartData["bodyType"];
  }

  // Trimmed, length-capped, blank-free and de-duplicated: a duplicate label
  // would make sizes.indexOf() ambiguous in resolveSizeChartSize, an empty
  // list would leave the chart with no columns at all, and an unbounded
  // count/length is the #97 cost-and-availability defect above.
  if (Array.isArray(input.sizes)) {
    const sizes = [
      ...new Set(
        input.sizes
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim().slice(0, MAX_SIZE_LABEL_LENGTH))
          .filter(Boolean),
      ),
    ].slice(0, MAX_SIZE_CHART_SIZES);
    if (sizes.length > 0) out.sizes = sizes;
  }

  const nextSizes = out.sizes ?? current.sizes;

  if (
    typeof input.baseSizeIndex === "number" &&
    Number.isFinite(input.baseSizeIndex)
  ) {
    out.baseSizeIndex = clamp(
      Math.floor(input.baseSizeIndex),
      0,
      nextSizes.length - 1,
    );
  } else if (out.sizes && current.baseSizeIndex > out.sizes.length - 1) {
    // The size list shrank past the existing base column — pull it back in.
    out.baseSizeIndex = out.sizes.length - 1;
  }

  // MERGED onto the current row, never replacing it, so a patch can only ever
  // change values — it can never drop a measurement key.
  if (
    typeof input.baseMeasurements === "object" &&
    input.baseMeasurements !== null
  ) {
    const patched = input.baseMeasurements as Record<string, unknown>;
    const merged = { ...current.baseMeasurements };
    for (const key of MEASUREMENT_KEYS) {
      const value = measurementValue(key, patched[key]);
      if (value !== null) merged[key] = value;
    }
    out.baseMeasurements = merged;
  }

  if (
    typeof input.progressionRule === "object" &&
    input.progressionRule !== null
  ) {
    const patched = input.progressionRule as Record<string, unknown>;
    const rule: Partial<Record<keyof Measurements, number>> = {};
    for (const key of MEASUREMENT_KEYS) {
      const value = numberInRange(
        patched[key],
        -MAX_PROGRESSION_STEP,
        MAX_PROGRESSION_STEP,
      );
      if (value !== null) rule[key] = value;
    }
    out.progressionRule = rule;
  }

  if (typeof input.overrides === "object" && input.overrides !== null) {
    const patched = input.overrides as Record<string, unknown>;
    const overrides: Record<string, Partial<Measurements>> = {};
    for (const size of nextSizes) {
      const cell = patched[size];
      if (typeof cell !== "object" || cell === null) continue;
      const row: Partial<Measurements> = {};
      for (const key of MEASUREMENT_KEYS) {
        const value = measurementValue(
          key,
          (cell as Record<string, unknown>)[key],
        );
        if (value !== null) row[key] = value;
      }
      if (Object.keys(row).length > 0) overrides[size] = row;
    }
    out.overrides = overrides;
  }

  // `isSystem` is deliberately absent from every branch above: it is decided by
  // the seeder, never by a request.
  return out;
}
