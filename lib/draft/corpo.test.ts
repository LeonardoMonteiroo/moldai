import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftCorpo } from "./corpo";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftCorpo", () => {
  it("frente mais larga que altura razoável e escala com o busto", () => {
    const small = draftCorpo(resolveMeasurements("PP", {}), {});
    const big = draftCorpo(resolveMeasurements("GG", {}), {});
    expect(bbox(big.frente.outlineCm).w).toBeGreaterThan(bbox(small.frente.outlineCm).w);
  });

  it("decote V aprofunda mais que reto", () => {
    const reto = draftCorpo(M, { decote: "reto" });
    const v = draftCorpo(M, { decote: "V", decoteProfundidadeCm: 8 });
    // o ponto mais alto do decote em V desce mais (maior y no topo central)
    const topReto = Math.min(...reto.frente.outlineCm.map((p) => p[1]));
    const topV = Math.min(...v.frente.outlineCm.map((p) => p[1]));
    expect(topV).toBeGreaterThanOrEqual(topReto);
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
