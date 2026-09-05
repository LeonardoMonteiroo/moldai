import { describe, it, expect } from "vitest";
import { backfillRow } from "./backfill-freesewing-measurements";
import { FRONT_BACK_LENGTH_DELTA_CM } from "../lib/measurements";

describe("backfillRow", () => {
  it("fills every missing key, sourced from the row's own bust girth", () => {
    const row: Record<string, unknown> = {
      bust: 92,
      waist: 74,
      backLength: 41.0,
    };
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
      "crossSeam",
      "crossSeamFront",
      "knee",
      "seatBack",
      "waistBack",
      "waistToUpperLeg",
      "hpsToWaistFront",
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

  // #269 (coat/Jett follow-up, migration-safety catch): hpsToWaistFront is
  // NOT interpolated from @freesewing/models (that upstream figure is
  // flagged as a rough estimate and produced a sign-flipping front/back
  // relationship) -- it's derived from the row's OWN backLength instead,
  // so it must track backLength exactly, never the bust-driven model.
  it("derives hpsToWaistFront from the row's own backLength, not from bust", () => {
    const female: Record<string, unknown> = { bust: 92, backLength: 41.0 };
    backfillRow(female, "female");
    expect(female.hpsToWaistFront).toBeCloseTo(
      41.0 + FRONT_BACK_LENGTH_DELTA_CM.female,
      5,
    );

    const male: Record<string, unknown> = { bust: 92, backLength: 44.0 };
    backfillRow(male, "male");
    expect(male.hpsToWaistFront).toBeCloseTo(
      44.0 + FRONT_BACK_LENGTH_DELTA_CM.male,
      5,
    );
  });

  it("leaves hpsToWaistFront unfilled when the row has no backLength to derive it from, rather than fabricating one", () => {
    const row: Record<string, unknown> = { bust: 92 };
    backfillRow(row, "female");
    expect(row.hpsToWaistFront).toBeUndefined();
  });
});
