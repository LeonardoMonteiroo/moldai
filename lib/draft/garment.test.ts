import { describe, it, expect } from "vitest";
import { validateSpec, draftGarment } from "./garment";

describe("validateSpec", () => {
  it("cai para defaults em enums inválidos e clampa faixas", () => {
    const s = validateSpec({ tipo: "foo", style: { saia: "xxx", compSaiaCm: 999, decoteProfundidadeCm: -5 }, measurementOverrides: { cintura: 70, hack: 1 } });
    expect(["blusa", "vestido", "saia"]).toContain(s.tipo);
    expect(s.style.compSaiaCm).toBeLessThanOrEqual(120);
    expect(s.style.decoteProfundidadeCm).toBeGreaterThanOrEqual(0);
    expect(s.measurementOverrides.hack).toBeUndefined();
    expect(s.measurementOverrides.cintura).toBe(70);
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
