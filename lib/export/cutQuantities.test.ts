import { describe, it, expect } from "vitest";
import { validateCutQuantities } from "./cutQuantities";
import { MAX_CUT_QUANTITY_PER_SIZE, MAX_TOTAL_CUT_QUANTITY } from "@/lib/types";

const SIZES = ["M", "G"];

describe("validateCutQuantities", () => {
  it("returns {} for a completely unusable input, never throws", () => {
    expect(validateCutQuantities(null, SIZES)).toEqual({});
    expect(validateCutQuantities(undefined, SIZES)).toEqual({});
    expect(validateCutQuantities("not an object", SIZES)).toEqual({});
    expect(validateCutQuantities(42, SIZES)).toEqual({});
    expect(validateCutQuantities([1, 2, 3], SIZES)).toEqual({});
  });

  it("drops a key not in availableSizes", () => {
    expect(validateCutQuantities({ M: 2, XL: 5 }, SIZES)).toEqual({ M: 2 });
  });

  it("drops a non-numeric or non-finite value", () => {
    expect(
      validateCutQuantities({ M: "3", G: Infinity, PP: NaN }, ["M", "G", "PP"]),
    ).toEqual({});
  });

  it("clamps a negative value to 0 and rounds a fractional one", () => {
    expect(validateCutQuantities({ M: -5, G: 2.6 }, SIZES)).toEqual({
      M: 0,
      G: 3,
    });
  });

  it("clamps a single size to MAX_CUT_QUANTITY_PER_SIZE", () => {
    expect(
      validateCutQuantities({ M: MAX_CUT_QUANTITY_PER_SIZE + 100 }, SIZES),
    ).toEqual({ M: MAX_CUT_QUANTITY_PER_SIZE });
  });

  it("clamps the running SUM across sizes to MAX_TOTAL_CUT_QUANTITY", () => {
    const manySizes = Array.from({ length: 10 }, (_, i) => `S${i}`);
    const input = Object.fromEntries(
      manySizes.map((s) => [s, MAX_CUT_QUANTITY_PER_SIZE]),
    );
    const result = validateCutQuantities(input, manySizes);
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    expect(total).toBe(MAX_TOTAL_CUT_QUANTITY);
  });

  it("round-trips a valid, in-range map unchanged", () => {
    expect(validateCutQuantities({ M: 1, G: 4 }, SIZES)).toEqual({
      M: 1,
      G: 4,
    });
  });

  it("preserves an explicit 0 rather than dropping the key", () => {
    expect(validateCutQuantities({ M: 0 }, SIZES)).toEqual({ M: 0 });
  });
});
