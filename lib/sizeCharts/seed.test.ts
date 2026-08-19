import { describe, it, expect } from "vitest";
import { buildSystemSizeChartData } from "./seed";
import { buildSizeTable } from "./compute";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";

const SIZES = ["PP", "P", "M", "G", "GG"] as const;

describe("buildSystemSizeChartData", () => {
  it("female chart's resolved size table exactly reproduces SIZE_TABLE", () => {
    const table = buildSizeTable(buildSystemSizeChartData("female"));
    for (const size of SIZES) {
      expect(table[size]).toEqual(SIZE_TABLE[size]);
    }
  });

  it("male chart's resolved size table exactly reproduces SIZE_TABLE_MALE", () => {
    const table = buildSizeTable(buildSystemSizeChartData("male"));
    for (const size of SIZES) {
      expect(table[size]).toEqual(SIZE_TABLE_MALE[size]);
    }
  });

  it("marks the seeded chart as isSystem with the base size at index 2 (M)", () => {
    const chart = buildSystemSizeChartData("female");
    expect(chart.isSystem).toBe(true);
    expect(chart.sizes[chart.baseSizeIndex]).toBe("M");
  });

  it("names the female and male charts distinctly", () => {
    expect(buildSystemSizeChartData("female").name).not.toBe(
      buildSystemSizeChartData("male").name,
    );
  });
});
