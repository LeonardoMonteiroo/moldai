import { describe, it, expect } from "vitest";
import { MeasurementsSchema } from "./measurements";
import {
  CORE_MEASUREMENT_KEYS,
  EXTENDED_MEASUREMENT_KEYS,
} from "@/lib/measurements";

const FULL = {
  bust: 92,
  waist: 74,
  hip: 100,
  hipHeight: 20.6,
  backLength: 41,
  shoulder: 18.5,
  skirtLength: 60,
  shortSleeveLength: 18,
  longSleeveLength: 58,
  bicep: 27.6,
  bustPointHeight: 26.5,
  neckGirth: 39.4,
  bustSpan: 18.5,
  waistToArmpit: 16.9,
  shoulderToWrist: 58.9,
  wrist: 16.5,
  underbust: 77.6,
  bustPointToUnderbust: 10.0,
  bustFront: 47.9,
  waistToUnderbust: 8.0,
  seat: 100.7,
  waistToSeat: 24.9,
  waistToKnee: 59.8,
  waistToFloor: 104.8,
  inseam: 76.4,
  shoulderToElbow: 33.9,
  head: 56.4,
  crossSeam: 73.8,
  crossSeamFront: 36.9,
  knee: 37.9,
  seatBack: 51.8,
  waistBack: 37.8,
  waistToUpperLeg: 28.4,
  hpsToWaistFront: 44.0,
  highBust: 92,
  shoulderSlope: 4.0,
  backWidth: 46,
  rise: 27,
};

describe("MeasurementsSchema (#132 / #269)", () => {
  it("accepts a row carrying every key", () => {
    expect(MeasurementsSchema.safeParse(FULL).success).toBe(true);
  });

  it("accepts a row carrying only the CORE keys", () => {
    const core = Object.fromEntries(
      CORE_MEASUREMENT_KEYS.map((k) => [k, FULL[k as keyof typeof FULL]]),
    );
    expect(MeasurementsSchema.safeParse(core).success).toBe(true);
  });

  it.each(CORE_MEASUREMENT_KEYS)(
    "rejects a row missing the CORE key %s",
    (key) => {
      const { [key]: _omitted, ...rest } = FULL;
      expect(MeasurementsSchema.safeParse(rest).success).toBe(false);
    },
  );

  it.each(EXTENDED_MEASUREMENT_KEYS)(
    "accepts a row missing the EXTENDED key %s",
    (key) => {
      const { [key]: _omitted, ...rest } = FULL;
      expect(MeasurementsSchema.safeParse(rest).success).toBe(true);
    },
  );

  it("rejects a non-finite EXTENDED value the same way it would a CORE one", () => {
    expect(
      MeasurementsSchema.safeParse({ ...FULL, rise: Number.NaN }).success,
    ).toBe(false);
  });

  // #269: bicep/bustPointHeight/neckGirth/bustSpan moved OUT of the optional
  // mask when they were promoted to CORE -- a row missing any of them must
  // now be rejected the same way a row missing `bust` already was, not
  // silently accepted the way it was before the promotion.
  it.each(["bicep", "bustPointHeight", "neckGirth", "bustSpan"] as const)(
    "rejects a row missing the promoted-to-CORE key %s",
    (key) => {
      const { [key]: _omitted, ...rest } = FULL;
      expect(MeasurementsSchema.safeParse(rest).success).toBe(false);
    },
  );
});
