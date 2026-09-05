import { describe, it, expect } from "vitest";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  MEASUREMENT_RANGES,
  MEASUREMENT_KEYS,
  CORE_MEASUREMENT_KEYS,
  EXTENDED_MEASUREMENT_KEYS,
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

  // #132: EXTENDED_MEASUREMENT_KEYS are optional -- a base row that simply
  // omits them (every real size chart persisted before this issue, and
  // SIZE_TABLE.M itself) must NOT throw the way a missing CORE field does.
  it("does not throw when a base row omits every EXTENDED measurement key", () => {
    expect(() => resolveMeasurements(SIZE_TABLE.M, {})).not.toThrow();
  });

  it("passes an EXTENDED override straight through, clamped to its own range", () => {
    const r = resolveMeasurements(SIZE_TABLE.M, { bicep: 999 });
    expect(r.bicep).toBe(MEASUREMENT_RANGES.bicep.max);
  });

  // bust-dart-shaping (BDART-12): a chat-driven measurementOverrides payload
  // (the AI's or a hand-built one) is clamped to MEASUREMENT_RANGES for
  // EVERY extended key, not just bicep above -- generalizes the single
  // hardcoded example into the same it.each sweep the rest of this describe
  // block already uses for structural checks.
  it.each(EXTENDED_MEASUREMENT_KEYS)(
    "clamps an out-of-range EXTENDED override for %s to its own range",
    (key) => {
      const r = MEASUREMENT_RANGES[key];
      expect(
        resolveMeasurements(SIZE_TABLE.M, { [key]: r.max + 100 })[key],
      ).toBe(r.max);
      expect(
        resolveMeasurements(SIZE_TABLE.M, { [key]: r.min - 100 })[key],
      ).toBe(r.min);
    },
  );

  it("leaves an EXTENDED field undefined when neither the base row nor the override sets it", () => {
    const r = resolveMeasurements(SIZE_TABLE.M, {});
    expect(r.highBust).toBeUndefined();
  });

  // #132: an EXTENDED field IS present on the base row (e.g. from a size
  // chart) but non-finite -- this is the corrupted-data case #140 already
  // guards for the nine CORE fields, extended to cover the six new ones.
  it("throws on a base row with a non-finite EXTENDED field", () => {
    expect(() =>
      resolveMeasurements({ ...SIZE_TABLE.M, bicep: NaN }, {}),
    ).toThrow(/bicep/);
  });
});

describe("CORE_MEASUREMENT_KEYS / EXTENDED_MEASUREMENT_KEYS / MEASUREMENT_KEYS (#132)", () => {
  it("MEASUREMENT_KEYS is exactly CORE followed by EXTENDED, no overlap", () => {
    expect(MEASUREMENT_KEYS).toEqual([
      ...CORE_MEASUREMENT_KEYS,
      ...EXTENDED_MEASUREMENT_KEYS,
    ]);
    const overlap = CORE_MEASUREMENT_KEYS.filter((k) =>
      (EXTENDED_MEASUREMENT_KEYS as string[]).includes(k),
    );
    expect(overlap).toEqual([]);
  });

  // #269: the original nine, plus four #132/bust-dart-shaping fields
  // promoted out of EXTENDED (a FreeSewing design requires each outright),
  // plus 14 genuinely new keys with no moldai-side fallback at all, plus 6
  // more added for the trousers/Titan follow-up (a fitted front/back-split
  // trouser block moldai's own straight-leg simplification never needed).
  it("CORE_MEASUREMENT_KEYS has the original nine, the four promoted keys, the 14 freesewing-only keys, and the 6 trouser-family keys", () => {
    expect(CORE_MEASUREMENT_KEYS).toEqual([
      "bust",
      "waist",
      "hip",
      "hipHeight",
      "backLength",
      "shoulder",
      "skirtLength",
      "shortSleeveLength",
      "longSleeveLength",
      "bicep",
      "bustPointHeight",
      "neckGirth",
      "bustSpan",
      "waistToArmpit",
      "shoulderToWrist",
      "wrist",
      "underbust",
      "bustPointToUnderbust",
      "bustFront",
      "waistToUnderbust",
      "seat",
      "waistToSeat",
      "waistToKnee",
      "waistToFloor",
      "inseam",
      "shoulderToElbow",
      "head",
      "crossSeam",
      "crossSeamFront",
      "knee",
      "seatBack",
      "waistBack",
      "waistToUpperLeg",
    ]);
  });

  it("EXTENDED_MEASUREMENT_KEYS carries only the four fields no registered FreeSewing design reads", () => {
    expect(EXTENDED_MEASUREMENT_KEYS).toEqual([
      "highBust",
      "shoulderSlope",
      "backWidth",
      "rise",
    ]);
  });

  it("every MEASUREMENT_KEYS entry has a MEASUREMENT_RANGES entry with min < max", () => {
    for (const key of MEASUREMENT_KEYS) {
      const range = MEASUREMENT_RANGES[key];
      expect(range).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
    }
  });
});
