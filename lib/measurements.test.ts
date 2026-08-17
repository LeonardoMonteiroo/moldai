import { describe, it, expect } from "vitest";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  MEASUREMENT_RANGES,
  resolveMeasurements,
} from "./measurements";

describe("size tables", () => {
  it("fem tem 5 tamanhos com graduação monotônica de busto/cintura/quadril", () => {
    const order = ["PP", "P", "M", "G", "GG"] as const;
    for (let i = 1; i < order.length; i++) {
      const a = SIZE_TABLE[order[i - 1]],
        b = SIZE_TABLE[order[i]];
      expect(b.bust).toBeGreaterThan(a.bust);
      expect(b.waist).toBeGreaterThan(a.waist);
      expect(b.hip).toBeGreaterThan(a.hip);
      expect(b.shoulder).toBeGreaterThan(a.shoulder);
    }
    expect(SIZE_TABLE.M.bust).toBe(92);
  });

  it("masc é mais largo no ombro que fem no mesmo tamanho", () => {
    expect(SIZE_TABLE_MALE.M.shoulder).toBeGreaterThan(SIZE_TABLE.M.shoulder);
    expect(SIZE_TABLE_MALE.M.bust).toBe(100);
  });

  it("resolve base do tamanho e aplica overrides (default female)", () => {
    expect(resolveMeasurements("M", {}).waist).toBe(74);
    expect(resolveMeasurements("M", { waist: 68 }).waist).toBe(68);
  });

  it("resolve pela tabela masculina quando gender=male", () => {
    expect(resolveMeasurements("M", {}, "male").bust).toBe(100);
    expect(resolveMeasurements("M", {}, "female").bust).toBe(92);
  });

  it("clampa ombro à nova faixa [14,26]", () => {
    expect(resolveMeasurements("M", { shoulder: 99 }).shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.max,
    );
    expect(resolveMeasurements("M", { shoulder: 1 }).shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.min,
    );
  });
});
