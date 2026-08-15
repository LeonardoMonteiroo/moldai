import { describe, it, expect } from "vitest";
import { SIZE_TABLE, resolveMeasurements } from "./measurements";

describe("size table", () => {
  it("tem as 5 tamanhos com graduação monotônica de busto/cintura/quadril", () => {
    const order = ["PP", "P", "M", "G", "GG"] as const;
    for (let i = 1; i < order.length; i++) {
      const a = SIZE_TABLE[order[i - 1]];
      const b = SIZE_TABLE[order[i]];
      expect(b.busto).toBeGreaterThan(a.busto);
      expect(b.cintura).toBeGreaterThan(a.cintura);
      expect(b.quadril).toBeGreaterThan(a.quadril);
    }
    expect(SIZE_TABLE.M.busto).toBe(92);
  });

  it("resolve base do tamanho e aplica overrides", () => {
    const base = resolveMeasurements("M", {});
    expect(base.cintura).toBe(74);
    const custom = resolveMeasurements("M", { cintura: 68 });
    expect(custom.cintura).toBe(68);
    expect(custom.quadril).toBe(base.quadril);
  });
});
