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
  neckGirth: 39.4,
  highBust: 92,
  shoulderSlope: 4.0,
  backWidth: 46,
  bicep: 27.6,
  rise: 27,
};

describe("MeasurementsSchema (#132)", () => {
  it("accepts a row carrying every key", () => {
    expect(MeasurementsSchema.safeParse(FULL).success).toBe(true);
  });

  it("accepts a row carrying only the nine CORE keys", () => {
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
      MeasurementsSchema.safeParse({ ...FULL, bicep: Number.NaN }).success,
    ).toBe(false);
  });
});
