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
  foldLabel: "dobra",
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
      fold: [
        { x: 5, y: 0 },
        { x: 5, y: 10 },
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

  // #83: XML forbids "--" anywhere inside a comment, and a run ending in "-"
  // would touch the closing "-->" — neither patternName (rename only trims
  // + caps length, no character rules) nor size (free text from
  // SizeChartTable's add-size dialog) are validated against this upstream,
  // so the comment builder has to strip it itself.
  it("never emits '--' in the header comment for a hyphenated pattern name", () => {
    const svg = toSvg({ ...model, patternName: "Vestido -- v2" });
    const comment = svg.split("\n")[1];
    expect(comment.startsWith("<!--") && comment.endsWith("-->")).toBe(true);
    expect(comment.slice(4, -3)).not.toContain("--");
  });

  it("never emits '--' in the header comment for a name ending the comment early", () => {
    const svg = toSvg({ ...model, patternName: "Vestido --> injected" });
    const comment = svg.split("\n")[1];
    expect(comment.slice(4, -3)).not.toContain("--");
    // The comment must still be exactly one line — a live "-->" inside the
    // name would terminate it early and dump the rest as raw markup ahead
    // of <svg>, which is the "text data outside of root node" failure mode
    // the issue reproduced against the repo's own XML parser.
    expect(svg.split("\n")[2]).toMatch(/^<svg /);
  });

  it("sanitizes the size label the same way — it is not covered by escapeXml at all", () => {
    const svg = toSvg({ ...model, size: "M--X-->G" });
    const comment = svg.split("\n")[1];
    expect(comment.slice(4, -3)).not.toContain("--");
  });

  // #87: the dart path used to close with a trailing " Z", drawing a fourth
  // segment straight back along the base -- a marking line that isn't part
  // of the dart and disagreed with the AAMA exporter's own open polyline
  // for the identical pattern.
  it("each dart path is open -- no trailing Z, unlike the outline", () => {
    const dartModel: ExportModel = {
      ...model,
      pieces: [
        {
          ...model.pieces[0],
          id: "back",
          name: "Costas",
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
    const svg = toSvg(dartModel);
    const dartPaths = svg
      .split("\n")
      .filter((l) => l.includes("<path ") && l.includes('stroke="#4a5a3a"'));
    expect(dartPaths).toHaveLength(2); // one per dart
    for (const dartPath of dartPaths) {
      expect(dartPath).not.toContain("Z");
      // 3 dart points -> M + 2 L commands only, no segment closing back to the first
      expect(dartPath.match(/[ML]\d/g)?.length).toBe(3);
    }
  });

  // #126: rendered as a dashed <line> (distinct dasharray from the
  // grainline's) plus the pt-BR foldLabel text at its midpoint; absent when
  // the piece has no fold.
  it("fold is a dashed line with the foldLabel text; no fold means neither", () => {
    const svg = toSvg(model);
    expect(svg).toContain('stroke-dasharray="8 2 2 2"');
    expect(svg).toContain(">dobra<");

    const noFoldModel: ExportModel = {
      ...model,
      pieces: [{ ...model.pieces[0], fold: undefined }],
    };
    const noFoldSvg = toSvg(noFoldModel);
    expect(noFoldSvg).not.toContain('stroke-dasharray="8 2 2 2"');
    expect(noFoldSvg).not.toContain(">dobra<");
  });
});
