import { describe, it, expect } from "vitest";
import { backfillRow } from "./backfill-freesewing-measurements";

describe("backfillRow", () => {
  it("fills every missing key, sourced from the row's own bust girth", () => {
    const row: Record<string, unknown> = { bust: 92, waist: 74 };
    const changed = backfillRow(row, "female");
    expect(changed).toBe(true);
    for (const key of [
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
      "bicep",
      "bustPointHeight",
      "neckGirth",
      "bustSpan",
    ]) {
      expect(typeof row[key]).toBe("number");
      expect(Number.isFinite(row[key])).toBe(true);
    }
  });

  it("never overwrites an already-present value", () => {
    const row: Record<string, unknown> = { bust: 92, wrist: 999 };
    backfillRow(row, "female");
    expect(row.wrist).toBe(999);
  });

  it("is idempotent -- a second call changes nothing and reports no change", () => {
    const row: Record<string, unknown> = { bust: 100 };
    backfillRow(row, "male");
    const snapshot = { ...row };
    const changedAgain = backfillRow(row, "male");
    expect(changedAgain).toBe(false);
    expect(row).toEqual(snapshot);
  });

  it("leaves a row with a missing/non-finite bust untouched and reports no change", () => {
    const row: Record<string, unknown> = { waist: 74 };
    const changed = backfillRow(row, "female");
    expect(changed).toBe(false);
    expect(row.wrist).toBeUndefined();
  });

  it("male and female rows at the same bust girth get different (gender-specific) values", () => {
    const female: Record<string, unknown> = { bust: 92 };
    const male: Record<string, unknown> = { bust: 92 };
    backfillRow(female, "female");
    backfillRow(male, "male");
    expect(female.wrist).not.toBe(male.wrist);
  });

  it("clamps to the extreme reference row rather than extrapolating past it", () => {
    const row: Record<string, unknown> = { bust: 500 }; // absurd, out of any real range
    const changed = backfillRow(row, "female");
    expect(changed).toBe(true);
    expect(Number.isFinite(row.wrist as number)).toBe(true);
  });
});
