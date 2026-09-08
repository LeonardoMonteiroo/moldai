import { describe, it, expect } from "vitest";
import {
  autoLayout,
  bbox,
  polyPath,
  outlinePath,
  catmullRomSegments,
  DraftedPiece,
  notchAt,
  notchAtVertex,
  pointAndTangentAtCm,
  notchAtArcLengthCm,
  NOTCH_DEPTH_CM,
  insertVertexAt,
  OutlineAnchors,
  WRAP,
  curveArcLengthCm,
} from "./core";
import { getEngine } from "./engine/registry";
import { walkSeamPairs, SeamEdgeRef } from "./seams";
import { DECORATION_CASES } from "./fixtures";
import { SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";

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

  // #86: catmullRomSegments is the one Catmull-Rom-to-Bézier implementation
  // outlinePath (this file) and lib/export/model.ts's outlineSegments now
  // both adapt -- these tests pin its own tangent math directly, in the
  // caller-agnostic point/segment shape, so a change to the formula shows up
  // here rather than only as a diff between the two adapters.
  describe("catmullRomSegments", () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];

    it("emits one line seg per edge when no span covers it", () => {
      const { start, segs } = catmullRomSegments(square, []);
      expect(start).toEqual([0, 0]);
      expect(segs).toHaveLength(4);
      expect(segs.every((s) => s.kind === "line")).toBe(true);
      expect(segs[0]).toEqual({ kind: "line", to: [10, 0] });
    });

    it("emits a cubic only for the edge(s) inside curvedSpans", () => {
      const { segs } = catmullRomSegments(square, [[1, 2]]);
      expect(segs[0].kind).toBe("line"); // edge 0->1
      expect(segs[1].kind).toBe("cubic"); // edge 1->2 (the span)
      expect(segs[2].kind).toBe("line"); // edge 2->3
      expect(segs[3].kind).toBe("line"); // edge 3->0
    });

    // Pins the exact tangent formula -- p0/p3 locked to the span's own edge
    // endpoints (not pulled from outside the span), c1/c2 offset by
    // (neighbour - opposite)/6. Perturbing the divisor, the sign, or which
    // neighbour feeds p0/p3 must fail this test.
    it("computes the exact Catmull-Rom control points for a locked-tangent span", () => {
      const { segs } = catmullRomSegments(square, [[0, 1]]);
      const seg = segs[0];
      if (seg.kind !== "cubic") throw new Error("expected a cubic segment");
      // span is [0,1] -> i===a===0 so p0=p1=[0,0]; i+1===b===1 so p3=p2=[10,0]
      // c1 = p1 + (p2 - p0)/6 = [0,0] + ([10,0]-[0,0])/6 = [10/6, 0]
      // c2 = p2 - (p3 - p1)/6 = [10,0] - ([10,0]-[0,0])/6 = [50/6, 0]
      expect(seg.c1[0]).toBeCloseTo(10 / 6, 10);
      expect(seg.c1[1]).toBeCloseTo(0, 10);
      expect(seg.c2[0]).toBeCloseTo(50 / 6, 10);
      expect(seg.c2[1]).toBeCloseTo(0, 10);
      expect(seg.to).toEqual([10, 0]);
    });

    it("pulls p0/p3 from the outline's real neighbours for an interior span edge", () => {
      // A hexagon with a 3-edge span [0,3] (covers edges 0->1, 1->2, 2->3):
      // the middle edge (i=1, seg index 1) is bounded on both sides by
      // OTHER edges still inside the span, so its p0/p3 come from the
      // outline's own neighbouring vertices (at(0), at(3)) rather than being
      // locked to the edge's own p1/p2 the way a span boundary edge is.
      const hexagon: [number, number][] = [
        [0, 0],
        [10, 0],
        [15, 5],
        [10, 10],
        [0, 10],
        [-5, 5],
      ];
      const { segs } = catmullRomSegments(hexagon, [[0, 3]]);
      const seg = segs[1]; // edge i=1: p1=at(1), p2=at(2)
      if (seg.kind !== "cubic") throw new Error("expected a cubic segment");
      const p0 = hexagon[0]; // at(i-1) = at(0)
      const p1 = hexagon[1];
      const p2 = hexagon[2];
      const p3 = hexagon[3]; // at(i+2) = at(3)
      expect(seg.c1[0]).toBeCloseTo(p1[0] + (p2[0] - p0[0]) / 6, 10);
      expect(seg.c1[1]).toBeCloseTo(p1[1] + (p2[1] - p0[1]) / 6, 10);
      expect(seg.c2[0]).toBeCloseTo(p2[0] - (p3[0] - p1[0]) / 6, 10);
      expect(seg.c2[1]).toBeCloseTo(p2[1] - (p3[1] - p1[1]) / 6, 10);
    });
  });

  // #87: the dart's path used to close with a trailing " Z", drawing a
  // fourth segment straight back along the base -- a marking line that
  // isn't part of the dart and mismatched every export format against the
  // AAMA exporter's own open polyline for the identical pattern.
  it("autoLayout draws each dart open -- no trailing Z, unlike the outline", () => {
    const withDart: DraftedPiece = {
      ...rect("back", 10, 20),
      internalsCm: [
        {
          kind: "dart",
          ptsCm: [
            [3, 2],
            [4, 6],
            [5, 2],
          ],
        },
      ],
    };
    const { pieces } = autoLayout([withDart], 5);
    const piece = pieces[0];
    const darts = (piece.internals ?? []).filter((e) => e.kind === "dart");
    expect(darts).toHaveLength(1);
    const dart = darts[0];
    if (dart.kind !== "dart") throw new Error("expected a dart entry");
    expect(dart.d).not.toMatch(/Z$/);
    // exactly 3 dart points -> 1 M + 2 L commands
    expect(dart.d.match(/[ML]/g)).toHaveLength(3);
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

// #251: OutlineAnchors -- the name-addressed handle a drafter uses instead
// of scattering raw outline indices across seamEdges/curvedSpans.
describe("OutlineAnchors (#251)", () => {
  it("set() returns the index unchanged and at() round-trips it", () => {
    const anchors = new OutlineAnchors();
    expect(anchors.set("a", 3)).toBe(3);
    expect(anchors.at("a")).toBe(3);
  });

  it("at() throws on an unknown name instead of silently returning undefined", () => {
    const anchors = new OutlineAnchors();
    expect(() => anchors.at("nope")).toThrow(/nope/);
  });

  it("edge() builds a [from, to] range from two named anchors", () => {
    const anchors = new OutlineAnchors();
    anchors.set("cf", 0);
    anchors.set("hpsL", 2);
    expect(anchors.edge("cf", "hpsL", 10)).toEqual([0, 2]);
  });

  it("edge() resolves the WRAP sentinel to the outline's own length, not a named anchor", () => {
    const anchors = new OutlineAnchors();
    anchors.set("hemCenter", 7);
    expect(anchors.edge("hemCenter", WRAP, 8)).toEqual([7, 8]);
  });

  it('a real anchor literally named "wrap" is not swallowed by the WRAP sentinel', () => {
    const anchors = new OutlineAnchors();
    anchors.set("cf", 0);
    anchors.set("wrap", 3); // a legitimate anchor name that collides with the old string sentinel
    expect(anchors.edge("cf", "wrap", 8)).toEqual([0, 3]); // resolves the NAME, not WRAP's outlineLength
  });

  it("shiftFrom() bumps every anchor at or after the given index", () => {
    const anchors = new OutlineAnchors();
    anchors.set("before", 2);
    anchors.set("atCut", 5);
    anchors.set("after", 9);
    anchors.shiftFrom(5);
    expect(anchors.at("before")).toBe(2); // untouched -- strictly before
    expect(anchors.at("atCut")).toBe(6); // at the cut -- shifted
    expect(anchors.at("after")).toBe(10); // after the cut -- shifted
  });
});

// #251: insertVertexAt -- the sibling mechanism for a vertex inserted into
// an already-drafted piece (a future pocket/placket/style-line cut), which
// remaps seamEdges/foldEdge/curvedSpans in one place.
describe("insertVertexAt (#251)", () => {
  const piece: DraftedPiece = {
    id: "p",
    name: "p",
    qty: 1,
    detailRows: [],
    outlineCm: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    curvedSpans: [[2, 3]], // covers edge 2->3
    foldEdge: [0, 3],
    seamEdges: {
      before: [0, 1], // both endpoints at or before the insertion point
      immediatelyAfter: [2, 3], // both endpoints after it
      spanning: [1, 3], // straddles it
      closing: [3, 4], // uses the "wraps to vertex 0" sentinel (length 4)
    },
  };

  it("inserts the new point right after `afterIdx`", () => {
    const patched = insertVertexAt(piece, 1, [5, 0]);
    expect(patched.outlineCm).toEqual([
      [0, 0],
      [10, 0],
      [5, 0],
      [10, 10],
      [0, 10],
    ]);
  });

  it("leaves a range whose `to` lands exactly ON the cut untouched", () => {
    const patched = insertVertexAt(piece, 1, [5, 0]);
    expect(patched.seamEdges!.before).toEqual([0, 1]);
  });

  it("shifts a range that starts strictly after the cut, both ends", () => {
    const patched = insertVertexAt(piece, 1, [5, 0]);
    expect(patched.seamEdges!.immediatelyAfter).toEqual([3, 4]);
  });

  it("shifts a range straddling the cut by growing its `to`", () => {
    const patched = insertVertexAt(piece, 1, [5, 0]);
    expect(patched.seamEdges!.spanning).toEqual([1, 4]);
  });

  it("shifts the closing 'wraps to vertex 0' sentinel to the new length", () => {
    const patched = insertVertexAt(piece, 1, [5, 0]);
    expect(patched.seamEdges!.closing).toEqual([4, 5]);
  });

  it("shifts foldEdge and curvedSpans the same way", () => {
    const patched = insertVertexAt(piece, 1, [5, 0]);
    expect(patched.foldEdge).toEqual([0, 4]);
    expect(patched.curvedSpans).toEqual([[3, 4]]);
  });

  it("does not mutate the original piece", () => {
    insertVertexAt(piece, 1, [5, 0]);
    expect(piece.outlineCm).toHaveLength(4);
    expect(piece.seamEdges!.spanning).toEqual([1, 3]);
  });

  // #251's own acceptance criterion: inserting a vertex mid-edge on a real
  // drafted DECORATION_CASES piece must not perturb any declared seam pair's
  // measured length -- the exact failure mode raw index tables invite (an
  // insertion the developer forgot to thread through every other table
  // silently measures the wrong arc, which walkSeamPairs would report as a
  // false "closes as designed"/false conflict).
  //
  // Note on what's re-declared vs. reused: `seamPairs` (garment.ts's
  // SeamPairDecl list) is itself a SNAPSHOT of each piece's seamEdges at the
  // moment draftAll ran, captured as raw `{from, to}` numbers with no name
  // attached -- by design, garment.ts only ever reads seamEdges once, after
  // every piece is FULLY drafted (including any insertion a drafter makes
  // while building it), so a real caller never has a stale snapshot to
  // begin with. This test's own insertion happens AFTER that snapshot (it's
  // simulating a future edit to an already-generated piece, e.g. a
  // pocket/placket cut), so it re-declares each pair's refs from the
  // PATCHED piece's own CURRENT seamEdges -- keyed by matching the pair's
  // original {from, to} back to the seamEdges name it came from -- rather
  // than asserting on the now-stale snapshot itself.
  it("leaves every declared seam pair's measured length unchanged after a collinear mid-edge insertion", () => {
    const [, spec] = DECORATION_CASES.find(
      ([label]) => label === "blouse straight sleeveless",
    )!;
    const baseRow = SIZE_TABLE.M;
    const { drafted, seamPairs } = getEngine("moldai").draft(spec, baseRow, t);
    expect(seamPairs.length).toBeGreaterThan(0);

    const front = drafted.find((p) => p.id === "body-front");
    if (!front?.seamEdges) throw new Error("expected a body-front piece");
    const [from, to] = front.seamEdges.side;
    // The side seam is always a straight run (never inside a curvedSpan),
    // so its first segment's own midpoint is collinear with both
    // neighbours -- the outline's drawn shape is unchanged by inserting it.
    const [x1, y1] = front.outlineCm[from];
    const [x2, y2] = front.outlineCm[from + 1 <= to ? from + 1 : to];
    const midpoint: [number, number] = [(x1 + x2) / 2, (y1 + y2) / 2];
    const patchedFront = insertVertexAt(front, from, midpoint);

    // Every one of this piece's own named seamEdges ranges -- not just the
    // one we inserted into -- still measures the SAME arc length.
    for (const key of Object.keys(front.seamEdges)) {
      const beforeLen = curveArcLengthCm(
        front.outlineCm,
        front.curvedSpans ?? [],
        ...front.seamEdges[key],
      );
      const afterLen = curveArcLengthCm(
        patchedFront.outlineCm,
        patchedFront.curvedSpans ?? [],
        ...patchedFront.seamEdges![key],
      );
      expect(afterLen).toBeCloseTo(beforeLen, 2); // within 0.005cm
    }

    // Re-declare the whole-garment seam graph against the patched piece
    // (matching each ref back to the seamEdges name it snapshotted from,
    // then reading that name's CURRENT range) and confirm the graph a real
    // consumer would see is measured identically to the original.
    const patchedDrafted = drafted.map((p) =>
      p.id === front.id ? patchedFront : p,
    );
    const nameForRef = (ref: SeamEdgeRef): string | undefined =>
      ref.pieceId === front.id
        ? Object.entries(front.seamEdges!).find(
            ([, [a, b]]) => a === ref.from && b === ref.to,
          )?.[0]
        : undefined;
    const rebase = (refs: SeamEdgeRef[]): SeamEdgeRef[] =>
      refs.map((ref) => {
        const name = nameForRef(ref);
        if (!name) return ref;
        const [rebasedFrom, rebasedTo] = patchedFront.seamEdges![name];
        return { ...ref, from: rebasedFrom, to: rebasedTo };
      });
    const freshPairs = seamPairs.map((pair) => ({
      ...pair,
      a: rebase(pair.a),
      b: rebase(pair.b),
    }));

    expect(walkSeamPairs(patchedDrafted, freshPairs)).toEqual(
      walkSeamPairs(drafted, seamPairs),
    );
  });
});
