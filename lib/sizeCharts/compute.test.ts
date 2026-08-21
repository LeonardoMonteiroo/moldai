import { describe, it, expect } from "vitest";
import {
  resolveSizeChartSize,
  buildSizeTable,
  pickSizeChartForGeneration,
} from "./compute";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import type { SizeChartData, SizeChartRecord } from "@/lib/types";

function baseChart(overrides: Partial<SizeChartData> = {}): SizeChartData {
  return {
    name: "Test",
    gender: "female",
    bodyType: "straight",
    isSystem: false,
    sizes: ["PP", "P", "M", "G", "GG"],
    baseSizeIndex: 2,
    baseMeasurements: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    },
    progressionRule: { bust: 4, waist: 4, hip: 4, shoulder: 0.5 },
    overrides: {},
    ...overrides,
  };
}

describe("resolveSizeChartSize", () => {
  it("returns the base row unchanged at the base size", () => {
    const chart = baseChart();
    expect(resolveSizeChartSize(chart, "M")).toEqual(chart.baseMeasurements);
  });

  it("applies the progression rule scaled by distance from the base", () => {
    const chart = baseChart();
    expect(resolveSizeChartSize(chart, "G").bust).toBe(96); // +1 step
    expect(resolveSizeChartSize(chart, "PP").bust).toBe(84); // -2 steps
  });

  it("a manual override wins over the rule-derived value", () => {
    const chart = baseChart({ overrides: { G: { bust: 99 } } });
    expect(resolveSizeChartSize(chart, "G").bust).toBe(99);
    expect(resolveSizeChartSize(chart, "G").waist).toBe(78); // unaffected field still rule-derived
  });

  it("clamps the resolved value to MEASUREMENT_RANGES", () => {
    const chart = baseChart({ progressionRule: { shoulder: 50 } });
    expect(resolveSizeChartSize(chart, "GG").shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.max,
    );
  });

  it("treats a size not in the grid as step 0 from the base", () => {
    const chart = baseChart();
    expect(resolveSizeChartSize(chart, "XX").bust).toBe(92);
  });
});

describe("buildSizeTable", () => {
  it("resolves every size in the chart", () => {
    const table = buildSizeTable(baseChart());
    expect(Object.keys(table)).toEqual(["PP", "P", "M", "G", "GG"]);
    expect(table.M.bust).toBe(92);
    expect(table.G.bust).toBe(96);
  });
});

describe("pickSizeChartForGeneration", () => {
  function record(overrides: Partial<SizeChartRecord> = {}): SizeChartRecord {
    return {
      id: "g1",
      updatedAt: "2026-08-19T00:00:00.000Z",
      ...baseChart(),
      ...overrides,
    };
  }

  it("uses the active chart when its gender matches", () => {
    const active = record({ id: "custom", isSystem: false, gender: "female" });
    const sysFemale = record({ id: "sys-f", isSystem: true, gender: "female" });
    const out = pickSizeChartForGeneration(
      [active, sysFemale],
      "custom",
      "female",
    );
    expect(out.chart.id).toBe("custom");
    expect(out.rejectedActive).toBeNull();
  });

  it("falls back to the system chart for the requested gender when the active chart doesn't match", () => {
    const active = record({ id: "custom", isSystem: false, gender: "female" });
    const sysMale = record({ id: "sys-m", isSystem: true, gender: "male" });
    const out = pickSizeChartForGeneration([active, sysMale], "custom", "male");
    expect(out.chart.id).toBe("sys-m");
  });

  it("falls back to any chart when there's no active id and no system match", () => {
    const only = record({ id: "only" });
    const out = pickSizeChartForGeneration([only], null, "male");
    expect(out.chart.id).toBe("only");
    expect(out.rejectedActive).toBeNull();
  });

  // The substitution was correct but completely silent: the caller had no way
  // to tell that the account's active chart had been passed over, so nothing
  // on screen could say so.
  it("reports the active chart it had to pass over", () => {
    const active = record({
      id: "custom",
      name: "Masculino adulto (cópia)",
      gender: "male",
    });
    const sysFemale = record({ id: "sys-f", isSystem: true, gender: "female" });
    const out = pickSizeChartForGeneration(
      [active, sysFemale],
      "custom",
      "female",
    );
    expect(out.chart.id).toBe("sys-f");
    expect(out.rejectedActive?.name).toBe("Masculino adulto (cópia)");
  });

  it("reports nothing rejected when the account has no active chart", () => {
    const sysFemale = record({ id: "sys-f", isSystem: true, gender: "female" });
    const out = pickSizeChartForGeneration([sysFemale], null, "female");
    expect(out.rejectedActive).toBeNull();
  });

  it("reports nothing rejected when the active chart is the one used", () => {
    const active = record({ id: "custom", gender: "female" });
    const out = pickSizeChartForGeneration([active], "custom", "female");
    expect(out.rejectedActive).toBeNull();
  });
});
