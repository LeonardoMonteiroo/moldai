import { describe, it, expect } from "vitest";
import { outlineSegments, buildExportModel } from "./model";
import type { Pt } from "@/lib/draft/core";
import type { Pattern } from "@/lib/types";

describe("outlineSegments", () => {
  it("emite line em aresta fora de span e cubic dentro de span", () => {
    const pts: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const { start, segs } = outlineSegments(pts, [[1, 2]]); // curva só na aresta 1->2
    expect(start).toEqual({ x: 0, y: 0 });
    expect(segs).toHaveLength(4); // uma por aresta (fechado)
    expect(segs[0].kind).toBe("line");
    expect(segs[1].kind).toBe("cubic");
    expect(segs[2].kind).toBe("line");
    expect(segs[3].kind).toBe("line");
  });

  it("cai para polilinha de lines quando < 3 pontos", () => {
    const { segs } = outlineSegments([[0, 0], [5, 5]]);
    expect(segs.every((s) => s.kind === "line")).toBe(true);
  });
});

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
    pieces: [{ id: "x", name: "x", qty: 1, outline: { kind: "polygon", points: "0,0" }, label: { x: 0, y: 0 }, detailRows: [] }],
    spec: { tipo: "camiseta", sexo: "masc", measurementOverrides: {}, style: { folgaCosturaCm: 1.5 } },
  };
}

describe("buildExportModel", () => {
  it("monta model em cm com peças posicionadas e folga anotada", () => {
    const m = buildExportModel(fakePattern());
    expect(m.unit).toBe("cm");
    expect(m.size).toBe("M");
    expect(m.seamAllowanceCm).toBe(1.5);
    expect(m.sheetWidthCm).toBeGreaterThan(0);
    expect(m.sheetHeightCm).toBeGreaterThan(0);
    expect(m.pieces.length).toBeGreaterThanOrEqual(2);
    // origens crescem em x (peças lado a lado, sem sobreposição de origem)
    for (let i = 1; i < m.pieces.length; i++) {
      expect(m.pieces[i].originCm.x).toBeGreaterThan(m.pieces[i - 1].originCm.x);
    }
    // outline fechado começa no start e tem uma segmento por aresta
    const f = m.pieces[0];
    expect(f.widthCm).toBeGreaterThan(0);
    expect(f.outline.segs.length).toBeGreaterThanOrEqual(3);
  });

  it("usa folga default 1 quando style.folgaCosturaCm ausente", () => {
    const pat = fakePattern();
    pat.spec!.style = {};
    expect(buildExportModel(pat).seamAllowanceCm).toBe(1);
  });
});
