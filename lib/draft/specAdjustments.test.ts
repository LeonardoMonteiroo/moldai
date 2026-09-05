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
});
