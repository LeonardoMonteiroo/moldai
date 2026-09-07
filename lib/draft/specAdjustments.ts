import type { GarmentSpec, GarmentStyle } from "@/lib/types";
import {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  FIT_CLASSES,
  STRETCH_CLASSES,
  STYLE_LIMITS,
} from "./vocabulary";

// #250: validateSpec (garment.ts) is deliberately permissive -- pick()
// swaps an unrecognized enum for a default, clamp() bounds every scalar --
// and neither leaves a trace of having done so. This is the pure sibling
// that DIFFS a raw (untrusted) payload against what validateSpec actually
// returned, so a caller can tell a real choice from a substitution. A leaf
// module, like lib/draft/vocabulary.ts and lib/draft/engine/capability.ts:
// imports only types and ./vocabulary, nothing from garment.ts itself --
// validateSpec's own signature and every call site stay untouched (#250's
// own AC #4).
//
// Deliberately out of scope: `measurementOverrides`. validateSpec only
// key/finite-filters those (garment.ts:112-115); the numeric clamp against
// MEASUREMENT_RANGES happens one boundary later, in
// lib/measurements.ts's resolveMeasurements -- a different trust boundary
// this issue does not fold in.

export type AdjustedField = "type" | "gender" | keyof GarmentStyle;

export interface Range {
  min: number;
  max: number;
}

export type SpecAdjustment =
  | {
      kind: "substituted";
      field: AdjustedField;
      requested: string;
      // Absent only when validateSpec itself left the field `undefined`
      // (e.g. a non-boolean `darts`) -- every enum/type/gender field always
      // has a defaulted value here, since pick() never returns undefined.
      used?: string;
    }
  | {
      kind: "clamped";
      field: AdjustedField;
      requested: number;
      used: number;
      range: Range;
    };

// One vocabulary array per enum-valued field -- the exact catalogs
// validateSpec's own `pick()` calls check membership against.
const ENUM_VOCAB: Partial<Record<AdjustedField, readonly string[]>> = {
  type: TYPES,
  gender: GENDERS,
  neckline: NECKLINES,
  sleeve: SLEEVES,
  skirt: SKIRTS,
  collar: COLLARS,
  cuff: CUFFS,
  waistband: WAISTBANDS,
  frontClosure: FRONT_CLOSURES,
  fit: FIT_CLASSES,
  stretch: STRETCH_CLASSES,
};

// One range per clamped scalar field -- the exact bounds validateSpec's own
// `clamp()` calls apply.
const SCALAR_LIMITS: Partial<Record<AdjustedField, Range>> = STYLE_LIMITS;

/**
 * Diffs a raw, untrusted `propose_garment` payload against the `GarmentSpec`
 * `validateSpec(raw)` actually returned for it. Pure; never mutates either
 * argument. One entry per field the raw payload named that did not survive
 * unchanged -- a field the payload never mentioned produces no entry (an
 * absent field wasn't "substituted", it was simply not asked about), and a
 * field that validated to exactly what was requested produces no entry
 * either (#250's own AC #3).
 */
export function describeSpecAdjustments(
  raw: unknown,
  validated: GarmentSpec,
): SpecAdjustment[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [];
  }
  const r = raw as Record<string, unknown>;
  const rawStyle = (r.style ?? {}) as Record<string, unknown>;
  const out: SpecAdjustment[] = [];

  const checkEnum = (
    field: AdjustedField,
    rawValue: unknown,
    validatedValue: unknown,
  ) => {
    if (rawValue === undefined) return;
    const vocab = ENUM_VOCAB[field];
    if (!vocab) return;
    if (typeof rawValue === "string" && vocab.includes(rawValue)) return;
    out.push({
      kind: "substituted",
      field,
      requested: String(rawValue),
      ...(validatedValue !== undefined ? { used: String(validatedValue) } : {}),
    });
  };

  const checkScalar = (
    field: AdjustedField,
    rawValue: unknown,
    validatedValue: number | undefined,
  ) => {
    if (rawValue === undefined) return;
    const n = Number(rawValue);
    if (!Number.isFinite(n)) {
      out.push({
        kind: "substituted",
        field,
        requested: String(rawValue),
        ...(validatedValue !== undefined
          ? { used: String(validatedValue) }
          : {}),
      });
      return;
    }
    const range = SCALAR_LIMITS[field];
    if (!range) return;
    if (n < range.min || n > range.max) {
      out.push({
        kind: "clamped",
        field,
        requested: n,
        // Present by construction whenever a range exists for this field:
        // clamp() always returns a bounded number, never undefined.
        used: validatedValue as number,
        range,
      });
    }
  };

  const checkBoolean = (
    field: AdjustedField,
    rawValue: unknown,
    validatedValue: boolean | undefined,
  ) => {
    if (rawValue === undefined) return;
    if (typeof rawValue === "boolean") return;
    out.push({
      kind: "substituted",
      field,
      requested: String(rawValue),
      ...(validatedValue !== undefined ? { used: String(validatedValue) } : {}),
    });
  };

  // Same field order validateSpec (garment.ts) itself reads them in.
  checkEnum("type", r.type, validated.type);
  checkEnum("gender", r.gender, validated.gender);

  checkEnum("neckline", rawStyle.neckline, validated.style.neckline);
  checkEnum("sleeve", rawStyle.sleeve, validated.style.sleeve);
  checkEnum("skirt", rawStyle.skirt, validated.style.skirt);
  checkScalar(
    "necklineDepthCm",
    rawStyle.necklineDepthCm,
    validated.style.necklineDepthCm,
  );
  checkScalar(
    "skirtLengthCm",
    rawStyle.skirtLengthCm,
    validated.style.skirtLengthCm,
  );
  checkScalar(
    "seamAllowanceCm",
    rawStyle.seamAllowanceCm,
    validated.style.seamAllowanceCm,
  );
  checkBoolean("darts", rawStyle.darts, validated.style.darts);
  checkEnum("fit", rawStyle.fit, validated.style.fit);
  checkEnum("stretch", rawStyle.stretch, validated.style.stretch);
  checkScalar(
    "armholeDeepenCm",
    rawStyle.armholeDeepenCm,
    validated.style.armholeDeepenCm,
  );
  // sleeveRefit deliberately skipped: internal-only (validateSpec discards
  // it; only "Corrigir manga" sets it), never a value the AI/user supplies
  // -- the same explicit skip checkEngineSupport makes (capability.ts).
  checkEnum("collar", rawStyle.collar, validated.style.collar);
  checkEnum("cuff", rawStyle.cuff, validated.style.cuff);
  checkEnum("waistband", rawStyle.waistband, validated.style.waistband);
  checkEnum(
    "frontClosure",
    rawStyle.frontClosure,
    validated.style.frontClosure,
  );
  checkScalar(
    "trouserLengthCm",
    rawStyle.trouserLengthCm,
    validated.style.trouserLengthCm,
  );
  checkScalar("riseCm", rawStyle.riseCm, validated.style.riseCm);

  return out;
}
