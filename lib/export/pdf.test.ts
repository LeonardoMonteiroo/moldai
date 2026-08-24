import { describe, it, expect } from "vitest";
import { planTiles, rulerTicksCm } from "./pdf";

describe("planTiles", () => {
  it("single: one page the pattern's size + margin", () => {
    const t = planTiles(20, 30, "single");
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
    expect(t.pageWcm).toBeCloseTo(21.6, 6); // 20 + 2*0.8
    expect(t.pageHcm).toBeCloseTo(31.6, 6);
    expect(t.overlapCm).toBe(0);
  });

  it("a4: a small pattern fits on one sheet", () => {
    const t = planTiles(15, 20, "a4");
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
  });

  it("a4: a large pattern slices into a grid with overlap", () => {
    const t = planTiles(50, 40, "a4");
    // printableW=19.4, stepW=18.4 -> cols=ceil((50-1)/18.4)=3
    // printableH=28.1, stepH=27.1 -> rows=ceil((40-1)/27.1)=2
    expect(t.cols).toBe(3);
    expect(t.rows).toBe(2);
    expect(t.pages).toHaveLength(6);
    // origin advances by the step (printable - overlap)
    expect(t.pages[1].originCm.x).toBeCloseTo(18.4, 6);
    expect(t.pages[3].originCm.y).toBeCloseTo(27.1, 6);
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
  it("a4: valid PDF (%PDF) and page count = planTiles", async () => {
    const model = modelOf(50, 40);
    const bytes = await toPdf(model, "a4", t);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(6); // planTiles(50,40,"a4") = 6
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
});
