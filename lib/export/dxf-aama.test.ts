import { describe, it, expect } from "vitest";
import { toDxfAama } from "./dxf-aama";
import type { ExportModel } from "./model";

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

  it("declares numbered layers (1/6/7/8/14), not the generic DXF's named ones", () => {
    const dxf = toDxfAama(squareModel);
    // the TABLE LAYER block contains the numeric names
    expect(dxf).toMatch(/LAYER\n2\n1\n/);
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
    expect(withDart).toMatch(/POLYLINE\n8\n8\n66\n1\n70\n0/); // open on layer 8
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
});
