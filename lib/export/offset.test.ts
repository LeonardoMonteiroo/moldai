import { describe, it, expect } from "vitest";
import { offsetOutlineCm } from "./offset";
import type { Pt } from "@/lib/draft/core";

function shoelaceArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i],
      q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const SQUARE: Pt[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe("offsetOutlineCm", () => {
  it("grows a square by exactly d on every side (no fold, no curves)", () => {
    const out = offsetOutlineCm(SQUARE, [], undefined, 1);
    const xs = out.map((p) => p.x);
    const ys = out.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-1, 6);
    expect(Math.max(...xs)).toBeCloseTo(11, 6);
    expect(Math.min(...ys)).toBeCloseTo(-1, 6);
    expect(Math.max(...ys)).toBeCloseTo(11, 6);
    expect(shoelaceArea(out)).toBeCloseTo(144, 3); // a 12x12 square
  });

  it("mitres a convex right-angle corner along its 45° bisector", () => {
    const out = offsetOutlineCm(SQUARE, [], undefined, 1);
    // the corner originally at (0,0) mitres outward to (-1,-1) -- a 90°
    // corner's miter distance along the bisector is d*sqrt(2).
    expect(out[0].x).toBeCloseTo(-1, 6);
    expect(out[0].y).toBeCloseTo(-1, 6);
  });

  it("a zero distance returns the outline unchanged", () => {
    const out = offsetOutlineCm(SQUARE, [], undefined, 0);
    for (let i = 0; i < SQUARE.length; i++) {
      expect(out[i].x).toBeCloseTo(SQUARE[i][0], 6);
      expect(out[i].y).toBeCloseTo(SQUARE[i][1], 6);
    }
  });

  it("a fold edge gets 0cm while the opposite edge still grows by d", () => {
    // edge 0 (index 0->1, the bottom) is the fold -- it must not move
    // perpendicular to itself (y stays 0), though its own endpoints still
    // slide outward *along* it, dragged by the adjacent (non-fold) edges'
    // full allowance.
    const out = offsetOutlineCm(SQUARE, [], [0, 1], 1);
    expect(Math.min(...out.map((p) => p.y))).toBeCloseTo(0, 6); // fold: unmoved
    expect(Math.max(...out.map((p) => p.y))).toBeCloseTo(11, 6); // opposite edge: full growth
    expect(Math.min(...out.map((p) => p.x))).toBeCloseTo(-1, 6);
    expect(Math.max(...out.map((p) => p.x))).toBeCloseTo(11, 6);
    expect(out[0].x).toBeCloseTo(-1, 6);
    expect(out[0].y).toBeCloseTo(0, 6);
    expect(out[1].x).toBeCloseTo(11, 6);
    expect(out[1].y).toBeCloseTo(0, 6);
  });

  it("trims a concave (reflex) corner to the inner line intersection, not a spike", () => {
    // an "L" shape, concave at (10,10)
    const L: Pt[] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [10, 20],
      [10, 10],
      [0, 10],
    ];
    const out = offsetOutlineCm(L, [], undefined, 1);
    // the reflex vertex (index 4, at (10,10)) trims to the intersection of
    // its two adjacent offset lines (x=9 from the edge above, y=11 from the
    // edge to its left) -- filling a little of the notch's own void, not
    // shooting a spike away from the shape the way a naive per-vertex
    // translate-by-normal would.
    expect(out[4].x).toBeCloseTo(9, 6);
    expect(out[4].y).toBeCloseTo(11, 6);
  });

  it("offsets a curved span, approximating a larger arc", () => {
    // a bulging cubic span from (10,0) to (0,10) -- offsetting outward
    // should push every flattened point roughly d further from where it
    // started.
    const pts: Pt[] = [
      [10, 0],
      [0, 10],
      [0, 0],
    ];
    const withoutOffset = offsetOutlineCm(pts, [[0, 1]], undefined, 0);
    const withOffset = offsetOutlineCm(pts, [[0, 1]], undefined, 1);
    expect(withOffset.length).toBe(withoutOffset.length);
    for (let i = 0; i < withoutOffset.length; i++) {
      const a = withoutOffset[i];
      const b = withOffset[i];
      const growth = Math.hypot(b.x - a.x, b.y - a.y);
      expect(growth).toBeGreaterThan(0.5);
      expect(growth).toBeLessThan(3); // the two ends, joining a straight edge, can miter a bit past d
    }
  });

  // The exact identity for a rectangle offset outward on all four sides:
  // (w+2d)(h+2d) - w*h = 2d(w+h) + 4d^2 -- the AC's "perimeter x allowance"
  // approximation plus the four mitred corners' own d^2 squares. A real
  // garment piece's perimeter is large relative to its handful of sharp
  // corners, which is why the acceptance test (lib/export/model.test.ts)
  // can use a 5% tolerance against bare perimeter x allowance; a 10x10
  // square's corner terms are a much bigger fraction of a 40cm perimeter,
  // so this unit test checks the exact formula instead.
  it("area growth on a rectangle matches the exact offset-polygon identity", () => {
    const d = 1.2;
    const out = offsetOutlineCm(SQUARE, [], undefined, d);
    const grown = shoelaceArea(out) - 100; // SQUARE is 10x10 = 100
    const exact = 2 * d * (10 + 10) + 4 * d * d;
    expect(grown).toBeCloseTo(exact, 6);
  });

  // #243: an internal loop (hole) must offset the OPPOSITE way from the
  // outer boundary above -- its cut line has to SHRINK the opening (the
  // extra seam-allowance fabric folds under, into the hole), not grow it.
  describe("direction: 'inward' (#243, an internal loop/hole)", () => {
    it("shrinks a square hole by exactly d on every side, the mirror of the outward case", () => {
      const out = offsetOutlineCm(
        SQUARE,
        [],
        undefined,
        1,
        undefined,
        "inward",
      );
      const xs = out.map((p) => p.x);
      const ys = out.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(1, 6);
      expect(Math.max(...xs)).toBeCloseTo(9, 6);
      expect(Math.min(...ys)).toBeCloseTo(1, 6);
      expect(Math.max(...ys)).toBeCloseTo(9, 6);
      expect(shoelaceArea(out)).toBeCloseTo(64, 3); // an 8x8 square
    });

    it("a zero distance returns the outline unchanged regardless of direction", () => {
      const out = offsetOutlineCm(
        SQUARE,
        [],
        undefined,
        0,
        undefined,
        "inward",
      );
      for (let i = 0; i < SQUARE.length; i++) {
        expect(out[i].x).toBeCloseTo(SQUARE[i][0], 6);
        expect(out[i].y).toBeCloseTo(SQUARE[i][1], 6);
      }
    });

    it("the exact rectangle identity mirrors the outward one -- area SHRINKS by 2d(w+h) - 4d^2", () => {
      const d = 1.2;
      const out = offsetOutlineCm(
        SQUARE,
        [],
        undefined,
        d,
        undefined,
        "inward",
      );
      const shrunk = 100 - shoelaceArea(out); // SQUARE is 10x10 = 100
      const exact = 2 * d * (10 + 10) - 4 * d * d;
      expect(shrunk).toBeCloseTo(exact, 6);
    });

    it("'outward' and 'inward' pick the two DIFFERENT real candidates, never the same one", () => {
      const grown = offsetOutlineCm(SQUARE, [], undefined, 1);
      const shrunk = offsetOutlineCm(
        SQUARE,
        [],
        undefined,
        1,
        undefined,
        "inward",
      );
      expect(shoelaceArea(grown)).toBeGreaterThan(shoelaceArea(shrunk));
    });
  });
});
