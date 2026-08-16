import { describe, it, expect } from "vitest";
import { validateSpec, draftGarment } from "./garment";

describe("validateSpec", () => {
  it("cai para defaults em enums inválidos e clampa faixas", () => {
    const s = validateSpec({ tipo: "foo", sexo: "xx", style: { saia: "xxx", compSaiaCm: 999, decoteProfundidadeCm: -5 }, measurementOverrides: { cintura: 70, hack: 1 } });
    expect(s.tipo).toBe("blusa");
    expect(s.sexo).toBe("fem");
    expect(s.style.saia).toBe("reta");
    expect(s.style.compSaiaCm).toBeLessThanOrEqual(120);
    expect(s.style.decoteProfundidadeCm).toBeGreaterThanOrEqual(0);
    expect(s.measurementOverrides.hack).toBeUndefined();
    expect(s.measurementOverrides.cintura).toBe(70);
  });
  it("aceita tipo camiseta e sexo masc", () => {
    const s = validateSpec({ tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} });
    expect(s.tipo).toBe("camiseta");
    expect(s.sexo).toBe("masc");
  });
  it("preserva zero válido em folgaCosturaCm", () => {
    expect(validateSpec({ tipo: "saia", style: { folgaCosturaCm: 0 }, measurementOverrides: {} }).style.folgaCosturaCm).toBe(0);
  });
  it("clampa zero inválido em compSaiaCm para limite inferior", () => {
    expect(validateSpec({ tipo: "saia", style: { compSaiaCm: 0 }, measurementOverrides: {} }).style.compSaiaCm).toBe(25);
  });
  it("usa default para valores não-finitos", () => {
    expect(validateSpec({ tipo: "saia", style: { compSaiaCm: "xxx" as unknown as number }, measurementOverrides: {} }).style.compSaiaCm).toBe(60);
  });
});

describe("draftGarment", () => {
  it("blusa gera frente, costas e manga", () => {
    const { pieces } = draftGarment({ tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: { manga: "curta", decote: "V" } }, "M");
    expect(pieces.map((p) => p.id).sort()).toEqual(["corpo-costas", "corpo-frente", "manga"]);
  });
  it("camiseta gera frente/costas/manga, sem pence, decote redondo", () => {
    const { pieces } = draftGarment({ tipo: "camiseta", sexo: "masc", measurementOverrides: {}, style: {} }, "M");
    const ids = pieces.map((p) => p.id).sort();
    expect(ids).toEqual(["corpo-costas", "corpo-frente", "manga"]);
    const frente = pieces.find((p) => p.id === "corpo-frente")!;
    expect(frente.dart).toBeUndefined();
    expect(frente.detailRows.some((r) => /redondo/i.test(r.value))).toBe(true);
  });
  it("saia gera só a peça de saia e viewBox > 0", () => {
    const { pieces, viewBox } = draftGarment({ tipo: "saia", sexo: "fem", measurementOverrides: {}, style: { saia: "gode" } }, "M");
    expect(pieces.map((p) => p.id)).toEqual(["saia"]);
    expect(viewBox.w).toBeGreaterThan(0);
  });
  it("vestido combina corpo + saia", () => {
    const { pieces } = draftGarment({ tipo: "vestido", sexo: "fem", measurementOverrides: {}, style: { manga: "sem", saia: "evase" } }, "M");
    const ids = pieces.map((p) => p.id);
    expect(ids).toContain("saia");
    expect(ids).toContain("corpo-frente");
  });
});
