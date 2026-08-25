import { describe, it, expect } from "vitest";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  MEASUREMENT_RANGES,
  resolveMeasurements,
  type Measurements,
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

  it.each([
    ["female", SIZE_TABLE],
    ["male", SIZE_TABLE_MALE],
  ] as const)(
    "#118: %s grades skirtLength/shortSleeveLength/longSleeveLength monotonically across PP-GG, instead of holding them constant",
    (_label, table) => {
      const order = ["PP", "P", "M", "G", "GG"] as const;
      for (let i = 1; i < order.length; i++) {
        const a = table[order[i - 1]],
          b = table[order[i]];
        expect(b.skirtLength).toBeGreaterThan(a.skirtLength);
        expect(b.shortSleeveLength).toBeGreaterThan(a.shortSleeveLength);
        expect(b.longSleeveLength).toBeGreaterThan(a.longSleeveLength);
      }
    },
  );
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

  // #140: an incomplete base row (a corrupted sizeTable entry) used to sail
  // through as `undefined` fields, which turn into NaN in the drafters'
  // arithmetic and hang buildExportModel's offset/curve geometry for tens of
  // seconds instead of failing. Fail fast at the one choke point every
  // drafted garment's base row passes through.
  it("throws on a base row missing required fields, instead of silently producing NaN", () => {
    expect(() => resolveMeasurements({} as Measurements, {})).toThrow(/bust/);
  });

  it("throws on a base row with a non-finite field", () => {
    expect(() =>
      resolveMeasurements({ ...SIZE_TABLE.M, bust: NaN }, {}),
    ).toThrow(/bust/);
  });
});
