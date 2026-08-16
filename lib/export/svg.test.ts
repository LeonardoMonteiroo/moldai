import { describe, it, expect } from "vitest";
import { toSvg } from "./svg";
import type { ExportModel } from "./model";

const model: ExportModel = {
  patternName: "Camiseta & Cia",
  size: "M",
  unit: "cm",
  seamAllowanceCm: 1,
  sheetWidthCm: 20,
  sheetHeightCm: 30,
  pieces: [
    {
      id: "frente",
      name: "Frente",
      qty: 1,
      widthCm: 10,
      heightCm: 10,
      // quadrado 10cm de lado -> 4 lines
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

describe("toSvg", () => {
  it("gera dimensões em mm 1:1 e viewBox", () => {
    const svg = toSvg(model);
    expect(svg).toContain('width="200mm"'); // 20cm * 10
    expect(svg).toContain('height="300mm"');
    expect(svg).toContain('viewBox="0 0 200 300"');
  });

  it("escala 1:1: aresta de 10cm vira 100 unidades no path", () => {
    const svg = toSvg(model);
    // origem x=2cm -> 20 ; borda direita x=2+10=12cm -> 120
    expect(svg).toContain("M20 20");
    expect(svg).toContain("L120 20");
  });

  it("um path de contorno por peça + anotação de tamanho/folga no cabeçalho", () => {
    const svg = toSvg(model);
    expect(svg.match(/<path /g)?.length).toBe(1);
    expect(svg).toContain("tam M");
    expect(svg).toContain("folga 1cm (net line)");
    expect(svg).toContain("Camiseta &amp; Cia"); // XML escapado
  });
});
