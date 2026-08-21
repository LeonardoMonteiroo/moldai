import { describe, it, expect } from "vitest";
import { validateSizeChartPatch } from "./validate";
import { buildSystemSizeChartData } from "./seed";
import { MEASUREMENT_RANGES } from "@/lib/measurements";

const current = buildSystemSizeChartData("female");

describe("validateSizeChartPatch", () => {
  it("passes a valid patch through", () => {
    const out = validateSizeChartPatch(current, {
      name: "Minha grade",
      gender: "male",
      bodyType: "pear",
    });
    expect(out.name).toBe("Minha grade");
    expect(out.gender).toBe("male");
    expect(out.bodyType).toBe("pear");
  });

  it("drops keys that are not part of SizeChartData", () => {
    const out = validateSizeChartPatch(current, {
      name: "ok",
      totallyUnknownKey: { nested: "junk" },
      __proto__: { polluted: true },
    });
    expect(out).toEqual({ name: "ok" });
  });

  it("never lets a patch claim isSystem", () => {
    const out = validateSizeChartPatch(current, { isSystem: true });
    expect(out.isSystem).toBeUndefined();
  });

  it("drops a gender that is not a real Gender", () => {
    expect(validateSizeChartPatch(current, { gender: "banana" }).gender).toBe(
      undefined,
    );
  });

  it("drops a bodyType that is not a real BodyType", () => {
    expect(
      validateSizeChartPatch(current, { bodyType: "triangular" }).bodyType,
    ).toBe(undefined);
  });

  it("drops a blank or non-string name", () => {
    expect(validateSizeChartPatch(current, { name: "   " }).name).toBe(
      undefined,
    );
    expect(validateSizeChartPatch(current, { name: 42 }).name).toBe(undefined);
  });

  it("trims a name and caps its length", () => {
    const out = validateSizeChartPatch(current, { name: "  Grade  " });
    expect(out.name).toBe("Grade");
    const long = validateSizeChartPatch(current, { name: "x".repeat(500) });
    expect(long.name!.length).toBeLessThanOrEqual(80);
  });

  // The bug this module exists for: a partial (or empty) baseMeasurements used
  // to REPLACE the whole object, so resolveSizeChartSize iterated over the
  // surviving keys only and every drafted dimension came out NaN.
  it("merges baseMeasurements onto the current row instead of replacing it", () => {
    const out = validateSizeChartPatch(current, { baseMeasurements: {} });
    expect(out.baseMeasurements).toEqual(current.baseMeasurements);
  });

  it("keeps every measurement key when only one is patched", () => {
    const out = validateSizeChartPatch(current, {
      baseMeasurements: { bust: 95 },
    });
    expect(Object.keys(out.baseMeasurements!).sort()).toEqual(
      Object.keys(current.baseMeasurements).sort(),
    );
    expect(out.baseMeasurements!.bust).toBe(95);
    expect(out.baseMeasurements!.waist).toBe(current.baseMeasurements.waist);
  });

  it("ignores non-numeric measurement values rather than storing them", () => {
    const out = validateSizeChartPatch(current, {
      baseMeasurements: { bust: "not-a-number", waist: null, hip: NaN },
    });
    expect(out.baseMeasurements!.bust).toBe(current.baseMeasurements.bust);
    expect(out.baseMeasurements!.waist).toBe(current.baseMeasurements.waist);
    expect(out.baseMeasurements!.hip).toBe(current.baseMeasurements.hip);
  });

  it("clamps measurements to MEASUREMENT_RANGES", () => {
    const out = validateSizeChartPatch(current, {
      baseMeasurements: { bust: -9999, waist: 9999 },
    });
    expect(out.baseMeasurements!.bust).toBe(MEASUREMENT_RANGES.bust.min);
    expect(out.baseMeasurements!.waist).toBe(MEASUREMENT_RANGES.waist.max);
  });

  it("keeps only finite numeric progression-rule entries", () => {
    const out = validateSizeChartPatch(current, {
      progressionRule: { bust: 4, waist: "NaN-ish", hip: Infinity },
    });
    expect(out.progressionRule).toEqual({ bust: 4 });
  });

  it("rejects an empty size list and a non-array", () => {
    expect(validateSizeChartPatch(current, { sizes: [] }).sizes).toBe(
      undefined,
    );
    expect(validateSizeChartPatch(current, { sizes: "P,M" }).sizes).toBe(
      undefined,
    );
  });

  it("trims size labels and drops blank and duplicate ones", () => {
    const out = validateSizeChartPatch(current, {
      sizes: [" P ", "M", "M", "", "  ", "G"],
    });
    expect(out.sizes).toEqual(["P", "M", "G"]);
  });

  it("keeps baseSizeIndex inside the resulting size list", () => {
    expect(
      validateSizeChartPatch(current, { sizes: ["P", "M"], baseSizeIndex: 99 })
        .baseSizeIndex,
    ).toBe(1);
    expect(
      validateSizeChartPatch(current, { baseSizeIndex: -3 }).baseSizeIndex,
    ).toBe(0);
    expect(
      validateSizeChartPatch(current, { baseSizeIndex: 1.7 }).baseSizeIndex,
    ).toBe(1);
  });

  it("keeps overrides only for sizes that exist, with clamped numbers", () => {
    const out = validateSizeChartPatch(current, {
      overrides: {
        M: { bust: 9999, waist: "junk" },
        NOPE: { bust: 90 },
      },
    });
    expect(out.overrides).toEqual({ M: { bust: MEASUREMENT_RANGES.bust.max } });
  });

  it("returns an empty patch for a non-object", () => {
    expect(validateSizeChartPatch(current, null)).toEqual({});
    expect(validateSizeChartPatch(current, "nope")).toEqual({});
    expect(validateSizeChartPatch(current, [1, 2])).toEqual({});
  });
});
