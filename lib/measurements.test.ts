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

  it("resolves the size base and applies overrides (default female)", () => {
    expect(resolveMeasurements("M", {}).waist).toBe(74);
    expect(resolveMeasurements("M", { waist: 68 }).waist).toBe(68);
  });

  it("resolves via the male table when gender=male", () => {
    expect(resolveMeasurements("M", {}, "male").bust).toBe(100);
    expect(resolveMeasurements("M", {}, "female").bust).toBe(92);
  });

  it("clamps the shoulder to the [14,26] range", () => {
    expect(resolveMeasurements("M", { shoulder: 99 }).shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.max,
    );
    expect(resolveMeasurements("M", { shoulder: 1 }).shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.min,
    );
  });
});
