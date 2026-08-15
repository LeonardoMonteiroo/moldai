import { describe, it, expect } from "vitest";
import { SIZE_TABLE, SIZE_TABLE_MASC, MEASUREMENT_RANGES, resolveMeasurements } from "./measurements";

describe("size tables", () => {
  it("fem tem 5 tamanhos com graduação monotônica de busto/cintura/quadril", () => {
    const order = ["PP", "P", "M", "G", "GG"] as const;
    for (let i = 1; i < order.length; i++) {
      const a = SIZE_TABLE[order[i - 1]], b = SIZE_TABLE[order[i]];
      expect(b.busto).toBeGreaterThan(a.busto);
      expect(b.cintura).toBeGreaterThan(a.cintura);
      expect(b.quadril).toBeGreaterThan(a.quadril);
      expect(b.ombro).toBeGreaterThan(a.ombro);
    }
    expect(SIZE_TABLE.M.busto).toBe(92);
  });

  it("masc é mais largo no ombro que fem no mesmo tamanho", () => {
    expect(SIZE_TABLE_MASC.M.ombro).toBeGreaterThan(SIZE_TABLE.M.ombro);
    expect(SIZE_TABLE_MASC.M.busto).toBe(100);
  });

  it("resolve base do tamanho e aplica overrides (default fem)", () => {
    expect(resolveMeasurements("M", {}).cintura).toBe(74);
    expect(resolveMeasurements("M", { cintura: 68 }).cintura).toBe(68);
  });

  it("resolve pela tabela masculina quando sexo=masc", () => {
    expect(resolveMeasurements("M", {}, "masc").busto).toBe(100);
    expect(resolveMeasurements("M", {}, "fem").busto).toBe(92);
  });

  it("clampa ombro à nova faixa [14,26]", () => {
    expect(resolveMeasurements("M", { ombro: 99 }).ombro).toBe(MEASUREMENT_RANGES.ombro.max);
    expect(resolveMeasurements("M", { ombro: 1 }).ombro).toBe(MEASUREMENT_RANGES.ombro.min);
  });
});
