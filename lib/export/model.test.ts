import { describe, it, expect } from "vitest";
import { outlineSegments, buildExportModel, type ExPt } from "./model";
import { flattenOutlineCm, TOL_CM } from "./dxf";
import type { Pt } from "@/lib/draft/core";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { DECORATION_CASES } from "@/lib/draft/fixtures";
import { STYLE_LIMITS } from "@/lib/draft/garment";

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
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: ["G"],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE.M, G: SIZE_TABLE.G },
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

  // #59: export can now redraft from a graduated size, not only the base --
  // buildExportModel is the layer that actually re-drafts.
  describe("size selection (#59)", () => {
    it("defaults to the base size when none is given", () => {
      expect(buildExportModel(fakePattern(), t).size).toBe("M");
    });

    it("redrafts from the requested size's own measurements", () => {
      const base = buildExportModel(fakePattern(), t);
      const graded = buildExportModel(fakePattern(), t, "G");
      expect(graded.size).toBe("G");
      // SIZE_TABLE.G's bust is real cm larger than SIZE_TABLE.M's -- the
      // redraft produces a wider front piece, not just a relabeled model.
      expect(graded.pieces[0].widthCm).not.toBeCloseTo(
        base.pieces[0].widthCm,
        3,
      );
    });

    it("falls back to the base size for a size missing from sizeTable, rather than throwing", () => {
      const model = buildExportModel(fakePattern(), t, "not-a-real-size");
      expect(model.size).toBe("M");
      expect(model).toEqual(buildExportModel(fakePattern(), t));
    });
  });

  // #126: the fold edge, resolved from DraftedPiece.foldEdge through the same
  // local (bbox-shifted) coordinates as grainline/dart.
  describe("fold edge (#126)", () => {
    it("carries the catalog's fold label", () => {
      expect(buildExportModel(fakePattern(), t).foldLabel).toBe("foldLabel");
    });

    it("a body piece's fold endpoints land on its own local outline (0..width, 0..height)", () => {
      const model = buildExportModel(fakePattern(), t);
      const front = model.pieces.find((p) => p.id === "body-front");
      expect(front?.fold).toBeDefined();
      const [a, b] = front!.fold!;
      for (const pt of [a, b]) {
        expect(pt.x).toBeGreaterThanOrEqual(-1e-6);
        expect(pt.x).toBeLessThanOrEqual(front!.widthCm + 1e-6);
        expect(pt.y).toBeGreaterThanOrEqual(-1e-6);
        expect(pt.y).toBeLessThanOrEqual(front!.heightCm + 1e-6);
      }
      // the fold runs vertically down the piece's own centre (its axis of
      // symmetry), not diagonally or horizontally
      expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6);
      expect(Math.abs(a.y - b.y)).toBeGreaterThan(1);
    });
  });

  // #123: turns the seam-allowance annotation into a real cut-line outline,
  // offset outward from the net `outline` -- verified against the actual
  // drafting matrix (lib/draft/fixtures.ts's DECORATION_CASES, the same set
  // garment.test.ts's containment/fold-edge invariants use), not just a
  // hand-built square.
  describe("cut line (#123)", () => {
    function patternFor(spec: Pattern["spec"]): Pattern {
      const gender = spec?.gender;
      const m = gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      return {
        id: "p1",
        name: "Teste",
        version: 1,
        baseSize: "M",
        unit: "cm",
        sizes: ["M"],
        sizesApplied: [],
        sizesPending: [],
        sizeTable: { M: m },
        pieces: [],
        spec,
      };
    }

    function shoelaceArea(pts: ExPt[]): number {
      let a = 0;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[i],
          q = pts[(i + 1) % n];
        a += p.x * q.y - q.x * p.y;
      }
      return Math.abs(a) / 2;
    }

    function perimeter(pts: ExPt[]): number {
      let len = 0;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i],
          b = pts[(i + 1) % n];
        len += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return len;
    }

    function cross(o: ExPt, p: ExPt, q: ExPt): number {
      return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    }

    function segmentsIntersect(
      a1: ExPt,
      a2: ExPt,
      b1: ExPt,
      b2: ExPt,
    ): boolean {
      const d1 = cross(b1, b2, a1);
      const d2 = cross(b1, b2, a2);
      const d3 = cross(a1, a2, b1);
      const d4 = cross(a1, a2, b2);
      return (
        ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
        ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
      );
    }

    // Non-adjacent edges only -- adjacent edges legitimately share an
    // endpoint, which isn't a self-intersection.
    function hasSelfIntersection(pts: ExPt[]): boolean {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (j === i + 1 || (i === 0 && j === n - 1)) continue;
          if (
            segmentsIntersect(
              pts[i],
              pts[(i + 1) % n],
              pts[j],
              pts[(j + 1) % n],
            )
          )
            return true;
        }
      }
      return false;
    }

    for (const [name, spec] of DECORATION_CASES) {
      it(`${name}: cut line is larger than, and never self-intersects, the net line`, () => {
        const model = buildExportModel(patternFor(spec), t);
        for (const piece of model.pieces) {
          const net = flattenOutlineCm(piece.outline, TOL_CM);
          const cut = flattenOutlineCm(piece.cutOutline, TOL_CM);
          expect(hasSelfIntersection(cut)).toBe(false);
          expect(shoelaceArea(cut)).toBeGreaterThan(shoelaceArea(net));
        }
      });

      // #123's `foldEdge` decision ("a fold edge gets 0cm") assumed the fold
      // named one literal boundary edge; every real drafter's fold is
      // instead a chord between a top-centre and bottom-centre vertex of an
      // already-whole, mirrored piece (see offset.ts's module comment), so
      // it never reduces the perimeter -- the full boundary always gets the
      // full allowance uniformly, which is why `expected` is bare
      // perimeter x allowance with no fold subtraction.
      it(`${name}: cut-line area growth is within 5% of perimeter x allowance`, () => {
        const model = buildExportModel(patternFor(spec), t);
        for (const piece of model.pieces) {
          const net = flattenOutlineCm(piece.outline, TOL_CM);
          const cut = flattenOutlineCm(piece.cutOutline, TOL_CM);
          const expected = perimeter(net) * model.seamAllowanceCm!;
          const grown = shoelaceArea(cut) - shoelaceArea(net);
          expect(Math.abs(grown - expected)).toBeLessThanOrEqual(
            0.05 * expected,
          );
        }
      });
    }

    // The shelf-packer only ever reserved room for each piece's *net*
    // bbox (`widthCm`/`heightCm`); the solid cut line is now the thing
    // that actually gets printed/plotted, and a mitred convex corner can
    // grow past a plain edge offset -- so the packer has to reserve each
    // piece's real cut-line bbox, not its net one, or two neighbours can
    // touch/overlap on the sheet. Run at the maximum allowance (the
    // worst case for corner growth) across the real drafting matrix.
    it("cut lines never overlap between pieces on the sheet, even at the maximum seam allowance", () => {
      for (const [, spec] of DECORATION_CASES) {
        const maxSpec = {
          ...spec,
          style: {
            ...spec.style,
            seamAllowanceCm: STYLE_LIMITS.seamAllowanceCm.max,
          },
        };
        const model = buildExportModel(patternFor(maxSpec), t);
        const boxes = model.pieces.map((piece) => {
          const cut = flattenOutlineCm(piece.cutOutline, TOL_CM);
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const pt of cut) {
            const gx = piece.originCm.x + pt.x;
            const gy = piece.originCm.y + pt.y;
            minX = Math.min(minX, gx);
            maxX = Math.max(maxX, gx);
            minY = Math.min(minY, gy);
            maxY = Math.max(maxY, gy);
          }
          return { minX, minY, maxX, maxY };
        });
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
              b = boxes[j];
            const disjoint =
              a.maxX <= b.minX + 1e-6 ||
              b.maxX <= a.minX + 1e-6 ||
              a.maxY <= b.minY + 1e-6 ||
              b.maxY <= a.minY + 1e-6;
            expect(disjoint).toBe(true);
          }
        }
      }
    });

    // A fold ENDPOINT is a real outline vertex sitting exactly on the
    // piece's own axis of symmetry; by that symmetry, the curve's tangent
    // there is forced perpendicular to the fold, so its outward normal
    // already points *along* the fold -- offsetting it like any other
    // vertex keeps it on the fold line with no special-casing (see the
    // "no boundary edge is ever literally the fold" argument in offset.ts).
    it("an axis-of-symmetry vertex (the fold's own endpoint) offsets straight along the fold, never sideways", () => {
      const model = buildExportModel(fakePattern(), t);
      const front = model.pieces.find((p) => p.id === "body-front")!;
      const cut = flattenOutlineCm(front.cutOutline, TOL_CM);
      const dist = (p: ExPt, q: ExPt) => Math.hypot(p.x - q.x, p.y - q.y);
      for (const foldPt of front.fold!) {
        const closest = cut.reduce((best, p) =>
          dist(p, foldPt) < dist(best, foldPt) ? p : best,
        );
        expect(closest.x).toBeCloseTo(foldPt.x, 2);
      }
    });
  });
});
