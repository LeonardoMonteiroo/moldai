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
  PLEATS,
  FIT_CLASSES,
  STRETCH_CLASSES,
  STYLE_LIMITS,
  SCALAR_TOKEN_FIELDS,
  isValueSent,
  resolveScalarToken,
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
    }
  | {
      // #351: an in-range number validateSpec still had to move -- today
      // only gorePanels, which must be even (vocabulary.ts's
      // evenGorePanels). A "clamped" report would falsely call 5 out of
      // range; a "substituted" one would falsely say the default was used.
      kind: "rounded";
      field: AdjustedField;
      requested: number;
      used: number;
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
  pleats: PLEATS,
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

  // #260: `rawValue` is only ever one of the five *Cm fields paired with a
  // descriptive token (see checkScalarToken below) -- isValueSent (not a
  // bare `=== undefined` check) so a `null` value is treated identically
  // to "not sent" here, matching garment.ts's own resolveScalarField. Before
  // this, a `null` *Cm value sent alongside a valid token produced a
  // fabricated "clamped" report (`Number(null)` is 0, a below-range value),
  // even though validateSpec itself correctly resolved the token and never
  // saw the null as a real request.
  const checkScalar = (
    field: AdjustedField,
    rawValue: unknown,
    validatedValue: number | undefined,
  ) => {
    if (!isValueSent(rawValue)) return;
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

  // #260: a free numeric style scalar's raw payload can name a descriptive
  // token (e.g. `trouserLength: "bogus"`) instead of/alongside its *Cm
  // twin -- garment.ts's resolveScalarField silently resolves an
  // unrecognized token to `undefined` (deferring to the drafter's own
  // context-aware default) rather than surfacing that the requested token
  // didn't exist. Without this check, that substitution would be invisible
  // to describeSpecAdjustments (and so to the user), the exact silent-
  // substitution failure mode this whole module exists to catch. Only
  // fires when the *Cm field itself wasn't sent (isValueSent, so `null`
  // counts as "not sent", same as resolveScalarField) -- when a *Cm value
  // IS present, it alone determines the outcome and checkScalar above
  // already reports on it, so the token (never even consulted by
  // validateSpec in that case) is not a "substitution" to report a second
  // time. Reuses resolveScalarToken (./vocabulary) rather than
  // reimplementing "does this token resolve" a second time -- see that
  // export's own doc comment for why a shared definition matters here.
  //
  // No `used` field: whenever this push is reached, validateSpec's own
  // resolveScalarField (garment.ts) has, by construction, resolved this
  // exact field to `undefined` (the *Cm field wasn't sent, and the token
  // didn't resolve) -- there is no validated value to report.
  const checkScalarToken = (cmField: keyof typeof SCALAR_TOKEN_FIELDS) => {
    const cmRaw = rawStyle[cmField];
    if (isValueSent(cmRaw)) return;
    const { tokenKey, table } = SCALAR_TOKEN_FIELDS[cmField];
    const tokenRaw = rawStyle[tokenKey];
    if (!isValueSent(tokenRaw)) return;
    if (resolveScalarToken(table, tokenRaw) !== undefined) {
      return; // a valid token is a deliberate choice, not a substitution
    }
    out.push({
      kind: "substituted",
      field: cmField,
      requested: String(tokenRaw),
    });
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
  checkScalarToken("necklineDepthCm");
  checkScalar(
    "skirtLengthCm",
    rawStyle.skirtLengthCm,
    validated.style.skirtLengthCm,
  );
  checkScalarToken("skirtLengthCm");
  checkScalar(
    "seamAllowanceCm",
    rawStyle.seamAllowanceCm,
    validated.style.seamAllowanceCm,
  );
  checkScalarToken("seamAllowanceCm");
  checkBoolean("darts", rawStyle.darts, validated.style.darts);
  checkEnum("fit", rawStyle.fit, validated.style.fit);
  checkEnum("stretch", rawStyle.stretch, validated.style.stretch);
  checkScalar(
    "armholeDeepenCm",
    rawStyle.armholeDeepenCm,
    validated.style.armholeDeepenCm,
  );
  checkScalarToken("armholeDeepenCm");
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
  checkScalarToken("trouserLengthCm");
  // #325: validateSpec's own last enum-valued style field (garment.ts:267-270,
  // `pick(style.pleats, PLEATS, "none")`) -- placed here so this block's own
  // "same field order validateSpec reads them in" comment stays literally
  // true. Before this, ENUM_VOCAB had no `pleats` entry, so even a call here
  // would have hit checkEnum's own `if (!vocab) return` early-out (see
  // above) and stayed silent -- a request for an unrecognized pleat (e.g.
  // "prega faca", PLEATS has no asymmetric knife value) became an unpleated
  // panel with no chat notice at all.
  checkEnum("pleats", rawStyle.pleats, validated.style.pleats);
  // #259's riseCm has no descriptive-token twin of its own (SCALAR_TOKEN_FIELDS
  // names the five #260 shipped), so it reports through the plain scalar check.
  checkScalar("riseCm", rawStyle.riseCm, validated.style.riseCm);
  // #351: a count with its own range, reported through checkScalar for a
  // garbage/out-of-range value; an in-range value that still moved (odd or
  // fractional, snapped to the nearest even number) is reported as
  // "rounded" instead, since checkScalar only sees the range.
  checkScalar("gorePanels", rawStyle.gorePanels, validated.style.gorePanels);
  if (isValueSent(rawStyle.gorePanels)) {
    const n = Number(rawStyle.gorePanels);
    const { min, max } = STYLE_LIMITS.gorePanels;
    const used = validated.style.gorePanels;
    if (
      Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      used !== undefined &&
      used !== n
    ) {
      out.push({ kind: "rounded", field: "gorePanels", requested: n, used });
    }
  }

  return out;
}
