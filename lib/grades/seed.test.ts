import { describe, it, expect } from "vitest";
import { buildSystemGradeData } from "./seed";
import { buildSizeTable } from "./compute";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";

const SIZES = ["PP", "P", "M", "G", "GG"] as const;

describe("buildSystemGradeData", () => {
  it("female grade's resolved size table exactly reproduces SIZE_TABLE", () => {
    const table = buildSizeTable(buildSystemGradeData("female"));
    for (const size of SIZES) {
      expect(table[size]).toEqual(SIZE_TABLE[size]);
    }
  });

  it("male grade's resolved size table exactly reproduces SIZE_TABLE_MALE", () => {
    const table = buildSizeTable(buildSystemGradeData("male"));
    for (const size of SIZES) {
      expect(table[size]).toEqual(SIZE_TABLE_MALE[size]);
    }
  });

  it("marks the seeded grade as isSystem with the base size at index 2 (M)", () => {
    const grade = buildSystemGradeData("female");
    expect(grade.isSystem).toBe(true);
    expect(grade.sizes[grade.baseSizeIndex]).toBe("M");
  });

  it("names the female and male grades distinctly", () => {
    expect(buildSystemGradeData("female").name).not.toBe(
      buildSystemGradeData("male").name,
    );
  });
});
