import { describe, it, expect } from "vitest";
import { describeSpecAdjustments } from "./specAdjustments";
import { validateSpec, STYLE_LIMITS } from "./garment";

describe("describeSpecAdjustments", () => {
  it("returns nothing for raw that isn't an object", () => {
    expect(describeSpecAdjustments(undefined, validateSpec(undefined))).toEqual(
      [],
    );
    expect(describeSpecAdjustments(null, validateSpec(null))).toEqual([]);
    expect(describeSpecAdjustments([1, 2], validateSpec([1, 2]))).toEqual([]);
  });

  it("returns nothing when every field validates unchanged", () => {
    const raw = {
      type: "blouse",
      gender: "female",
      style: { neckline: "V", sleeve: "long", collar: "band" },
    };
    expect(describeSpecAdjustments(raw, validateSpec(raw))).toEqual([]);
  });

  // #351: gorePanels must be even -- an in-range odd count is "rounded",
  // never mislabelled as clamped (out of range) or substituted (defaulted).
  it("reports an odd in-range gorePanels as rounded to the even count used", () => {
    const raw = { type: "skirt", style: { skirt: "gore", gorePanels: 7 } };
    expect(describeSpecAdjustments(raw, validateSpec(raw))).toEqual([
      { kind: "rounded", field: "gorePanels", requested: 7, used: 8 },
    ]);
  });

  it("reports an out-of-range gorePanels as clamped, and an even one not at all", () => {
    const high = { type: "skirt", style: { skirt: "gore", gorePanels: 30 } };
    expect(describeSpecAdjustments(high, validateSpec(high))).toEqual([
      {
        kind: "clamped",
        field: "gorePanels",
        requested: 30,
        used: STYLE_LIMITS.gorePanels.max,
        range: STYLE_LIMITS.gorePanels,
      },
    ]);
    const even = { type: "skirt", style: { skirt: "gore", gorePanels: 10 } };
    expect(describeSpecAdjustments(even, validateSpec(even))).toEqual([]);
  });

  it("returns nothing for a field the raw payload never named", () => {
    const raw = { type: "blouse" };
    expect(describeSpecAdjustments(raw, validateSpec(raw))).toEqual([]);
  });

  it("reports an unrecognized garment type as substituted, defaulted to blouse", () => {
    const raw = { type: "gnorf" };
    const [entry] = describeSpecAdjustments(raw, validateSpec(raw));
    expect(entry).toEqual({
      kind: "substituted",
      field: "type",
      requested: "gnorf",
      used: "blouse",
    });
  });

  it("reports an unrecognized gender as substituted, defaulted to female", () => {
    const raw = { gender: "xx" };
    const [entry] = describeSpecAdjustments(raw, validateSpec(raw));
    expect(entry).toEqual({
      kind: "substituted",
      field: "gender",
      requested: "xx",
      used: "female",
    });
  });

  it("reports an unrecognized collar as substituted, defaulted to none", () => {
    const raw = { style: { collar: "peterPan" } };
    const validated = validateSpec(raw);
    expect(validated.style.collar).toBe("none");
    const [entry] = describeSpecAdjustments(raw, validated);
    expect(entry).toEqual({
      kind: "substituted",
      field: "collar",
      requested: "peterPan",
      used: "none",
    });
  });

  it("reports an unrecognized pleat as substituted, defaulted to none", () => {
    const raw = { type: "skirt", style: { pleats: "knife" } };
    const validated = validateSpec(raw);
    expect(validated.style.pleats).toBe("none");
    const [entry] = describeSpecAdjustments(raw, validated);
    expect(entry).toEqual({
      kind: "substituted",
      field: "pleats",
      requested: "knife",
      used: "none",
    });
  });

  it("reports an out-of-range necklineDepthCm as clamped, with the range", () => {
    const raw = { style: { necklineDepthCm: 999 } };
    const validated = validateSpec(raw);
    const [entry] = describeSpecAdjustments(raw, validated);
    expect(entry).toEqual({
      kind: "clamped",
      field: "necklineDepthCm",
      requested: 999,
      used: STYLE_LIMITS.necklineDepthCm.max,
      range: STYLE_LIMITS.necklineDepthCm,
    });
  });

  it("reports a below-range skirtLengthCm as clamped to the lower bound", () => {
    const raw = { style: { skirtLengthCm: 1 } };
    const validated = validateSpec(raw);
    const [entry] = describeSpecAdjustments(raw, validated);
    expect(entry).toEqual({
      kind: "clamped",
      field: "skirtLengthCm",
      requested: 1,
      used: STYLE_LIMITS.skirtLengthCm.min,
      range: STYLE_LIMITS.skirtLengthCm,
    });
  });

  it("reports a non-numeric scalar as substituted, not clamped", () => {
    const raw = { style: { armholeDeepenCm: "lots" } };
    const validated = validateSpec(raw);
    const [entry] = describeSpecAdjustments(raw, validated);
    expect(entry).toEqual({
      kind: "substituted",
      field: "armholeDeepenCm",
      requested: "lots",
      used: String(validated.style.armholeDeepenCm),
    });
  });

  it("reports a non-boolean darts as substituted, dropped to undefined", () => {
    const raw = { style: { darts: "yes" } };
    const validated = validateSpec(raw);
    expect(validated.style.darts).toBeUndefined();
    const [entry] = describeSpecAdjustments(raw, validated);
    expect(entry).toEqual({
      kind: "substituted",
      field: "darts",
      requested: "yes",
    });
    expect("used" in entry).toBe(false);
  });

  it("never reports sleeveRefit, an internal-only field", () => {
    const raw = { style: { sleeveRefit: "garbage" } };
    expect(describeSpecAdjustments(raw, validateSpec(raw))).toEqual([]);
  });

  it("never reports measurementOverrides -- out of this diff's scope", () => {
    const raw = { measurementOverrides: { bust: 5000, hack: "nope" } };
    expect(describeSpecAdjustments(raw, validateSpec(raw))).toEqual([]);
  });

  it("collects multiple adjustments in field order", () => {
    const raw = {
      type: "gnorf",
      style: { collar: "peterPan", necklineDepthCm: 999 },
    };
    const kinds = describeSpecAdjustments(raw, validateSpec(raw)).map(
      (a) => a.field,
    );
    expect(kinds).toEqual(["type", "necklineDepthCm", "collar"]);
  });

  // #260 code-review: an unrecognized descriptive-length token resolves to
  // `undefined` inside validateSpec (garment.ts's resolveScalarField), the
  // same silent-drop shape every other checkScalar/checkEnum case already
  // exists to surface -- these pin that the token's OWN sibling field
  // (necklineDepth, skirtLength, ...) is diffed too, not just its *Cm twin.
  it("reports an unrecognized descriptive-length token as substituted on the *Cm field, dropped to undefined", () => {
    const raw = { type: "trousers", style: { trouserLength: "bogus" } };
    const validated = validateSpec(raw);
    expect(validated.style.trouserLengthCm).toBeUndefined();
    const [entry] = describeSpecAdjustments(raw, validated);
    expect(entry).toEqual({
      kind: "substituted",
      field: "trouserLengthCm",
      requested: "bogus",
    });
    expect("used" in entry).toBe(false);
  });

  it("never reports a valid descriptive-length token -- it's a deliberate choice, not a substitution", () => {
    const raw = { type: "skirt", style: { skirtLength: "maxi" } };
    expect(describeSpecAdjustments(raw, validateSpec(raw))).toEqual([]);
  });

  it("does not double-report the token when an explicit *Cm value was also sent (the cm value alone determines the outcome)", () => {
    const raw = {
      type: "skirt",
      style: { skirtLength: "bogus", skirtLengthCm: 45 },
    };
    const validated = validateSpec(raw);
    expect(validated.style.skirtLengthCm).toBe(45);
    expect(describeSpecAdjustments(raw, validated)).toEqual([]);
  });

  it("treats a null *Cm value as not sent, so an unrecognized token alongside it is still reported", () => {
    const raw = {
      type: "blouse",
      style: { necklineDepthCm: null, necklineDepth: "bogus" },
    };
    const validated = validateSpec(raw);
    expect(validated.style.necklineDepthCm).toBeUndefined();
    const [entry] = describeSpecAdjustments(raw, validated);
    expect(entry).toEqual({
      kind: "substituted",
      field: "necklineDepthCm",
      requested: "bogus",
    });
  });

  // #260 second code-review pass: checkScalar used to treat `null` as "sent"
  // (`Number(null)` is 0, a below-range value), even after resolveScalarField
  // (garment.ts) started treating `null` as "not sent" -- the two functions
  // silently disagreeing produced a fabricated "clamped" report for a value
  // the user never sent, while validateSpec itself correctly resolved the
  // valid token alongside it.
  it("never reports a null *Cm value as clamped when a valid token resolves it instead", () => {
    const raw = {
      type: "trousers",
      style: { trouserLengthCm: null, trouserLength: "ankle" },
    };
    const validated = validateSpec(raw);
    expect(validated.style.trouserLengthCm).toBe(95);
    expect(describeSpecAdjustments(raw, validated)).toEqual([]);
  });

  // Same drift, the other direction: checkScalarToken used to only skip a
  // `tokenRaw === undefined` token, not a `null` one, so a provider that
  // null-fills an unset optional token property (see
  // lib/ai/provider/openaiCompat.ts) produced a fabricated "substituted"
  // report claiming the user requested the literal token "null".
  it("never reports a null descriptive-length token as substituted -- null counts as not sent", () => {
    const raw = { type: "skirt", style: { skirtLength: null } };
    const validated = validateSpec(raw);
    expect(validated.style.skirtLengthCm).toBeUndefined();
    expect(describeSpecAdjustments(raw, validated)).toEqual([]);
  });
});
