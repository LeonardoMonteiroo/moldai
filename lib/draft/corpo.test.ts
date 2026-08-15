import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftCorpo } from "./corpo";
import { bbox, Pt } from "./core";

const M = resolveMeasurements("M", {});

describe("draftCorpo", () => {
  it("frente mais larga que altura razoável e escala com o busto", () => {
    const small = draftCorpo(resolveMeasurements("PP", {}), {});
    const big = draftCorpo(resolveMeasurements("GG", {}), {});
    expect(bbox(big.frente.outlineCm).w).toBeGreaterThan(bbox(small.frente.outlineCm).w);
  });

  it("decote V aprofunda mais que reto", () => {
    const deepestNeck = (pts: Pt[]) => {
      const b = bbox(pts);
      const cx = (b.minX + b.maxX) / 2;
      const central = pts.filter((p) => p[1] < b.h * 0.5 && Math.abs(p[0] - cx) < b.w * 0.35);
      return Math.max(...central.map((p) => p[1]));
    };

    const reto = draftCorpo(M, { decote: "reto" });
    const v = draftCorpo(M, { decote: "V", decoteProfundidadeCm: 8 });

    // Na frente V, o decote é mais profundo que nas costas
    expect(deepestNeck(v.frente.outlineCm)).toBeGreaterThan(
      deepestNeck(v.costas.outlineCm)
    );

    // V costas também é mais profundo que reto costas (porque V adiciona profundidade)
    expect(deepestNeck(v.costas.outlineCm)).toBeGreaterThan(
      deepestNeck(reto.costas.outlineCm)
    );

    // V frente contém detalhamento de decote
    expect(v.frente.detailRows.some((r) => /decote/i.test(r.label))).toBe(true);
  });

  it("expõe comprimento de cava positivo e casável", () => {
    const { armholeLenCm } = draftCorpo(M, {});
    expect(armholeLenCm).toBeGreaterThan(10);
  });

  it("gera pence quando pences=true", () => {
    expect(draftCorpo(M, { pences: true }).frente.dartCm?.length).toBeGreaterThanOrEqual(3);
  });
});
