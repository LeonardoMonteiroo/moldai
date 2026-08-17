import { describe, it, expect } from "vitest";
import {
  validateSpec,
  draftGarment,
  validateQuestions,
  draftPiecesCm,
} from "./garment";

describe("validateSpec", () => {
  it("cai para defaults em enums inválidos e clampa faixas", () => {
    const s = validateSpec({
      type: "foo",
      gender: "xx",
      style: { skirt: "xxx", skirtLengthCm: 999, necklineDepthCm: -5 },
      measurementOverrides: { waist: 70, hack: 1 },
    });
    expect(s.type).toBe("blouse");
    expect(s.gender).toBe("female");
    expect(s.style.skirt).toBe("straight");
    expect(s.style.skirtLengthCm).toBeLessThanOrEqual(120);
    expect(s.style.necklineDepthCm).toBeGreaterThanOrEqual(0);
    expect(s.measurementOverrides.hack).toBeUndefined();
    expect(s.measurementOverrides.waist).toBe(70);
  });
  it("aceita type tshirt e gender male", () => {
    const s = validateSpec({
      type: "tshirt",
      gender: "male",
      style: {},
      measurementOverrides: {},
    });
    expect(s.type).toBe("tshirt");
    expect(s.gender).toBe("male");
  });
  it("preserva zero válido em seamAllowanceCm", () => {
    expect(
      validateSpec({
        type: "skirt",
        style: { seamAllowanceCm: 0 },
        measurementOverrides: {},
      }).style.seamAllowanceCm,
    ).toBe(0);
  });
  it("clampa zero inválido em skirtLengthCm para limite inferior", () => {
    expect(
      validateSpec({
        type: "skirt",
        style: { skirtLengthCm: 0 },
        measurementOverrides: {},
      }).style.skirtLengthCm,
    ).toBe(25);
  });
  it("usa default para valores não-finitos", () => {
    expect(
      validateSpec({
        type: "skirt",
        style: { skirtLengthCm: "xxx" as unknown as number },
        measurementOverrides: {},
      }).style.skirtLengthCm,
    ).toBe(60);
  });
  it("clampa armholeDeepenCm a 0..6 e descarta sleeveRefit vindo da IA", () => {
    const s = validateSpec({
      type: "blouse",
      style: { armholeDeepenCm: 99, sleeveRefit: true },
      measurementOverrides: {},
    });
    expect(s.style.armholeDeepenCm).toBe(6);
    expect(s.style.sleeveRefit).toBeUndefined();
  });
  it("clampa armholeDeepenCm negativo para 0", () => {
    expect(
      validateSpec({
        type: "blouse",
        style: { armholeDeepenCm: -3 },
        measurementOverrides: {},
      }).style.armholeDeepenCm,
    ).toBe(0);
  });
});

describe("draftGarment", () => {
  it("blouse gera frente, costas e manga", () => {
    const { pieces } = draftGarment(
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", neckline: "V" },
      },
      "M",
    );
    expect(pieces.map((p) => p.id).sort()).toEqual([
      "body-back",
      "body-front",
      "sleeve",
    ]);
  });
  it("tshirt gera frente/costas/manga, sem pence, decote redondo", () => {
    const { pieces } = draftGarment(
      {
        type: "tshirt",
        gender: "male",
        measurementOverrides: {},
        style: {},
      },
      "M",
    );
    const ids = pieces.map((p) => p.id).sort();
    expect(ids).toEqual(["body-back", "body-front", "sleeve"]);
    const front = pieces.find((p) => p.id === "body-front")!;
    expect(front.dart).toBeUndefined();
    expect(front.detailRows.some((r) => /redondo/i.test(r.value))).toBe(true);
  });
  it("skirt gera só a peça de saia e viewBox > 0", () => {
    const { pieces, viewBox } = draftGarment(
      {
        type: "skirt",
        gender: "female",
        measurementOverrides: {},
        style: { skirt: "gore" },
      },
      "M",
    );
    expect(pieces.map((p) => p.id)).toEqual(["skirt"]);
    expect(viewBox.w).toBeGreaterThan(0);
  });
  it("dress combina corpo + saia", () => {
    const { pieces } = draftGarment(
      {
        type: "dress",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "none", skirt: "a-line" },
      },
      "M",
    );
    const ids = pieces.map((p) => p.id);
    expect(ids).toContain("skirt");
    expect(ids).toContain("body-front");
  });
  it("armholeDeepenCm faz a cava do corpo divergir da copa da manga (dispara seamCheck)", () => {
    const { armholeLenCm, sleeveArmholeCm } = draftGarment(
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", armholeDeepenCm: 2 },
      },
      "M",
    );
    expect(armholeLenCm! - sleeveArmholeCm!).toBeGreaterThan(1);
  });
  it("sem ajuste de cava, corpo e manga batem por construção (sem conflito)", () => {
    const { armholeLenCm, sleeveArmholeCm } = draftGarment(
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short" },
      },
      "M",
    );
    expect(Math.abs(armholeLenCm! - sleeveArmholeCm!)).toBeLessThan(1e-6);
  });
  it("sleeveRefit refaz a copa para a cava ajustada (costuras voltam a bater)", () => {
    const { armholeLenCm, sleeveArmholeCm } = draftGarment(
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", armholeDeepenCm: 2, sleeveRefit: true },
      },
      "M",
    );
    expect(Math.abs(armholeLenCm! - sleeveArmholeCm!)).toBeLessThan(1e-6);
  });
});

describe("draftPiecesCm", () => {
  it("devolve peças em cm (frente/costas/manga) para tshirt", () => {
    const pcs = draftPiecesCm(
      {
        type: "tshirt",
        gender: "male",
        measurementOverrides: {},
        style: {},
      },
      "M",
    );
    expect(pcs.map((p) => p.id)).toEqual(["body-front", "body-back", "sleeve"]);
    const front = pcs[0];
    // outlineCm em cm reais: largura da frente na casa de dezenas de cm, não centenas (px)
    const xs = front.outlineCm.map(([x]) => x);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeGreaterThan(20);
    expect(width).toBeLessThan(80);
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
    const raw = Array.from({ length: 7 }, (_, i) => ({
      label: `P${i}`,
      options: ["a", "b"],
    }));
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
      {
        label: "Muitas",
        options: ["a", "a", "", "b", "c", "d", "e", "f", "g"],
      },
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
