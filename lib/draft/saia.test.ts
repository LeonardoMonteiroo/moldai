import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftSaia } from "./saia";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftSaia", () => {
  it("reta gera trapézio com 4 vértices e viewBox > 0", () => {
    const s = draftSaia(M, { saia: "reta" });
    expect(s.outlineCm.length).toBe(4);
    expect(bbox(s.outlineCm).w).toBeGreaterThan(0);
  });
  it("radial (circulo) marca cintura e barra como curvedSpans", () => {
    const s = draftSaia(M, { saia: "circulo" });
    expect((s.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("círculo: arco da cintura ~ cintura/4 (um quarto de peça) com raio cintura/2π", () => {
    const dp = draftSaia(M, { saia: "circulo", compSaiaCm: 60 });
    // metadado exposto nas linhas de detalhe: raio da cintura
    const raioRow = dp.detailRows.find((r) => /raio/i.test(r.label));
    expect(raioRow).toBeTruthy();
    const raio = parseFloat(raioRow!.value.replace(",", "."));
    expect(raio).toBeCloseTo(74 / (2 * Math.PI), 0);
  });
  it("godê tem barra mais larga que reta", () => {
    const reta = draftSaia(M, { saia: "reta", compSaiaCm: 60 });
    const gode = draftSaia(M, { saia: "gode", compSaiaCm: 60 });
    expect(bbox(gode.outlineCm).w).toBeGreaterThan(bbox(reta.outlineCm).w);
  });
  it("comprimento respeita compSaiaCm", () => {
    const curta = draftSaia(M, { saia: "reta", compSaiaCm: 40 });
    const longa = draftSaia(M, { saia: "reta", compSaiaCm: 90 });
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });
});
