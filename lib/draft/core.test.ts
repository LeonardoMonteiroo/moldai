import { describe, it, expect } from "vitest";
import {
  autoLayout,
  bbox,
  polyPath,
  outlinePath,
  DraftedPiece,
  notchAt,
  notchAtVertex,
  pointAndTangentAtCm,
  notchAtArcLengthCm,
  NOTCH_DEPTH_CM,
} from "./core";

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
  it("autoLayout draws each dart open -- no trailing Z, unlike the outline", () => {
    const withDart: DraftedPiece = {
      ...rect("back", 10, 20),
      dartsCm: [
        [
          [3, 2],
          [4, 6],
          [5, 2],
        ],
      ],
    };
    const { pieces } = autoLayout([withDart], 5);
    const piece = pieces[0];
    expect(piece.darts).toBeDefined();
    expect(piece.darts).toHaveLength(1);
    expect(piece.darts![0].d).not.toMatch(/Z$/);
    // exactly 3 dart points -> 1 M + 2 L commands
    expect(piece.darts![0].d.match(/[ML]/g)).toHaveLength(3);
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

// #124: notch geometry primitives.
describe("notch geometry", () => {
  it("notchAt points the inner end toward insideRef, at NOTCH_DEPTH_CM[type]", () => {
    // horizontal edge, interior below (larger y) -- e.g. a hem edge.
    const n = notchAt([5, 10], [1, 0], [5, 20], "single");
    expect(n.outerCm).toEqual([5, 10]);
    expect(n.innerCm[0]).toBeCloseTo(5, 5); // no horizontal drift
    expect(n.innerCm[1]).toBeGreaterThan(10); // moved toward insideRef (larger y)
    expect(Math.hypot(n.innerCm[0] - 5, n.innerCm[1] - 10)).toBeCloseTo(
      NOTCH_DEPTH_CM.single,
      6,
    );
  });

  it("notchAt flips the normal when insideRef is on the other side", () => {
    const below = notchAt([5, 10], [1, 0], [5, 20], "double");
    const above = notchAt([5, 10], [1, 0], [5, 0], "double");
    expect(below.innerCm[1]).toBeGreaterThan(10);
    expect(above.innerCm[1]).toBeLessThan(10);
    // same depth either way
    expect(Math.hypot(below.innerCm[0] - 5, below.innerCm[1] - 10)).toBeCloseTo(
      NOTCH_DEPTH_CM.double,
      6,
    );
  });

  it("depth is exactly NOTCH_DEPTH_CM for every type", () => {
    for (const type of ["single", "double", "triple"] as const) {
      const n = notchAt([0, 0], [1, 0], [0, 1], type);
      expect(Math.hypot(...n.innerCm)).toBeCloseTo(NOTCH_DEPTH_CM[type], 6);
    }
  });

  it("notchAtVertex derives the tangent from the vertex's own neighbours", () => {
    // a straight horizontal run: neighbours are collinear, so the tangent
    // is exactly (2,0) and the notch sits exactly at the middle vertex.
    const pts: [number, number][] = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
    ];
    const n = notchAtVertex(pts, 1, [5, 20], "single");
    expect(n.outerCm).toEqual([5, 0]);
    expect(n.innerCm[1]).toBeGreaterThan(0); // toward insideRef
  });

  it("pointAndTangentAtCm walks a straight edge to the requested distance", () => {
    const pts: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    const { point, tangent } = pointAndTangentAtCm(pts, [], 0, 1, 4);
    expect(point[0]).toBeCloseTo(4, 5);
    expect(point[1]).toBeCloseTo(0, 5);
    expect(tangent[0]).toBeGreaterThan(0);
    expect(tangent[1]).toBeCloseTo(0, 5);
  });

  it("pointAndTangentAtCm clamps to the endpoint when distCm exceeds the segment", () => {
    const pts: [number, number][] = [
      [0, 0],
      [10, 0],
    ];
    const { point } = pointAndTangentAtCm(pts, [], 0, 1, 999);
    expect(point).toEqual([10, 0]);
  });

  it("pointAndTangentAtCm lands exactly on `from` at distCm=0", () => {
    const pts: [number, number][] = [
      [3, 3],
      [10, 3],
    ];
    const { point } = pointAndTangentAtCm(pts, [], 0, 1, 0);
    expect(point).toEqual([3, 3]);
  });

  it("notchAtArcLengthCm combines the walk and the orientation", () => {
    const pts: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const n = notchAtArcLengthCm(pts, [], 0, 1, 3, [5, 5], "triple");
    expect(n.outerCm[0]).toBeCloseTo(3, 5);
    expect(n.outerCm[1]).toBeCloseTo(0, 5);
    expect(n.innerCm[1]).toBeGreaterThan(0); // biased toward insideRef (below)
    expect(
      Math.hypot(n.innerCm[0] - n.outerCm[0], n.innerCm[1] - n.outerCm[1]),
    ).toBeCloseTo(NOTCH_DEPTH_CM.triple, 6);
  });
});

// #124: place() (already exercised indirectly by autoLayout above) also
// carries a piece's notches into px space, translated by the same (dx,dy)
// as every other decoration.
describe("autoLayout carries notches into px space", () => {
  it("translates outer/inner cm points into the piece's placed px position", () => {
    const withNotch: DraftedPiece = {
      ...rect("front", 10, 20),
      notches: [
        {
          type: "single",
          outerCm: [5, 0],
          innerCm: [5, 0.3],
        },
      ],
    };
    const { pieces } = autoLayout([withNotch], 5);
    const piece = pieces[0];
    expect(piece.notches).toHaveLength(1);
    const n = piece.notches![0];
    expect(n.type).toBe("single");
    // the notch is a short line whose length equals NOTCH_DEPTH_CM.single in
    // px (SCALE px/cm), unaffected by translation.
    const SCALE = 4;
    expect(Math.hypot(n.x2 - n.x1, n.y2 - n.y1)).toBeCloseTo(
      NOTCH_DEPTH_CM.single * SCALE,
      1,
    );
  });
});
