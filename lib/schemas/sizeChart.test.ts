import { describe, it, expect } from "vitest";
import { SizeChartDataSchema } from "./sizeChart";
import { buildSystemSizeChartData } from "@/lib/sizeCharts/seed";
import { t } from "@/lib/i18n/test-translate";

describe("SizeChartDataSchema", () => {
  it("accepts both seeded system charts", () => {
    expect(
      SizeChartDataSchema.safeParse(buildSystemSizeChartData("female", t)).success,
    ).toBe(true);
    expect(
      SizeChartDataSchema.safeParse(buildSystemSizeChartData("male", t)).success,
    ).toBe(true);
  });

  it("round-trips through JSON.stringify/parse", () => {
    const data = JSON.parse(JSON.stringify(buildSystemSizeChartData("female", t)));
    expect(SizeChartDataSchema.safeParse(data).success).toBe(true);
  });

  // #58's own trigger case: baseMeasurements:{} used to replace the whole
  // row and generation answered status:"ok" with NaN geometry -- this is the
  // same shape gap on the read side that validateSizeChartPatch closed on
  // the write side.
  it("rejects an emptied-out baseMeasurements", () => {
    const data = {
      ...buildSystemSizeChartData("female", t),
      baseMeasurements: {},
    };
    expect(SizeChartDataSchema.safeParse(data).success).toBe(false);
  });

  it("rejects an unrecognised gender", () => {
    const data = { ...buildSystemSizeChartData("female", t), gender: "banana" };
    expect(SizeChartDataSchema.safeParse(data).success).toBe(false);
  });

  it("tolerates a progressionRule that only sets some measurement keys", () => {
    const data = {
      ...buildSystemSizeChartData("female", t),
      progressionRule: { bust: 2 },
    };
    expect(SizeChartDataSchema.safeParse(data).success).toBe(true);
  });

  it("tolerates no overrides at all", () => {
    const data = { ...buildSystemSizeChartData("female", t), overrides: {} };
    expect(SizeChartDataSchema.safeParse(data).success).toBe(true);
  });
});
