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
      id: "front",
      name: "Frente",
      qty: 1,
      widthCm: 10,
      heightCm: 10,
      // 10cm-sided square -> 4 lines
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
  it("generates 1:1 mm dimensions and a viewBox", () => {
    const svg = toSvg(model);
    expect(svg).toContain('width="200mm"'); // 20cm * 10
    expect(svg).toContain('height="300mm"');
    expect(svg).toContain('viewBox="0 0 200 300"');
  });

  it("1:1 scale: a 10cm edge becomes 100 units in the path", () => {
    const svg = toSvg(model);
    // origin x=2cm -> 20 ; right edge x=2+10=12cm -> 120
    expect(svg).toContain("M20 20");
    expect(svg).toContain("L120 20");
  });

  it("one outline path per piece + a size/allowance annotation in the header", () => {
    const svg = toSvg(model);
    expect(svg.match(/<path /g)?.length).toBe(1);
    expect(svg).toContain("tam M");
    expect(svg).toContain("folga 1cm (net line)");
    expect(svg).toContain("Camiseta &amp; Cia"); // XML-escaped
  });
});
