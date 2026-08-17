import { describe, it, expect } from "vitest";
import { outlineSegments, buildExportModel } from "./model";
import type { Pt } from "@/lib/draft/core";
import type { Pattern } from "@/lib/types";
import { t } from "@/lib/i18n/test-translate";

describe("outlineSegments", () => {
  it("emits line on an edge outside a span and cubic inside a span", () => {
    const pts: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const { start, segs } = outlineSegments(pts, [[1, 2]]); // only edge 1->2 is curved
    expect(start).toEqual({ x: 0, y: 0 });
    expect(segs).toHaveLength(4); // one per edge (closed)
    expect(segs[0].kind).toBe("line");
    expect(segs[1].kind).toBe("cubic");
    expect(segs[2].kind).toBe("line");
    expect(segs[3].kind).toBe("line");
  });

  it("falls back to a line-only polyline when < 3 points", () => {
    const { segs } = outlineSegments([
      [0, 0],
      [5, 5],
    ]);
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
      style: { seamAllowanceCm: 1.5 },
    },
  };
}

describe("buildExportModel", () => {
  it("builds a model in cm with positioned pieces and an annotated seam allowance", () => {
    const m = buildExportModel(fakePattern(), t);
    expect(m.unit).toBe("cm");
    expect(m.size).toBe("M");
    expect(m.seamAllowanceCm).toBe(1.5);
    expect(m.sheetWidthCm).toBeGreaterThan(0);
    expect(m.sheetHeightCm).toBeGreaterThan(0);
    expect(m.pieces.length).toBeGreaterThanOrEqual(2);
    // Shelf packing: no piece goes outside the sheet…
    for (const p of m.pieces) {
      expect(p.originCm.x).toBeGreaterThanOrEqual(0);
      expect(p.originCm.y).toBeGreaterThanOrEqual(0);
      expect(p.originCm.x + p.widthCm).toBeLessThanOrEqual(
        m.sheetWidthCm + 1e-6,
      );
      expect(p.originCm.y + p.heightCm).toBeLessThanOrEqual(
        m.sheetHeightCm + 1e-6,
      );
    }
    // …and two pieces never overlap (disjoint rectangles).
    for (let i = 0; i < m.pieces.length; i++) {
      for (let j = i + 1; j < m.pieces.length; j++) {
        const a = m.pieces[i];
        const b = m.pieces[j];
        const disjoint =
          a.originCm.x + a.widthCm <= b.originCm.x + 1e-6 ||
          b.originCm.x + b.widthCm <= a.originCm.x + 1e-6 ||
          a.originCm.y + a.heightCm <= b.originCm.y + 1e-6 ||
          b.originCm.y + b.heightCm <= a.originCm.y + 1e-6;
        expect(disjoint).toBe(true);
      }
    }
    // The sheet should be much less extreme than a single row (aspect < ~4:1).
    const aspect =
      Math.max(m.sheetWidthCm, m.sheetHeightCm) /
      Math.min(m.sheetWidthCm, m.sheetHeightCm);
    expect(aspect).toBeLessThan(4);
    // closed outline starts at start and has one segment per edge
    const f = m.pieces[0];
    expect(f.widthCm).toBeGreaterThan(0);
    expect(f.outline.segs.length).toBeGreaterThanOrEqual(3);
  });

  it("uses the default 1 seam allowance when style.seamAllowanceCm is absent", () => {
    const pat = fakePattern();
    pat.spec!.style = {};
    expect(buildExportModel(pat, t).seamAllowanceCm).toBe(1);
  });
});
