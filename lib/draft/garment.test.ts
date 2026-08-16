import { describe, it, expect } from "vitest";
import { validateSpec, draftGarment, validateQuestions } from "./garment";

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

describe("validateQuestions", () => {
  it("mantém pergunta válida e deriva id estável", () => {
    const qs = validateQuestions([
      { label: "Gola", options: ["redonda", "V", "careca"], allowOther: true },
    ]);
    expect(qs).toHaveLength(1);
    expect(qs[0].id).toBe("q0");
    expect(qs[0].label).toBe("Gola");
    expect(qs[0].options).toEqual(["redonda", "V", "careca"]);
    expect(qs[0].allowOther).toBe(true);
  });
  it("limita a 4 perguntas", () => {
    const raw = Array.from({ length: 7 }, (_, i) => ({ label: `P${i}`, options: ["a", "b"] }));
    expect(validateQuestions(raw)).toHaveLength(4);
  });
  it("descarta pergunta com menos de 2 opções ou label vazio", () => {
    const qs = validateQuestions([
      { label: "", options: ["a", "b"] },
      { label: "Ok", options: ["só uma"] },
      { label: "Boa", options: ["a", "b"] },
    ]);
    expect(qs.map((q) => q.label)).toEqual(["Boa"]);
  });
  it("corta em 6 opções e limpa strings vazias/duplicadas", () => {
    const qs = validateQuestions([
      { label: "Muitas", options: ["a", "a", "", "b", "c", "d", "e", "f", "g"] },
    ]);
    expect(qs[0].options).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
  it("degrada para lista vazia quando nada é aproveitável", () => {
    expect(validateQuestions("lixo")).toEqual([]);
    expect(validateQuestions([{ label: "x", options: [] }])).toEqual([]);
  });
  it("allowOther default false quando ausente/inválido", () => {
    const qs = validateQuestions([{ label: "P", options: ["a", "b"] }]);
    expect(qs[0].allowOther).toBe(false);
  });
});
