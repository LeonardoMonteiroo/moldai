import { describe, it, expect } from "vitest";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  MEASUREMENT_RANGES,
  resolveMeasurements,
} from "./measurements";

describe("size tables", () => {
  it("female has 5 sizes with monotonic bust/waist/hip grading", () => {
    const order = ["PP", "P", "M", "G", "GG"] as const;
    for (let i = 1; i < order.length; i++) {
      const a = SIZE_TABLE[order[i - 1]],
        b = SIZE_TABLE[order[i]];
      expect(b.bust).toBeGreaterThan(a.bust);
      expect(b.waist).toBeGreaterThan(a.waist);
      expect(b.hip).toBeGreaterThan(a.hip);
      expect(b.shoulder).toBeGreaterThan(a.shoulder);
    }
    expect(SIZE_TABLE.M.bust).toBe(92);
  });

  it("male is wider at the shoulder than female for the same size", () => {
    expect(SIZE_TABLE_MALE.M.shoulder).toBeGreaterThan(SIZE_TABLE.M.shoulder);
    expect(SIZE_TABLE_MALE.M.bust).toBe(100);
  });
});

describe("resolveMeasurements", () => {
  it("returns the base row unchanged with no overrides", () => {
    expect(resolveMeasurements(SIZE_TABLE.M, {}).waist).toBe(74);
  });

  it("applies a numeric override on top of the base row", () => {
    expect(resolveMeasurements(SIZE_TABLE.M, { waist: 68 }).waist).toBe(68);
  });

  it("leaves fields without an override untouched", () => {
    const r = resolveMeasurements(SIZE_TABLE.M, { waist: 68 });
    expect(r.bust).toBe(SIZE_TABLE.M.bust);
  });

  it("clamps the shoulder to the [14,26] range", () => {
    expect(resolveMeasurements(SIZE_TABLE.M, { shoulder: 99 }).shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.max,
    );
    expect(resolveMeasurements(SIZE_TABLE.M, { shoulder: 1 }).shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.min,
    );
  });

  it("ignores non-numeric override values", () => {
    const r = resolveMeasurements(SIZE_TABLE.M, {
      waist: "x" as unknown as number,
    });
    expect(r.waist).toBe(SIZE_TABLE.M.waist);
  });
});
