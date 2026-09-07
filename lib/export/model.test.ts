import { describe, it, expect } from "vitest";
import { outlineSegments, buildExportModel, type ExPt } from "./model";
import { flattenOutlineCm, TOL_CM } from "./dxf";
import { outlinePath, SCALE, type Pt } from "@/lib/draft/core";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { DECORATION_CASES } from "@/lib/draft/fixtures";
import { STYLE_LIMITS } from "@/lib/draft/garment";
import { draftPiecesCm } from "@/lib/draft/engine/facade";
import { DEFAULT_ENGINE_ID } from "@/lib/draft/engine/capability";

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

// #86: outlinePath (lib/draft/core.ts, feeds the on-screen canvas) and
// outlineSegments above (feeds every export format) now adapt the same
// shared lib/draft/core.ts#catmullRomSegments -- this is the "missing
// cross-path assertion" the issue asked for: the same drafted piece's px
// canvas outline and its cm export outline must describe the same curve.
// They aren't bit-identical (outlinePath rounds its input points through
// PX() before computing tangents; outlineSegments uses exact cm), so the
// assertion is a bounded tolerance, not equality -- see the module doc on
// outlineSegments and CLAUDE.md's note that this divergence pre-dates the
// refactor and is deliberately preserved, not eliminated.
describe("outlinePath / outlineSegments cross-path parity (#86)", () => {
  it("outlinePath's C control points equal outlineSegments' * SCALE within PX() rounding, across the drafting matrix", () => {
    let cubicCount = 0;
    for (const [, spec] of DECORATION_CASES) {
      const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, base, t);
      for (const dp of pieces) {
        const spans = dp.curvedSpans ?? [];
        if (spans.length === 0) continue;
        const path = outlinePath(dp.outlineCm, spans) as {
          kind: "path";
          d: string;
        };
        const { segs } = outlineSegments(dp.outlineCm, spans);
        const cubicsFromSegments = segs.filter((s) => s.kind === "cubic") as {
          kind: "cubic";
          c1: ExPt;
          c2: ExPt;
        }[];
        const cubicsFromPath = [
          ...path.d.matchAll(
            /C([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) [-\d.]+ [-\d.]+/g,
          ),
        ].map((m) => m.slice(1, 5).map(Number));
        expect(cubicsFromPath).toHaveLength(cubicsFromSegments.length);
        cubicsFromPath.forEach(([c1x, c1y, c2x, c2y], i) => {
          const c = cubicsFromSegments[i];
          // PX() rounds each input coordinate to the nearest 0.1px (0.025cm)
          // before the tangent formula runs, so the two control points
          // differ by at most a small multiple of that rounding -- measured
          // across the full matrix, well under 0.15px.
          expect(c1x).toBeGreaterThan(c.c1.x * SCALE - 0.15);
          expect(c1x).toBeLessThan(c.c1.x * SCALE + 0.15);
          expect(c1y).toBeGreaterThan(c.c1.y * SCALE - 0.15);
          expect(c1y).toBeLessThan(c.c1.y * SCALE + 0.15);
          expect(c2x).toBeGreaterThan(c.c2.x * SCALE - 0.15);
          expect(c2x).toBeLessThan(c.c2.x * SCALE + 0.15);
          expect(c2y).toBeGreaterThan(c.c2.y * SCALE - 0.15);
          expect(c2y).toBeLessThan(c.c2.y * SCALE + 0.15);
          cubicCount++;
        });
      }
    }
    // Sanity: the matrix actually exercises curved spans (necklines,
    // armholes, sleeve caps) -- otherwise the loop above would pass vacuously.
    expect(cubicCount).toBeGreaterThan(0);
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

  // #124: notches, resolved from DraftedPiece.notches through the same local
  // (bbox-shifted) coordinates as grainline/dart/fold.
  describe("notches (#124)", () => {
    it("carries a body piece's notches into local outline coordinates", () => {
      const model = buildExportModel(fakePattern(), t);
      const front = model.pieces.find((p) => p.id === "body-front");
      expect(front?.notches?.length).toBeGreaterThan(0);
      for (const n of front!.notches!) {
        for (const pt of [n.outer, n.inner]) {
          expect(pt.x).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.x).toBeLessThanOrEqual(front!.widthCm + 1e-6);
          expect(pt.y).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.y).toBeLessThanOrEqual(front!.heightCm + 1e-6);
        }
      }
    });

    it("each notch's inner point sits exactly NOTCH_DEPTH_CM[type] from its outer point", () => {
      const model = buildExportModel(fakePattern(), t);
      const front = model.pieces.find((p) => p.id === "body-front")!;
      const depthOf = { single: 0.3, double: 0.6, triple: 0.9 } as const;
      for (const n of front.notches!) {
        const d = Math.hypot(n.inner.x - n.outer.x, n.inner.y - n.outer.y);
        expect(d).toBeCloseTo(depthOf[n.type], 6);
      }
    });
  });

  // #127: a dart's own fold line and drill hole(s), through the same local
  // (bbox-shifted) frame as darts/grainline/fold/notches above.
  describe("internals (#127)", () => {
    function fittedPattern(): Pattern {
      return {
        id: "p1",
        name: "Teste",
        version: 1,
        baseSize: "M",
        unit: "cm",
        sizes: ["M"],
        sizesApplied: [],
        sizesPending: [],
        sizeTable: { M: SIZE_TABLE.M },
        pieces: [],
        spec: {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: { neckline: "round", sleeve: "short", darts: true },
        },
      };
    }

    it("carries a fitted panel's dart fold lines and drill holes into local outline coordinates", () => {
      const model = buildExportModel(fittedPattern(), t);
      const front = model.pieces.find((p) => p.id === "body-front")!;
      expect(front.darts?.length).toBe(2);
      expect(front.internalFoldLines?.length).toBe(2); // one per dart
      // a fisheye (non-dress) dart has two free apexes, so 2 darts x 2 = 4.
      expect(front.drillHoles?.length).toBe(4);
      for (const [a, b] of front.internalFoldLines!) {
        for (const pt of [a, b]) {
          expect(pt.x).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.x).toBeLessThanOrEqual(front.widthCm + 1e-6);
          expect(pt.y).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.y).toBeLessThanOrEqual(front.heightCm + 1e-6);
        }
      }
      for (const hole of front.drillHoles!) {
        expect(hole.at.x).toBeGreaterThanOrEqual(-1e-6);
        expect(hole.at.x).toBeLessThanOrEqual(front.widthCm + 1e-6);
        expect(hole.at.y).toBeGreaterThanOrEqual(-1e-6);
        expect(hole.at.y).toBeLessThanOrEqual(front.heightCm + 1e-6);
        expect(hole.rCm).toBeCloseTo(0.15, 6);
      }
    });

    it("a piece with no darts carries neither internalFoldLines nor drillHoles", () => {
      const model = buildExportModel(fakePattern(), t); // tshirt: darts forced false
      for (const piece of model.pieces) {
        expect(piece.internalFoldLines).toBeUndefined();
        expect(piece.drillHoles).toBeUndefined();
      }
    });
  });

  // #244: the reserved "pleat" InternalCm kind's first real emitter --
  // proves its own placement/stitch line reaches the export model (not just
  // the reused foldLine channel, already covered above).
  describe("pleats (#244)", () => {
    function pleatedSkirtPattern(): Pattern {
      return {
        id: "p1",
        name: "Teste",
        version: 1,
        baseSize: "M",
        unit: "cm",
        sizes: ["M"],
        sizesApplied: [],
        sizesPending: [],
        sizeTable: { M: SIZE_TABLE.M },
        pieces: [],
        spec: {
          type: "skirt",
          gender: "female",
          measurementOverrides: {},
          style: { skirt: "straight", pleats: "box" },
        },
      };
    }

    it("carries the pleat's own placement lines into local outline coordinates, alongside its press fold", () => {
      const model = buildExportModel(pleatedSkirtPattern(), t);
      const skirt = model.pieces.find((p) => p.id === "skirt")!;
      expect(skirt.pleats?.length).toBe(2); // one per side
      expect(skirt.internalFoldLines?.length).toBe(2); // the press fold, reused
      for (const line of skirt.pleats!) {
        expect(line.length).toBeGreaterThanOrEqual(2);
        for (const pt of line) {
          expect(pt.x).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.x).toBeLessThanOrEqual(skirt.widthCm + 1e-6);
          expect(pt.y).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.y).toBeLessThanOrEqual(skirt.heightCm + 1e-6);
        }
      }
    });

    it("an unpleated skirt carries neither pleats nor internalFoldLines", () => {
      const p = pleatedSkirtPattern();
      p.spec!.style.pleats = "none";
      const model = buildExportModel(p, t);
      const skirt = model.pieces.find((p) => p.id === "skirt")!;
      expect(skirt.pleats).toBeUndefined();
      expect(skirt.internalFoldLines).toBeUndefined();
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
      it(`${name}: cut-line area growth is within 5% of perimeter x allowance (plus a small fixed corner floor)`, () => {
        const model = buildExportModel(patternFor(spec), t);
        const allowance = model.seamAllowanceCm!;
        for (const piece of model.pieces) {
          const net = flattenOutlineCm(piece.outline, TOL_CM);
          const cut = flattenOutlineCm(piece.cutOutline, TOL_CM);
          const expected = perimeter(net) * allowance;
          const grown = shoelaceArea(cut) - shoelaceArea(net);
          // A mitred (sharp-cornered) uniform offset legitimately grows a
          // convex polygon's area by MORE than perimeter x allowance alone
          // -- exactly allowance^2 per 90-degree corner for a plain
          // rectangle (grow a W x H rect by d on every side: new area =
          // (W+2d)(H+2d) = WH + perimeter*d + 4d^2). For a large,
          // curve-heavy body/skirt/sleeve piece that 4d^2 term is a
          // rounding error against the perimeter term, which is why 5%
          // alone covered every piece before #129/#130/#131. Those issues
          // add small, mostly-rectangular band pieces (collar/cuff/
          // placket/waistband) with only ~4 real corners and a short
          // perimeter, where the identical, geometrically-correct 4d^2
          // correction is a real few-cm^2 that a flat 5% relative bound
          // has no room for. The floor below is 1.5x that exact
          // 4-right-angle-corner formula (headroom for the gentler,
          // non-90-degree corners this suite's curved pieces also carry),
          // and it only matters when `expected` itself is small -- it
          // changes nothing for any piece where 5% already dominates.
          const cornerFloor = 6 * allowance * allowance;
          const tolerance = Math.max(0.05 * expected, cornerFloor);
          expect(Math.abs(grown - expected)).toBeLessThanOrEqual(tolerance);
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
