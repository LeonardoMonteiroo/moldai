import { describe, it, expect } from "vitest";
import { toDxfAama } from "./dxf-aama";
import { buildExportModel, type ExportModel } from "./model";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { DECORATION_CASES } from "@/lib/draft/fixtures";

// xs (code 10) of the first POLYLINE on the given layer's VERTEX entries, up
// to its SEQEND (doesn't grab TEXT/LINE). #123: cut (layer 1) and net (layer
// 14) are both POLYLINEs now, so "the first one" is no longer unambiguous.
function polylineXsOnLayer(dxf: string, layer: string): number[] {
  const lines = dxf.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "POLYLINE" || lines[i + 2] !== layer) continue;
    const end = lines.indexOf("SEQEND", i);
    const xs: number[] = [];
    for (let k = i; k < end; k++)
      if (lines[k] === "10") xs.push(Number(lines[k + 1]));
    return xs;
  }
  throw new Error(`no POLYLINE found on layer ${layer}`);
}

const squareModel: ExportModel = {
  patternName: "Camiseta & Cia",
  size: "M",
  unit: "cm",
  seamAllowanceCm: 1,
  sheetWidthCm: 20,
  sheetHeightCm: 30,
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
          { kind: "line", to: { x: 10, y: 10 } },
          { kind: "line", to: { x: 0, y: 10 } },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      // #123: the 1cm-allowance cut line, matching dxf.test.ts's own
      // squareModel fixture -- a 12x12 square.
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

const dartModel: ExportModel = {
  ...squareModel,
  pieces: [
    {
      ...squareModel.pieces[0],
      id: "back",
      name: "Costas",
      darts: [
        [
          { x: 3, y: 2 },
          { x: 4, y: 6 },
          { x: 5, y: 2 },
        ],
      ],
    },
  ],
};

describe("toDxfAama", () => {
  it("R13 header (AC1012), mm, and a 999 AAMA/ASTM-subset comment", () => {
    const dxf = toDxfAama(squareModel);
    expect(dxf).toMatch(/\$ACADVER\n1\nAC1012/);
    expect(dxf).toMatch(/\$INSUNITS\n70\n4/);
    expect(dxf).toContain("AAMA/ASTM subset");
    expect(dxf).toContain("tam M");
  });

  it("declares numbered layers (1/4/6/7/8/14), not the generic DXF's named ones", () => {
    const dxf = toDxfAama(squareModel);
    // the TABLE LAYER block contains the numeric names
    expect(dxf).toMatch(/LAYER\n2\n1\n/);
    expect(dxf).toMatch(/LAYER\n2\n4\n/);
    expect(dxf).toMatch(/LAYER\n2\n6\n/);
    expect(dxf).toMatch(/LAYER\n2\n7\n/);
    expect(dxf).toMatch(/LAYER\n2\n8\n/);
    expect(dxf).toMatch(/LAYER\n2\n14\n/);
    expect(dxf).not.toContain("CONTORNO");
    expect(dxf).not.toContain("GRAINLINE");
  });

  // #126: ASTM D6673 reserves layer 6 for the fold/mirror line.
  it("fold comes out as a LINE on layer 6; no fold means no layer 6", () => {
    const withFold = toDxfAama(squareModel);
    expect(withFold).toMatch(/LINE\n8\n6\n10\n50\n20\n100\n11\n50\n21\n0/);
    const noFold: ExportModel = {
      ...squareModel,
      pieces: [{ ...squareModel.pieces[0], fold: undefined }],
    };
    expect(toDxfAama(noFold)).not.toMatch(/\n8\n6\n/);
  });

  // #124: ASTM D6673 reserves layer 4 for notches.
  it("each notch comes out as a LINE on layer 4; no notches means no layer 4", () => {
    const notchModel: ExportModel = {
      ...squareModel,
      pieces: [
        {
          ...squareModel.pieces[0],
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
    const dxf = toDxfAama(notchModel);
    expect(dxf).toMatch(/LINE\n8\n4\n10\n0\n20\n50\n11\n3\n21\n50/);
    expect(toDxfAama(squareModel)).not.toMatch(/\n8\n4\n/);
  });

  it("a piece becomes BLOCK + INSERT, with POLYLINE/SEQEND (R13) and no LWPOLYLINE", () => {
    const dxf = toDxfAama(squareModel);
    expect(dxf).toContain("\nBLOCKS\n");
    expect(dxf.match(/\nBLOCK\n/g)?.length).toBe(1);
    expect(dxf.match(/\nINSERT\n/g)?.length).toBe(1);
    expect(dxf).toContain("\nPOLYLINE\n");
    expect(dxf).toContain("\nSEQEND\n");
    expect(dxf).not.toContain("LWPOLYLINE");
  });

  it("name/qty as the piece's system text", () => {
    const dxf = toDxfAama(squareModel);
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf).toContain("FRENTE 2X");
  });

  it("1:1 scale: layer 1 is the 12cm cut line, layer 14 the 10cm net line (mm)", () => {
    const dxf = toDxfAama(squareModel);
    const cutXs = polylineXsOnLayer(dxf, "1");
    const netXs = polylineXsOnLayer(dxf, "14");
    expect(cutXs.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...cutXs) - Math.min(...cutXs)).toBeCloseTo(120, 6);
    expect(netXs.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...netXs) - Math.min(...netXs)).toBeCloseTo(100, 6);
  });

  it("dart comes out as an open POLYLINE on layer 8; no dart means no layer 8", () => {
    const withDart = toDxfAama(dartModel);
    // three POLYLINEs: cut (layer 1) + net (layer 14) + dart (layer 8)
    expect(withDart.match(/\nPOLYLINE\n/g)?.length).toBe(3);
    // open on layer 8, with its 10/20/30 dummy point ahead of the 70 flag
    expect(withDart).toMatch(
      /POLYLINE\n8\n8\n66\n1\n10\n0\n20\n0\n30\n0\n70\n0/,
    );
    const noDart = toDxfAama(squareModel);
    expect(noDart.match(/\nPOLYLINE\n/g)?.length).toBe(2); // cut + net only
  });

  it("one BLOCK and one INSERT per piece in multi-piece models", () => {
    const multi: ExportModel = {
      ...squareModel,
      pieces: [squareModel.pieces[0], dartModel.pieces[0]],
    };
    const dxf = toDxfAama(multi);
    expect(dxf.match(/\nBLOCK\n/g)?.length).toBe(2);
    expect(dxf.match(/\nINSERT\n/g)?.length).toBe(2);
  });

  // #2: the remaining structural-strictness gap -- an LTYPE table, a
  // BLOCK_RECORD table, and a dummy point on every classic POLYLINE.
  it("declares an LTYPE table defining CONTINUOUS", () => {
    const dxf = toDxfAama(squareModel);
    expect(dxf).toMatch(/TABLE\n2\nLTYPE\n/);
    expect(dxf).toMatch(/LTYPE\n2\nCONTINUOUS\n/);
  });

  it("declares a BLOCK_RECORD table with an entry for every BLOCK inserted", () => {
    const multi: ExportModel = {
      ...squareModel,
      pieces: [squareModel.pieces[0], dartModel.pieces[0]],
    };
    const dxf = toDxfAama(multi);
    expect(dxf).toMatch(/TABLE\n2\nBLOCK_RECORD\n/);
    // one BLOCK_RECORD entry per distinct piece id -> block name
    expect(dxf.match(/\nBLOCK_RECORD\n2\nPIECE_FRONT\n/g)?.length).toBe(1);
    expect(dxf.match(/\nBLOCK_RECORD\n2\nPIECE_BACK\n/g)?.length).toBe(1);
    // and each INSERT/BLOCK actually names one of those block records
    expect(dxf).toContain("\nBLOCK\n8\n0\n2\nPIECE_FRONT\n");
    expect(dxf).toContain("\nINSERT\n8\n0\n2\nPIECE_FRONT\n");
  });

  it("every classic POLYLINE carries its own 10/20/30 dummy point", () => {
    const dxf = toDxfAama(squareModel);
    // cut line (layer 1) and net line (layer 14), each: POLYLINE,8,<layer>,
    // 66,1, then the dummy point, before the 70 closed flag.
    expect(dxf).toMatch(/POLYLINE\n8\n1\n66\n1\n10\n0\n20\n0\n30\n0\n70\n1/);
    expect(dxf).toMatch(/POLYLINE\n8\n14\n66\n1\n10\n0\n20\n0\n30\n0\n70\n1/);
  });

  it("the '·' separator and any accented text is normalized to plain ASCII", () => {
    const accented: ExportModel = {
      ...squareModel,
      patternName: "Vestido Ateliê Nº2",
      pieces: [{ ...squareModel.pieces[0], name: "Décote" }],
    };
    const dxf = toDxfAama(accented);
    expect(dxf).not.toContain("·");
    expect(dxf).not.toContain("Ateliê");
    expect(dxf).not.toContain("Décote");
    expect(dxf).toContain("Atelie"); // patternName, accent stripped (999 comment, not upper-cased)
    expect(dxf).toContain("DECOTE"); // piece name, upper-cased then accent-stripped
    expect(/^[\x00-\x7f]*$/.test(dxf)).toBe(true);
  });

  // The cheapest possible guard for the charset rule, run against every
  // garment/style combination the real drafting matrix produces (not just a
  // hand-picked fixture) -- matches CLAUDE.md's own DECORATION_CASES
  // precedent for cross-format invariants.
  describe("ASCII-only across the real drafting matrix (DECORATION_CASES)", () => {
    function patternFor(spec: Pattern["spec"]): Pattern {
      const gender = spec?.gender;
      const m = gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      return {
        id: "p1",
        name: "Vestido Ateliê",
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

    for (const [name, spec] of DECORATION_CASES) {
      it(`${name}: emitted DXF is pure ASCII`, () => {
        const model = buildExportModel(patternFor(spec), t);
        const dxf = toDxfAama(model);
        expect(/^[\x00-\x7f]*$/.test(dxf)).toBe(true);
      });
    }
  });
});
