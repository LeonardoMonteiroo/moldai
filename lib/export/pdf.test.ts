import { describe, it, expect } from "vitest";
import { planTiles, rulerTicksCm } from "./pdf";

describe("planTiles", () => {
  it("single: uma página do tamanho do molde + margem", () => {
    const t = planTiles(20, 30, "single");
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
    expect(t.pageWcm).toBeCloseTo(21.6, 6); // 20 + 2*0.8
    expect(t.pageHcm).toBeCloseTo(31.6, 6);
    expect(t.overlapCm).toBe(0);
  });

  it("a4: molde pequeno cabe em uma folha", () => {
    const t = planTiles(15, 20, "a4");
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
  });

  it("a4: molde grande fatia em grade com sobreposição", () => {
    const t = planTiles(50, 40, "a4");
    // printableW=19.4, stepW=18.4 -> cols=ceil((50-1)/18.4)=3
    // printableH=28.1, stepH=27.1 -> rows=ceil((40-1)/27.1)=2
    expect(t.cols).toBe(3);
    expect(t.rows).toBe(2);
    expect(t.pages).toHaveLength(6);
    // origem avança pelo passo (printable - overlap)
    expect(t.pages[1].originCm.x).toBeCloseTo(18.4, 6);
    expect(t.pages[3].originCm.y).toBeCloseTo(27.1, 6);
  });
});

describe("rulerTicksCm", () => {
  it("10 cm -> 11 ticks de 0 a 10", () => {
    expect(rulerTicksCm(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

import { toPdf } from "./pdf";
import type { ExportModel } from "./model";
import { PDFDocument } from "pdf-lib";

function modelOf(sheetWcm: number, sheetHcm: number): ExportModel {
  return {
    patternName: "Camiseta",
    size: "M",
    unit: "cm",
    seamAllowanceCm: 1,
    sheetWidthCm: sheetWcm,
    sheetHeightCm: sheetHcm,
    pieces: [
      {
        id: "frente",
        name: "Frente",
        qty: 2,
        widthCm: 10,
        heightCm: 10,
        outline: {
          start: { x: 0, y: 0 },
          segs: [
            { kind: "line", to: { x: 10, y: 0 } },
            { kind: "cubic", c1: { x: 10, y: 5 }, c2: { x: 5, y: 10 }, to: { x: 0, y: 10 } },
            { kind: "line", to: { x: 0, y: 0 } },
          ],
        },
        grainline: [{ x: 5, y: 1 }, { x: 5, y: 9 }],
        originCm: { x: 2, y: 2 },
      },
    ],
  };
}

const PT_POR_CM = 72 / 2.54;

describe("toPdf", () => {
  it("a4: PDF válido (%PDF) e nº de páginas = planTiles", async () => {
    const model = modelOf(50, 40);
    const bytes = await toPdf(model, "a4");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(6); // planTiles(50,40,"a4") = 6
  });

  it("single: 1 página do tamanho do molde (1:1)", async () => {
    const model = modelOf(20, 30);
    const bytes = await toPdf(model, "single");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(21.6 * PT_POR_CM, 1);  // (20+1.6) cm em pt
    expect(height).toBeCloseTo(31.6 * PT_POR_CM, 1); // (30+1.6) cm em pt
  });
});
