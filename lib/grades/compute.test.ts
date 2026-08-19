import { describe, it, expect } from "vitest";
import {
  resolveGradeSize,
  buildSizeTable,
  pickGradeForGeneration,
} from "./compute";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import type { GradeData, GradeRecord } from "@/lib/types";

function baseGrade(overrides: Partial<GradeData> = {}): GradeData {
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

describe("resolveGradeSize", () => {
  it("returns the base row unchanged at the base size", () => {
    const grade = baseGrade();
    expect(resolveGradeSize(grade, "M")).toEqual(grade.baseMeasurements);
  });

  it("applies the progression rule scaled by distance from the base", () => {
    const grade = baseGrade();
    expect(resolveGradeSize(grade, "G").bust).toBe(96); // +1 step
    expect(resolveGradeSize(grade, "PP").bust).toBe(84); // -2 steps
  });

  it("a manual override wins over the rule-derived value", () => {
    const grade = baseGrade({ overrides: { G: { bust: 99 } } });
    expect(resolveGradeSize(grade, "G").bust).toBe(99);
    expect(resolveGradeSize(grade, "G").waist).toBe(78); // unaffected field still rule-derived
  });

  it("clamps the resolved value to MEASUREMENT_RANGES", () => {
    const grade = baseGrade({ progressionRule: { shoulder: 50 } });
    expect(resolveGradeSize(grade, "GG").shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.max,
    );
  });

  it("treats a size not in the grid as step 0 from the base", () => {
    const grade = baseGrade();
    expect(resolveGradeSize(grade, "XX").bust).toBe(92);
  });
});

describe("buildSizeTable", () => {
  it("resolves every size in the grade", () => {
    const table = buildSizeTable(baseGrade());
    expect(Object.keys(table)).toEqual(["PP", "P", "M", "G", "GG"]);
    expect(table.M.bust).toBe(92);
    expect(table.G.bust).toBe(96);
  });
});

describe("pickGradeForGeneration", () => {
  function record(overrides: Partial<GradeRecord> = {}): GradeRecord {
    return {
      id: "g1",
      updatedAt: "2026-08-19T00:00:00.000Z",
      ...baseGrade(),
      ...overrides,
    };
  }

  it("uses the active grade when its gender matches", () => {
    const active = record({ id: "custom", isSystem: false, gender: "female" });
    const sysFemale = record({ id: "sys-f", isSystem: true, gender: "female" });
    const out = pickGradeForGeneration([active, sysFemale], "custom", "female");
    expect(out.id).toBe("custom");
  });

  it("falls back to the system grade for the requested gender when the active grade doesn't match", () => {
    const active = record({ id: "custom", isSystem: false, gender: "female" });
    const sysMale = record({ id: "sys-m", isSystem: true, gender: "male" });
    const out = pickGradeForGeneration([active, sysMale], "custom", "male");
    expect(out.id).toBe("sys-m");
  });

  it("falls back to any grade when there's no active id and no system match", () => {
    const only = record({ id: "only" });
    const out = pickGradeForGeneration([only], null, "male");
    expect(out.id).toBe("only");
  });
});
