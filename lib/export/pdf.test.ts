import { describe, it, expect } from "vitest";
import { planTiles, pieceBBoxesCm, rulerTicksCm } from "./pdf";

describe("planTiles", () => {
  it("single: one page the pattern's size + margin", () => {
    const t = planTiles(20, 30, "single", null);
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
    expect(t.pageWcm).toBeCloseTo(21.6, 6); // 20 + 2*0.8
    expect(t.pageHcm).toBeCloseTo(31.6, 6);
    expect(t.overlapCm).toBe(0);
  });

  it("a4: a small pattern fits on one sheet", () => {
    const t = planTiles(15, 20, "a4", null);
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
  });

  it("a4: a large pattern slices into a grid with overlap", () => {
    const t = planTiles(50, 40, "a4", null);
    // printableW=19.4, stepW=18.4 -> cols=ceil((50-1)/18.4)=3
    // printableH=28.1, stepH=27.1 -> rows=ceil((40-1)/27.1)=2
    expect(t.cols).toBe(3);
    expect(t.rows).toBe(2);
    expect(t.pages).toHaveLength(6);
    // origin advances by the step (printable - overlap)
    expect(t.pages[1].originCm.x).toBeCloseTo(18.4, 6);
    expect(t.pages[3].originCm.y).toBeCloseTo(27.1, 6);
    // every page numbered consecutively when nothing is filtered out
    expect(t.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // #120: autoLayout's shelf-packing leaves real gaps between pieces, so the
  // naive rows x cols grid tiled several blank sheets -- verified live on a
  // size-M blouse (~30 A4 sheets for a garment that only fills a handful).
  it("a4: skips tiles with no piece geometry and renumbers the rest consecutively", () => {
    // same 50x40 grid as above (cols=3, rows=2, 6 tiles total), but only one
    // small piece sits in the very first tile's printable area.
    const bboxes = [{ minX: 1, minY: 1, maxX: 13, maxY: 13 }];
    const t = planTiles(50, 40, "a4", bboxes);
    expect(t.rows * t.cols).toBe(6);
    expect(t.pages).toHaveLength(1);
    expect(t.pages).toEqual([
      { row: 0, col: 0, pageNumber: 1, originCm: { x: 0, y: 0 } },
    ]);
  });

  it("a4: keeps every tile a piece's bbox actually reaches, renumbered 1..n", () => {
    // a piece spanning the first row's two left tiles (cols 0 and 1), none
    // of the second row -- exercises renumbering skipping row 1 entirely.
    const bboxes = [{ minX: 5, minY: 5, maxX: 25, maxY: 10 }];
    const t = planTiles(50, 40, "a4", bboxes);
    expect(t.pages.map((p) => [p.row, p.col, p.pageNumber])).toEqual([
      [0, 0, 1],
      [0, 1, 2],
    ]);
  });
});

describe("pieceBBoxesCm", () => {
  it("absolute bbox = piece originCm + local cutOutline extent, when the label fits inside it", () => {
    const [b] = pieceBBoxesCm(
      [
        {
          id: "front",
          name: "Frente",
          qty: 1,
          widthCm: 10,
          heightCm: 10,
          outline: { start: { x: 0, y: 0 }, segs: [] },
          cutOutline: {
            start: { x: -1, y: -1 },
            segs: [
              { kind: "line", to: { x: 11, y: -1 } },
              { kind: "line", to: { x: 11, y: 11 } },
              { kind: "line", to: { x: -1, y: 11 } },
              { kind: "line", to: { x: -1, y: -1 } },
            ],
          },
          cutWidthCm: 12,
          cutHeightCm: 12,
          originCm: { x: 2, y: 2 },
        },
      ],
      "dobra",
    );
    expect(b).toEqual({ minX: 1, minY: 1, maxX: 13, maxY: 13 });
  });

  // #120: with a 0cm seam allowance (a legal value, STYLE_LIMITS.seamAllowanceCm
  // .min) a narrow piece's cutOutline is flush with its outline -- toPdf still
  // draws the piece-name label past that edge, so a tile-visibility check
  // based on cutOutline alone could drop the very tile the label's tail
  // lands on. The bbox has to reach past the outline to cover it.
  it("grows the bbox to cover a piece-name label wider than the piece itself", () => {
    const narrowPiece = {
      id: "faixa",
      name: "Faixa Muito Comprida Da Gola",
      qty: 1,
      widthCm: 3,
      heightCm: 10,
      outline: {
        start: { x: 0, y: 0 },
        segs: [
          { kind: "line" as const, to: { x: 3, y: 0 } },
          { kind: "line" as const, to: { x: 3, y: 10 } },
          { kind: "line" as const, to: { x: 0, y: 10 } },
          { kind: "line" as const, to: { x: 0, y: 0 } },
        ],
      },
      // 0cm allowance -- cutOutline == outline, no slack for the label.
      cutOutline: {
        start: { x: 0, y: 0 },
        segs: [
          { kind: "line" as const, to: { x: 3, y: 0 } },
          { kind: "line" as const, to: { x: 3, y: 10 } },
          { kind: "line" as const, to: { x: 0, y: 10 } },
          { kind: "line" as const, to: { x: 0, y: 0 } },
        ],
      },
      cutWidthCm: 3,
      cutHeightCm: 10,
      originCm: { x: 0, y: 0 },
    };
    const [b] = pieceBBoxesCm([narrowPiece], "dobra");
    // cutOutline alone caps out at x=3; the long label's estimated width
    // pushes the bbox well past the piece's own edge.
    expect(b.maxX).toBeGreaterThan(narrowPiece.widthCm);
  });
});

describe("rulerTicksCm", () => {
  it("10 cm -> 11 ticks from 0 to 10", () => {
    expect(rulerTicksCm(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

import { toPdf } from "./pdf";
import type { ExportModel } from "./model";
import { PDFDocument } from "pdf-lib";
import { t } from "@/lib/i18n/test-translate";
import zlib from "node:zlib";

// pdf-lib compresses content streams (FlateDecode); this inflates every
// stream in the raw PDF bytes and concatenates the ones that decode as text
// (image/font streams throw and are skipped), so a test can grep the actual
// drawing operators instead of the compressed binary.
function inflatedContent(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString("latin1");
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  let out = "";
  while ((m = re.exec(text))) {
    try {
      out += zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      // not a FlateDecode stream (or not valid zlib) -- skip it
    }
  }
  return out;
}

function modelOf(sheetWcm: number, sheetHcm: number): ExportModel {
  return {
    patternName: "Camiseta",
    size: "M",
    unit: "cm",
    seamAllowanceCm: 1,
    sheetWidthCm: sheetWcm,
    sheetHeightCm: sheetHcm,
    foldLabel: "dobra",
    pieces: [
      {
        id: "front",
        name: "Frente",
        qty: 2,
        widthCm: 10,
        heightCm: 10,
        outline: {
          start: { x: 0, y: 0 },
          segs: [
            { kind: "line", to: { x: 10, y: 0 } },
            {
              kind: "cubic",
              c1: { x: 10, y: 5 },
              c2: { x: 5, y: 10 },
              to: { x: 0, y: 10 },
            },
            { kind: "line", to: { x: 0, y: 0 } },
          ],
        },
        // #123: a simple 1cm-allowance expansion of the same curved outline
        // -- exact offset math isn't the point here (that's offset.test.ts's
        // job), just that toPdf renders a cut line distinct from the net one.
        cutOutline: {
          start: { x: -1, y: -1 },
          segs: [
            { kind: "line", to: { x: 11, y: -1 } },
            {
              kind: "cubic",
              c1: { x: 11, y: 6 },
              c2: { x: 6, y: 11 },
              to: { x: -1, y: 11 },
            },
            { kind: "line", to: { x: -1, y: -1 } },
          ],
        },
        cutWidthCm: 12,
        cutHeightCm: 12,
        grainline: [
          { x: 5, y: 1 },
          { x: 5, y: 9 },
        ],
        fold: [
          { x: 5, y: 0 },
          { x: 5, y: 10 },
        ],
        originCm: { x: 2, y: 2 },
      },
    ],
  };
}

const PT_POR_CM = 72 / 2.54;

describe("toPdf", () => {
  it("a4: valid PDF (%PDF)", async () => {
    const model = modelOf(50, 40);
    const bytes = await toPdf(model, "a4", t);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  // #120: modelOf's single 12x12cm piece sits near the sheet's origin, but
  // the sheet itself is declared 50x40 (the shape a real sparse shelf-packed
  // layout takes) -- the naive rows x cols grid is 6 tiles; only the one
  // the piece actually reaches should come out of the real PDF.
  it("a4: skips blank tiles for a sparse layout -- fewer pages than rows × cols", async () => {
    const model = modelOf(50, 40);
    const bytes = await toPdf(model, "a4", t);
    const doc = await PDFDocument.load(bytes);
    const gridPages = planTiles(50, 40, "a4", null).pages.length; // unfiltered: 6
    expect(gridPages).toBe(6);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPageCount()).toBeLessThan(gridPages);
  });

  it("single: 1 page the pattern's size (1:1)", async () => {
    const model = modelOf(20, 30);
    const bytes = await toPdf(model, "single", t);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(21.6 * PT_POR_CM, 1); // (20+1.6) cm in pt
    expect(height).toBeCloseTo(31.6 * PT_POR_CM, 1); // (30+1.6) cm in pt
  });

  // #87/#122: the dart used to wrap its last leg back to the first point
  // (`% pc.dart.length`), drawing a fourth segment straight back along the
  // base -- a marking line that isn't part of the dart and disagreed with
  // the AAMA exporter's own open polyline for the identical pattern. A
  // fitted panel carries two darts, symmetric about its own centre line.
  it("each dart draws exactly dart.length - 1 segments, not a closed loop", async () => {
    const base = modelOf(20, 30);
    const { grainline: _grainline, ...pieceWithoutGrainline } = base.pieces[0];
    const model: ExportModel = {
      ...base,
      pieces: [
        {
          ...pieceWithoutGrainline,
          darts: [
            [
              { x: 3, y: 2 },
              { x: 4, y: 6 },
              { x: 5, y: 2 },
            ],
            [
              { x: 6, y: 2 },
              { x: 7, y: 6 },
              { x: 8, y: 2 },
            ],
          ],
        },
      ],
    };
    // No grainline on this fixture's piece, so every olive-stroked segment
    // in the content stream is a dart leg -- an exact count is meaningful.
    const bytes = await toPdf(model, "single", t);
    const content = inflatedContent(bytes);
    const oliveSegments = content.match(/0\.29 0\.35 0\.23 RG/g) ?? [];
    expect(oliveSegments).toHaveLength(4); // 2 darts x (dart.length - 1)
  });

  // #126: fold is drawn gray-dashed (reusing the usable-area rectangle's
  // GRAY) with the pt-BR "dobra" label at its midpoint; absent when the
  // piece has no fold.
  it("fold draws a gray line and the foldLabel text; no fold means neither", async () => {
    const withFold = modelOf(20, 30);
    const withFoldBytes = await toPdf(withFold, "single", t);
    const withFoldContent = inflatedContent(withFoldBytes);
    expect(withFoldContent).toMatch(/0\.6 0\.6 0\.6 RG/);
    // pdf-lib hex-encodes Tj text operands (WinAnsi) rather than using
    // literal parens -- "dobra" as hex, same encoding the existing
    // rulerLabel text already uses in this content stream.
    expect(withFoldContent).toContain("<646F627261>");

    const noFold: ExportModel = {
      ...withFold,
      pieces: [{ ...withFold.pieces[0], fold: undefined }],
    };
    const noFoldBytes = await toPdf(noFold, "single", t);
    const noFoldContent = inflatedContent(noFoldBytes);
    expect(noFoldContent).not.toMatch(/0\.6 0\.6 0\.6 RG/);
    expect(noFoldContent).not.toContain("<646F627261>");
  });

  // #123: the cut line (with seam allowance) is the primary solid INK
  // boundary; the net stitch line is drawn dashed in its own gray (0.4),
  // distinct from the fold's GRAY (0.6) so the two never collide.
  it("draws both a solid cut line (INK) and a dashed net line (its own gray)", async () => {
    const model = modelOf(20, 30);
    const bytes = await toPdf(model, "single", t);
    const content = inflatedContent(bytes);
    expect(content).toMatch(/0 0 0 RG/); // cut line, solid INK
    expect(content).toMatch(/0\.4 0\.4 0\.4 RG/); // net line, its own gray
    expect(content).toMatch(/\[3 2\] 0 d/); // net line's dash pattern
  });

  // #124: one solid tick per notch, drawn in the same INK as the cut line
  // (a notch is a cut mark, not an internal construction line) -- counted
  // against a model with no notches, since both draw in the identical color.
  it("draws one additional solid INK segment per notch", async () => {
    const base = modelOf(20, 30);
    const inkCount = (content: string) =>
      (content.match(/0 0 0 RG/g) ?? []).length;

    const baseBytes = await toPdf(base, "single", t);
    const baseCount = inkCount(inflatedContent(baseBytes));

    const withNotch: ExportModel = {
      ...base,
      pieces: [
        {
          ...base.pieces[0],
          notches: [
            {
              type: "single",
              outer: { x: 0, y: 5 },
              inner: { x: 0.3, y: 5 },
            },
          ],
        },
      ],
    };
    const withNotchBytes = await toPdf(withNotch, "single", t);
    const withNotchCount = inkCount(inflatedContent(withNotchBytes));

    expect(withNotchCount).toBe(baseCount + 1);
  });

  // #84: the per-piece draw loop used to iterate every piece unconditionally
  // on every remaining page, relying on the page's own bounds to discard
  // off-page geometry -- so a piece confined to one tile still got fully
  // redrawn (dart, grainline, notch, both labels) on every other surviving
  // page. Two pieces far apart on a sparse 50x40cm sheet (3x2 A4 grid, but
  // only the two tiles either piece actually reaches survive #120's
  // blank-page filter): "near" sits only in the very first tile, "far" only
  // in the opposite corner's tile. "far" is the only piece with a dart, so
  // its 2 segments (dart.length - 1) are an exact, unambiguous marker --
  // they must appear on exactly the one page whose tile its bbox reaches,
  // never on "near"'s page too.
  it("a4: a piece confined to one tile is not redrawn on a page belonging to a distant tile", async () => {
    const model: ExportModel = {
      patternName: "Camiseta",
      size: "M",
      unit: "cm",
      seamAllowanceCm: 1,
      sheetWidthCm: 50,
      sheetHeightCm: 40,
      foldLabel: "dobra",
      pieces: [
        {
          id: "near",
          name: "A",
          qty: 1,
          widthCm: 10,
          heightCm: 10,
          outline: {
            start: { x: 0, y: 0 },
            segs: [
              { kind: "line", to: { x: 10, y: 0 } },
              { kind: "line", to: { x: 10, y: 10 } },
              { kind: "line", to: { x: 0, y: 10 } },
              { kind: "line", to: { x: 0, y: 0 } },
            ],
          },
          cutOutline: {
            start: { x: -1, y: -1 },
            segs: [
              { kind: "line", to: { x: 11, y: -1 } },
              { kind: "line", to: { x: 11, y: 11 } },
              { kind: "line", to: { x: -1, y: 11 } },
              { kind: "line", to: { x: -1, y: -1 } },
            ],
          },
          cutWidthCm: 12,
          cutHeightCm: 12,
          originCm: { x: 2, y: 2 },
        },
        {
          id: "far",
          name: "B",
          qty: 1,
          widthCm: 10,
          heightCm: 10,
          outline: {
            start: { x: 0, y: 0 },
            segs: [
              { kind: "line", to: { x: 10, y: 0 } },
              { kind: "line", to: { x: 10, y: 10 } },
              { kind: "line", to: { x: 0, y: 10 } },
              { kind: "line", to: { x: 0, y: 0 } },
            ],
          },
          cutOutline: {
            start: { x: -1, y: -1 },
            segs: [
              { kind: "line", to: { x: 11, y: -1 } },
              { kind: "line", to: { x: 11, y: 11 } },
              { kind: "line", to: { x: -1, y: 11 } },
              { kind: "line", to: { x: -1, y: -1 } },
            ],
          },
          cutWidthCm: 12,
          cutHeightCm: 12,
          originCm: { x: 40, y: 30 },
          darts: [
            [
              { x: 1, y: 1 },
              { x: 2, y: 5 },
              { x: 3, y: 1 },
            ],
          ],
        },
      ],
    };

    const bytes = await toPdf(model, "a4", t);
    const doc = await PDFDocument.load(bytes);
    // both tiles the two pieces actually reach survive #120's blank-page
    // filter; every other tile in the 3x2 grid is blank and dropped.
    expect(doc.getPageCount()).toBe(2);

    const oliveSegments =
      inflatedContent(bytes).match(/0\.29 0\.35 0\.23 RG/g) ?? [];
    // "far"'s one dart draws dart.length - 1 = 2 segments, on the single
    // page its own tile reaches -- never doubled onto "near"'s page too.
    expect(oliveSegments).toHaveLength(2);
  });

  // #84 (skip's other edge): the per-piece skip must not turn into an
  // over-tight filter that drops a piece from a page it genuinely reaches.
  // A piece whose bbox straddles the seam between two adjacent A4 tiles has
  // to be drawn in full on BOTH pages -- each page's own MediaBox is what
  // clips the copy to the portion actually printed on that sheet, the same
  // "print on both, rely on page bounds for the visible remainder" design
  // the pre-existing #120 filter already assumes. Same 50x40cm/3x2 grid as
  // the test above, but one piece spanning tile (row0,col0) and (row0,col1).
  it("a4: a piece straddling a tile seam is drawn on both of the tiles it reaches", async () => {
    const model: ExportModel = {
      patternName: "Camiseta",
      size: "M",
      unit: "cm",
      seamAllowanceCm: 1,
      sheetWidthCm: 50,
      sheetHeightCm: 40,
      foldLabel: "dobra",
      pieces: [
        {
          id: "straddling",
          name: "C",
          qty: 1,
          widthCm: 10,
          heightCm: 10,
          outline: {
            start: { x: 0, y: 0 },
            segs: [
              { kind: "line", to: { x: 10, y: 0 } },
              { kind: "line", to: { x: 10, y: 10 } },
              { kind: "line", to: { x: 0, y: 10 } },
              { kind: "line", to: { x: 0, y: 0 } },
            ],
          },
          cutOutline: {
            start: { x: -1, y: -1 },
            segs: [
              { kind: "line", to: { x: 11, y: -1 } },
              { kind: "line", to: { x: 11, y: 11 } },
              { kind: "line", to: { x: -1, y: 11 } },
              { kind: "line", to: { x: -1, y: -1 } },
            ],
          },
          cutWidthCm: 12,
          cutHeightCm: 12,
          // absolute cut bbox [15,27]x[1,13]: reaches into both tile
          // (row0,col0)'s window (x:[0,19.4]) and tile (row0,col1)'s
          // (x:[18.4,37.8]); confined to row0 (y stays under 28.1).
          originCm: { x: 16, y: 2 },
          darts: [
            [
              { x: 1, y: 1 },
              { x: 2, y: 5 },
              { x: 3, y: 1 },
            ],
          ],
        },
      ],
    };

    const bytes = await toPdf(model, "a4", t);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);

    const oliveSegments =
      inflatedContent(bytes).match(/0\.29 0\.35 0\.23 RG/g) ?? [];
    // drawn in full (2 dart segments) on each of the 2 pages it reaches.
    expect(oliveSegments).toHaveLength(4);
  });
});
