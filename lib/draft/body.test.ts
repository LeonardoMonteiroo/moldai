import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftBody, BlockOpts } from "./body";
import { bbox, Pt } from "./core";

const M = resolveMeasurements("M", {});
const optsM: BlockOpts = {
  gender: "female",
  knit: false,
  lengthCm: M.backLength + M.hipHeight + 5,
};

// menor y central = base do decote (frente/costas)
const neckDrop = (pts: Pt[]) => {
  const b = bbox(pts);
  const cx = (b.minX + b.maxX) / 2;
  const central = pts.filter(
    (p) => Math.abs(p[0] - cx) < b.w * 0.2 && p[1] < b.h * 0.5,
  );
  return Math.max(...central.map((p) => p[1]));
};

describe("draftBody sloper", () => {
  it("escala a largura com o busto", () => {
    const small = draftBody(resolveMeasurements("PP", {}), {});
    const big = draftBody(resolveMeasurements("GG", {}), {});
    expect(bbox(big.front.outlineCm).w).toBeGreaterThan(
      bbox(small.front.outlineCm).w,
    );
  });

  it("ombro tem caimento (ponta do ombro abaixo da HPS)", () => {
    const { front } = draftBody(M, {}, optsM);
    const b = bbox(front.outlineCm);
    const cx = (b.minX + b.maxX) / 2;
    // HPS: ponto mais alto perto do centro; ponta do ombro: ponto alto mais afastado
    const near = front.outlineCm.filter(
      (p) => Math.abs(p[0] - cx) < b.w * 0.25,
    );
    const far = front.outlineCm.filter((p) => Math.abs(p[0] - cx) > b.w * 0.3);
    const hpsY = Math.min(...near.map((p) => p[1]));
    const shoulderTipY = Math.min(...far.map((p) => p[1]));
    expect(shoulderTipY).toBeGreaterThan(hpsY);
  });

  it("comprimento chega ao quadril (blusa/camiseta)", () => {
    const { front } = draftBody(M, {}, optsM);
    expect(bbox(front.outlineCm).h).toBeCloseTo(optsM.lengthCm, 0);
  });

  it("decote frente mais fundo que costas; V > redondo > reto", () => {
    const reto = draftBody(M, { neckline: "straight" }, optsM);
    const red = draftBody(M, { neckline: "round" }, optsM);
    const v = draftBody(M, { neckline: "V", necklineDepthCm: 8 }, optsM);
    expect(neckDrop(v.front.outlineCm)).toBeGreaterThan(
      neckDrop(v.back.outlineCm),
    );
    expect(neckDrop(v.front.outlineCm)).toBeGreaterThan(
      neckDrop(red.front.outlineCm),
    );
    expect(neckDrop(red.front.outlineCm)).toBeGreaterThan(
      neckDrop(reto.front.outlineCm),
    );
  });

  it("marca decote e cava como curvedSpans", () => {
    const { front } = draftBody(M, {}, optsM);
    expect((front.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("expõe comprimento de cava casável", () => {
    expect(draftBody(M, {}, optsM).armholeLenCm).toBeGreaterThan(10);
  });

  it("gera pence quando darts=true (não-knit)", () => {
    expect(
      draftBody(M, { darts: true }, optsM).front.dartCm?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("barra reta e há arestas retas (invariante anti-balão)", () => {
    const { front } = draftBody(M, {}, optsM);
    const pts = front.outlineCm;
    const spans = front.curvedSpans ?? [];
    const n = pts.length;
    const edgeCurved = (i: number) =>
      spans.some(([a, b]) => i >= a && i + 1 <= b);

    // nem tudo é curva: existem arestas retas
    const curvedCount = Array.from({ length: n }, (_, i) =>
      edgeCurved(i),
    ).filter(Boolean).length;
    expect(curvedCount).toBeGreaterThan(0);
    expect(curvedCount).toBeLessThan(n);

    // a barra (aresta entre os dois pontos de y máximo, consecutivos) é reta
    const b = bbox(pts);
    const hemIdx = pts
      .map((p, i) => ({ i, y: p[1] }))
      .filter((o) => Math.abs(o.y - b.maxY) < 0.01)
      .map((o) => o.i)
      .sort((a, c) => a - c);
    expect(hemIdx).toHaveLength(2);
    expect(hemIdx[1] - hemIdx[0]).toBe(1);
    expect(edgeCurved(hemIdx[0])).toBe(false);
  });
});
