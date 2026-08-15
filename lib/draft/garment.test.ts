import { describe, it, expect } from "vitest";
import { validateSpec, draftGarment } from "./garment";

describe("validateSpec", () => {
  it("cai para defaults em enums inválidos e clampa faixas", () => {
    const s = validateSpec({ tipo: "foo", style: { saia: "xxx", compSaiaCm: 999, decoteProfundidadeCm: -5 }, measurementOverrides: { cintura: 70, hack: 1 } });
    expect(s.tipo).toBe("blusa");
    expect(s.style.saia).toBe("reta");
    expect(s.style.compSaiaCm).toBeLessThanOrEqual(120);
    expect(s.style.decoteProfundidadeCm).toBeGreaterThanOrEqual(0);
    expect(s.measurementOverrides.hack).toBeUndefined();
    expect(s.measurementOverrides.cintura).toBe(70);
  });

  it("preserva zero válido em folgaCosturaCm", () => {
    const s = validateSpec({ tipo: "saia", style: { folgaCosturaCm: 0 }, measurementOverrides: {} });
    expect(s.style.folgaCosturaCm).toBe(0);
  });

  it("clampa zero inválido em compSaiaCm para limite inferior", () => {
    const s = validateSpec({ tipo: "saia", style: { compSaiaCm: 0 }, measurementOverrides: {} });
    expect(s.style.compSaiaCm).toBe(25);
  });

  it("usa default para valores não-finitos", () => {
    const s = validateSpec({ tipo: "saia", style: { compSaiaCm: "xxx" as unknown as number }, measurementOverrides: {} });
    expect(s.style.compSaiaCm).toBe(60);
  });
});

describe("draftGarment", () => {
  it("blusa gera frente, costas e manga", () => {
    const { pieces } = draftGarment({ tipo: "blusa", measurementOverrides: {}, style: { manga: "curta", decote: "V" } }, "M");
    const ids = pieces.map((p) => p.id).sort();
    expect(ids).toEqual(["corpo-costas", "corpo-frente", "manga"]);
  });
  it("saia gera só a peça de saia e viewBox > 0", () => {
    const { pieces, viewBox } = draftGarment({ tipo: "saia", measurementOverrides: {}, style: { saia: "gode" } }, "M");
    expect(pieces.map((p) => p.id)).toEqual(["saia"]);
    expect(viewBox.w).toBeGreaterThan(0);
  });
  it("vestido combina corpo + saia", () => {
    const { pieces } = draftGarment({ tipo: "vestido", measurementOverrides: {}, style: { manga: "sem", saia: "evase" } }, "M");
    expect(pieces.map((p) => p.id)).toContain("saia");
    expect(pieces.map((p) => p.id)).toContain("corpo-frente");
  });
});
