import { describe, it, expect } from "vitest";
import { toDxfAama } from "./dxf-aama";
import type { ExportModel } from "./model";

// xs (código 10) dos VERTEX do primeiro POLYLINE, até o SEQEND (não pega TEXT/LINE)
function firstPolylineXs(dxf: string): number[] {
  const lines = dxf.split("\n");
  const start = lines.indexOf("POLYLINE");
  const end = lines.indexOf("SEQEND", start);
  const xs: number[] = [];
  for (let k = start; k < end; k++)
    if (lines[k] === "10") xs.push(Number(lines[k + 1]));
  return xs;
}

const squareModel: ExportModel = {
  patternName: "Camiseta & Cia",
  size: "M",
  unit: "cm",
  seamAllowanceCm: 1,
  sheetWidthCm: 20,
  sheetHeightCm: 30,
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
      grainline: [
        { x: 5, y: 1 },
        { x: 5, y: 9 },
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
      dart: [
        { x: 3, y: 2 },
        { x: 4, y: 6 },
        { x: 5, y: 2 },
      ],
    },
  ],
};

describe("toDxfAama", () => {
  it("cabeçalho R13 (AC1012), mm, e comentário 999 do subset AAMA/ASTM", () => {
    const dxf = toDxfAama(squareModel);
    expect(dxf).toMatch(/\$ACADVER\n1\nAC1012/);
    expect(dxf).toMatch(/\$INSUNITS\n70\n4/);
    expect(dxf).toContain("AAMA/ASTM subset");
    expect(dxf).toContain("tam M");
  });

  it("declara camadas numeradas (1/7/8), não as nomeadas do DXF genérico", () => {
    const dxf = toDxfAama(squareModel);
    // bloco da TABLE LAYER contém os nomes numéricos
    expect(dxf).toMatch(/LAYER\n2\n1\n/);
    expect(dxf).toMatch(/LAYER\n2\n7\n/);
    expect(dxf).toMatch(/LAYER\n2\n8\n/);
    expect(dxf).not.toContain("CONTORNO");
    expect(dxf).not.toContain("GRAINLINE");
  });

  it("peça vira BLOCK + INSERT, com POLYLINE/SEQEND (R13) e sem LWPOLYLINE", () => {
    const dxf = toDxfAama(squareModel);
    expect(dxf).toContain("\nBLOCKS\n");
    expect(dxf.match(/\nBLOCK\n/g)?.length).toBe(1);
    expect(dxf.match(/\nINSERT\n/g)?.length).toBe(1);
    expect(dxf).toContain("\nPOLYLINE\n");
    expect(dxf).toContain("\nSEQEND\n");
    expect(dxf).not.toContain("LWPOLYLINE");
  });

  it("nome/qtd como texto de sistema na peça", () => {
    const dxf = toDxfAama(squareModel);
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf).toContain("FRENTE 2X");
  });

  it("escala 1:1: contorno de 10cm ocupa 100 unidades (mm)", () => {
    const xs = firstPolylineXs(toDxfAama(squareModel));
    expect(xs.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 6);
  });

  it("pence sai como POLYLINE aberto na camada 8; sem pence não há camada 8", () => {
    const withDart = toDxfAama(dartModel);
    // duas POLYLINEs: contorno (camada 1) + pence (camada 8)
    expect(withDart.match(/\nPOLYLINE\n/g)?.length).toBe(2);
    expect(withDart).toMatch(/POLYLINE\n8\n8\n66\n1\n70\n0/); // aberto na camada 8
    const noDart = toDxfAama(squareModel);
    expect(noDart.match(/\nPOLYLINE\n/g)?.length).toBe(1); // só o contorno
  });

  it("um BLOCK e um INSERT por peça em models multi-peça", () => {
    const multi: ExportModel = {
      ...squareModel,
      pieces: [squareModel.pieces[0], dartModel.pieces[0]],
    };
    const dxf = toDxfAama(multi);
    expect(dxf.match(/\nBLOCK\n/g)?.length).toBe(2);
    expect(dxf.match(/\nINSERT\n/g)?.length).toBe(2);
  });
});
