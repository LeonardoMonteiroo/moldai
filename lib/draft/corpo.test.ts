import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftCorpo, BlockOpts } from "./corpo";
import { bbox, Pt } from "./core";

const M = resolveMeasurements("M", {});
const optsM: BlockOpts = { sexo: "fem", knit: false, lengthCm: M.comprimentoCostas + M.alturaQuadril + 5 };

// menor y central = base do decote (frente/costas)
const neckDrop = (pts: Pt[]) => {
  const b = bbox(pts);
  const cx = (b.minX + b.maxX) / 2;
  const central = pts.filter((p) => Math.abs(p[0] - cx) < b.w * 0.2 && p[1] < b.h * 0.5);
  return Math.max(...central.map((p) => p[1]));
};

describe("draftCorpo sloper", () => {
  it("escala a largura com o busto", () => {
    const small = draftCorpo(resolveMeasurements("PP", {}), {});
    const big = draftCorpo(resolveMeasurements("GG", {}), {});
    expect(bbox(big.frente.outlineCm).w).toBeGreaterThan(bbox(small.frente.outlineCm).w);
  });

  it("ombro tem caimento (ponta do ombro abaixo da HPS)", () => {
    const { frente } = draftCorpo(M, {}, optsM);
    const b = bbox(frente.outlineCm);
    const cx = (b.minX + b.maxX) / 2;
    // HPS: ponto mais alto perto do centro; ponta do ombro: ponto alto mais afastado
    const near = frente.outlineCm.filter((p) => Math.abs(p[0] - cx) < b.w * 0.25);
    const far = frente.outlineCm.filter((p) => Math.abs(p[0] - cx) > b.w * 0.3);
    const hpsY = Math.min(...near.map((p) => p[1]));
    const shoulderTipY = Math.min(...far.map((p) => p[1]));
    expect(shoulderTipY).toBeGreaterThan(hpsY);
  });

  it("comprimento chega ao quadril (blusa/camiseta)", () => {
    const { frente } = draftCorpo(M, {}, optsM);
    expect(bbox(frente.outlineCm).h).toBeCloseTo(optsM.lengthCm, 0);
  });

  it("decote frente mais fundo que costas; V > redondo > reto", () => {
    const reto = draftCorpo(M, { decote: "reto" }, optsM);
    const red = draftCorpo(M, { decote: "redondo" }, optsM);
    const v = draftCorpo(M, { decote: "V", decoteProfundidadeCm: 8 }, optsM);
    expect(neckDrop(v.frente.outlineCm)).toBeGreaterThan(neckDrop(v.costas.outlineCm));
    expect(neckDrop(v.frente.outlineCm)).toBeGreaterThan(neckDrop(red.frente.outlineCm));
    expect(neckDrop(red.frente.outlineCm)).toBeGreaterThan(neckDrop(reto.frente.outlineCm));
  });

  it("marca decote e cava como curvedSpans", () => {
    const { frente } = draftCorpo(M, {}, optsM);
    expect((frente.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("expõe comprimento de cava casável", () => {
    expect(draftCorpo(M, {}, optsM).armholeLenCm).toBeGreaterThan(10);
  });

  it("gera pence quando pences=true (não-knit)", () => {
    expect(draftCorpo(M, { pences: true }, optsM).frente.dartCm?.length).toBeGreaterThanOrEqual(3);
  });
});
