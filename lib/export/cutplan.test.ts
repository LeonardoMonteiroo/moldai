import { describe, it, expect } from "vitest";
import { planCutLayout } from "./cutplan";
import { buildExportModel } from "./model";
import type { Pattern } from "@/lib/types";
import { t } from "@/lib/i18n/test-translate";

function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta Teste",
    version: 1,
    savedAgo: "agora",
    baseSize: "M",
    unit: "cm",
    sizesApplied: [],
    sizesPending: [],
    pieces: [
      {
        id: "x",
        name: "x",
        qty: 1,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
    ],
    spec: {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: { seamAllowanceCm: 1 },
    },
  };
}

describe("planCutLayout", () => {
  it("expande as peças pela quantidade a cortar", () => {
    const pat = fakePattern();
    const qtySum = buildExportModel(pat, t).pieces.reduce(
      (s, p) => s + p.qty,
      0,
    );
    const plan = planCutLayout(pat, 150, t);
    expect(plan.instances.length).toBe(qtySum);
    expect(qtySum).toBeGreaterThanOrEqual(2); // camiseta = frente/costas/manga(s)
  });

  it("todas as cópias cabem na largura do tecido, sem overflow", () => {
    const plan = planCutLayout(fakePattern(), 150, t);
    expect(plan.overflow).toBe(false);
    for (const it of plan.instances) {
      expect(it.originCm.x).toBeGreaterThanOrEqual(0);
      expect(it.originCm.x + it.widthCm).toBeLessThanOrEqual(
        plan.fabricWidthCm + 1e-6,
      );
    }
  });

  it("nenhuma cópia se sobrepõe (retângulos disjuntos)", () => {
    const { instances } = planCutLayout(fakePattern(), 150, t);
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        const a = instances[i];
        const b = instances[j];
        const disjoint =
          a.originCm.x + a.widthCm <= b.originCm.x + 1e-6 ||
          b.originCm.x + b.widthCm <= a.originCm.x + 1e-6 ||
          a.originCm.y + a.heightCm <= b.originCm.y + 1e-6 ||
          b.originCm.y + b.heightCm <= a.originCm.y + 1e-6;
        expect(disjoint).toBe(true);
      }
    }
  });

  it("comprimento e aproveitamento coerentes; eficiência em (0,1]", () => {
    const plan = planCutLayout(fakePattern(), 150, t);
    expect(plan.lengthCm).toBeGreaterThan(0);
    expect(plan.efficiency).toBeGreaterThan(0);
    expect(plan.efficiency).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("tecido mais estreito consome comprimento >= tecido mais largo", () => {
    const narrow = planCutLayout(fakePattern(), 140, t).lengthCm;
    const wide = planCutLayout(fakePattern(), 160, t).lengthCm;
    expect(narrow).toBeGreaterThanOrEqual(wide - 1e-6);
  });
});
