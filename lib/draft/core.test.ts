import { describe, it, expect } from "vitest";
import { autoLayout, bbox, polyPath, outlinePath, DraftedPiece } from "./core";

const rect = (id: string, w: number, h: number): DraftedPiece => ({
  id,
  name: id,
  qty: 1,
  outlineCm: [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ],
  detailRows: [],
});

describe("core drafting", () => {
  it("bbox measures the piece", () => {
    expect(
      bbox([
        [2, 3],
        [10, 3],
        [10, 20],
      ]),
    ).toEqual({ minX: 2, minY: 3, maxX: 10, maxY: 20, w: 8, h: 17 });
  });

  it("polyPath closes the polygon", () => {
    expect(
      polyPath([
        [0, 0],
        [1, 0],
        [1, 1],
      ]).kind,
    ).toBe("polygon");
  });

  it("autoLayout packs pieces without overlap inside the viewBox", () => {
    const { pieces, viewBox } = autoLayout(
      [rect("a", 10, 20), rect("b", 30, 40)],
      5,
    );
    expect(pieces).toHaveLength(2);
    expect(viewBox.w).toBeGreaterThan(0);
    expect(viewBox.h).toBeGreaterThan(0);
    const rects = pieces.map((p) => {
      const xs = p.vertices!.map((v) => v.x);
      const ys = p.vertices!.map((v) => v.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    });
    // every piece fits inside the packed viewBox
    for (const r of rects) {
      expect(r.minX).toBeGreaterThanOrEqual(0);
      expect(r.minY).toBeGreaterThanOrEqual(0);
      expect(r.maxX).toBeLessThanOrEqual(viewBox.w + 1e-6);
      expect(r.maxY).toBeLessThanOrEqual(viewBox.h + 1e-6);
    }
    // the two pieces never overlap (disjoint rectangles)
    const [a, b] = rects;
    const disjoint =
      a.maxX <= b.minX + 1e-6 ||
      b.maxX <= a.minX + 1e-6 ||
      a.maxY <= b.minY + 1e-6 ||
      b.maxY <= a.minY + 1e-6;
    expect(disjoint).toBe(true);
  });

  describe("outlinePath", () => {
    it("no spans: only straights (L), no C, closes with Z", () => {
      const o = outlinePath(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        [],
      ) as { kind: "path"; d: string };
      expect(o.kind).toBe("path");
      expect(o.d).not.toMatch(/C/);
      expect(o.d).toMatch(/L/);
      expect(o.d).toMatch(/Z$/);
    });

    it("with a span: the span's edges become C; the rest stay L", () => {
      // square; only the edge between v1 and v2 is curved (span [1,2])
      const o = outlinePath(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        [[1, 2]],
      ) as { kind: "path"; d: string };
      expect(o.d).toMatch(/C/);
      expect(o.d).toMatch(/L/);
      expect(o.d).toMatch(/Z$/);
    });

    it("closing span [k,n] curves the edge that returns to vertex 0", () => {
      const pts: [number, number][] = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ];
      const o = outlinePath(pts, [[3, 4]]) as { kind: "path"; d: string };
      // 4 vertices; span [3,4] covers edge 3->0 (closing)
      expect(o.d).toMatch(/C[^Z]*Z$/);
    });
  });

  // #87: the dart's path used to close with a trailing " Z", drawing a
  // fourth segment straight back along the base -- a marking line that
  // isn't part of the dart and mismatched every export format against the
  // AAMA exporter's own open polyline for the identical pattern.
  it("autoLayout draws the dart open -- no trailing Z, unlike the outline", () => {
    const withDart: DraftedPiece = {
      ...rect("back", 10, 20),
      dartCm: [
        [3, 2],
        [4, 6],
        [5, 2],
      ],
    };
    const { pieces } = autoLayout([withDart], 5);
    const piece = pieces[0];
    expect(piece.dart).toBeDefined();
    expect(piece.dart!.d).not.toMatch(/Z$/);
    // exactly 3 dart points -> 1 M + 2 L commands
    expect(piece.dart!.d.match(/[ML]/g)).toHaveLength(3);
  });

  it("autoLayout attaches vertices aligned to the outline's corners", () => {
    const { pieces } = autoLayout([rect("a", 10, 20)], 5);
    const p = pieces[0];
    expect(p.vertices).toBeDefined();
    expect(p.vertices).toHaveLength(4);
    // first vertex = first "x,y" pair from the polygon
    const [px, py] = (p.outline as { points: string }).points
      .split(" ")[0]
      .split(",")
      .map(Number);
    expect(p.vertices![0].x).toBeCloseTo(px, 1);
    expect(p.vertices![0].y).toBeCloseTo(py, 1);
  });
});
