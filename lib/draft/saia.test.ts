import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftSaia } from "./saia";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftSaia", () => {
  it("reta gera trapézio com 4 vértices e viewBox > 0", () => {
    const s = draftSaia(M, { skirt: "straight" });
    expect(s.outlineCm.length).toBe(4);
    expect(bbox(s.outlineCm).w).toBeGreaterThan(0);
  });
  it("radial (circulo) marca cintura e barra como curvedSpans", () => {
    const s = draftSaia(M, { skirt: "circle" });
    expect((s.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("círculo: arco da cintura ~ cintura/4 (um quarto de peça) com raio cintura/2π", () => {
    const dp = draftSaia(M, { skirt: "circle", skirtLengthCm: 60 });
    // metadado exposto nas linhas de detalhe: raio da cintura
    const raioRow = dp.detailRows.find((r) => /raio/i.test(r.label));
    expect(raioRow).toBeTruthy();
    const raio = parseFloat(raioRow!.value.replace(",", "."));
    expect(raio).toBeCloseTo(74 / (2 * Math.PI), 0);
  });
  it("godê tem barra mais larga que reta", () => {
    const reta = draftSaia(M, { skirt: "straight", skirtLengthCm: 60 });
    const gode = draftSaia(M, { skirt: "gore", skirtLengthCm: 60 });
    expect(bbox(gode.outlineCm).w).toBeGreaterThan(bbox(reta.outlineCm).w);
  });
  it("comprimento respeita skirtLengthCm", () => {
    const curta = draftSaia(M, { skirt: "straight", skirtLengthCm: 40 });
    const longa = draftSaia(M, { skirt: "straight", skirtLengthCm: 90 });
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });
});
