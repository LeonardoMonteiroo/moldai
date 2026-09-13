import { describe, it, expect } from "vitest";
import { toSvg } from "./svg";
import type { ExportModel } from "./model";

// #85: a structural well-formedness check with no external XML parser --
// `saxes` is only reachable today as jsdom's transitive dependency, and this
// file lives under lib/, which runs in the `node` vitest project (no reason
// to have jsdom's tree present at all). A jsdom bump that drops/renames its
// XML parser, or a stricter package manager, would break an import of
// "saxes" here with an unrelated-looking module-resolution error, for a
// dependency this file has no declared right to use. This checks exactly
// the shape lib/export/svg.ts actually emits: an XML decl, a single-line
// header comment, one root <svg>, a body of self-closing tags or single-line
// <text>...</text> pairs, and a matching </svg> -- rejecting an unescaped
// "&", an unclosed comment, or any content trailing past the root element,
// which is exactly how the "--" comment defect (#83) shipped unnoticed.
const NUM = String.raw`-?\d+(?:\.\d+)?`;
const PATH_D = new RegExp(
  `^M${NUM} ${NUM}(?: L${NUM} ${NUM}| C(?:${NUM} ){5}${NUM})*( Z)?$`,
);

function assertWellFormedSvg(svg: string): void {
  const lines = svg.split("\n");
  expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');

  // A single-line header comment, properly opened and closed.
  expect(lines[1].startsWith("<!--")).toBe(true);
  expect(lines[1].endsWith("-->")).toBe(true);
  const commentBody = lines[1].slice(4, -3);
  expect(commentBody).not.toContain("--");
  expect(commentBody).not.toContain("<!--");

  // Exactly one root element, opened right after the comment and closed on
  // the document's very last line -- nothing precedes or trails it.
  expect(lines[2]).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect(lines[lines.length - 1]).toBe("</svg>");

  // Every line in the body is exactly one balanced element: a self-closing
  // <path>/<line>, or a <text>…</text> pair on one line -- never an
  // unclosed tag or stray markup.
  for (const line of lines.slice(3, -1)) {
    const isSelfClosing = /^<(path|line)\b[^<>]*\/>$/.test(line);
    const isTextPair = /^<text\b[^<>]*>[^<>]*<\/text>$/.test(line);
    expect(isSelfClosing || isTextPair).toBe(true);
    // No bare "&" that isn't one of the entities escapeXml actually emits.
    expect(line).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
  }

  // Every path's `d` attribute is a valid, well-formed command sequence
  // (M start, then only L/C commands, optionally closed with Z) -- never
  // malformed or truncated coordinate data.
  for (const d of svg.match(/(?<=<path[^<>]*\bd=")[^"]*(?=")/g) ?? []) {
    expect(d).toMatch(PATH_D);
  }
}

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
      // #123: the 1cm-allowance cut line, matching the other serializers'
      // own squareModel fixture -- a 12x12 square.
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
      notches: [
        { type: "single", outer: { x: 0, y: 5 }, inner: { x: 0.3, y: 5 } },
      ],
      originCm: { x: 2, y: 2 },
    },
  ],
};

describe("toSvg", () => {
  // #85: svg.test.ts asserted dimensions/scale/piece counts by substring but
  // never that the output as a whole is well-formed -- exactly how the
  // `--`-inside-a-comment defect (#83, covered below) shipped unnoticed.
  it("is well-formed end to end", () => {
    assertWellFormedSvg(toSvg(model));
  });

  it("stays well-formed even with untrusted names carrying XML-hostile characters", () => {
    const svg = toSvg({
      ...model,
      patternName: `Vestido <script>"&'-->-- ${"設計圖"}`,
      size: `M--><!--${"-".repeat(5)}`,
    });
    assertWellFormedSvg(svg);
  });

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

  // #123: a solid cut-line path plus a dashed net-line path per piece.
  it("two outline paths per piece (cut + net) + a size/allowance annotation in the header", () => {
    const svg = toSvg(model);
    expect(svg.match(/<path /g)?.length).toBe(2);
    expect(svg).toContain("tam M");
    expect(svg).toContain(
      "folga 1cm (contorno sólido = linha de corte, tracejado = linha de costura líquida)",
    );
    expect(svg).toContain("Camiseta &amp; Cia"); // XML-escaped
  });

  it("cut line is solid, net line is dashed and visually distinct", () => {
    const svg = toSvg(model);
    const paths = svg.split("\n").filter((l) => l.includes("<path "));
    expect(paths).toHaveLength(2);
    const cutPath = paths.find(
      (p) => p.includes('stroke="#000"') && !p.includes("stroke-dasharray"),
    );
    const netPath = paths.find((p) => p.includes('stroke-dasharray="3 2"'));
    expect(cutPath).toBeDefined();
    expect(netPath).toBeDefined();
    // cut line spans the 12cm square (origin 2cm -> 10..110mm), net the 10cm one (20..110... )
    expect(cutPath).toContain("M10 10");
    expect(netPath).toContain("M20 20");
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

  // #127: a dart's own fold line renders as a fine dotted <line> (distinct
  // dasharray from both the dart's own solid path and the piece's
  // cut-on-fold axis below), and a drill hole as a small open <circle>.
  it("internal fold line is a dotted line; drill hole is an open circle", () => {
    const internalsModel: ExportModel = {
      ...model,
      pieces: [
        {
          ...model.pieces[0],
          internalFoldLines: [
            [
              { x: 4, y: 2 },
              { x: 4, y: 6 },
            ],
          ],
          drillHoles: [{ at: { x: 4, y: 3 }, rCm: 0.15 }],
        },
      ],
    };
    const svg = toSvg(internalsModel);
    expect(svg).toContain('stroke-dasharray="1 1.5"');
    const circle = svg.split("\n").find((l) => l.includes("<circle "));
    expect(circle).toBeDefined();
    expect(circle).toContain('stroke="#000"');
    expect(circle).toContain('fill="none"');
    const noInternals = toSvg(model);
    expect(noInternals).not.toContain("<circle ");
  });

  // #244: a pleat's own placement/stitch line renders as its own open path,
  // with a dash pattern distinct from the fold line's above so the two
  // read apart.
  it("a pleat's placement line renders as an open path with its own dash pattern", () => {
    const pleatModel: ExportModel = {
      ...model,
      pieces: [
        {
          ...model.pieces[0],
          pleats: [
            [
              { x: 4, y: 0 },
              { x: 5, y: 10 },
            ],
          ],
        },
      ],
    };
    const svg = toSvg(pleatModel);
    expect(svg).toContain('stroke-dasharray="2 2"');
    const noPleats = toSvg(model);
    expect(noPleats).not.toContain('stroke-dasharray="2 2"');
  });

  // #344: a style line's own cut geometry (the sleeve's own placket
  // opening) renders SOLID black, unlike every dashed olive mark above --
  // it's a real cut, not a placement guide.
  it("a style line's cut geometry renders as a solid black path, not dashed", () => {
    const styleLineModel: ExportModel = {
      ...model,
      pieces: [
        {
          ...model.pieces[0],
          styleLines: [
            [
              { x: 4, y: 0 },
              { x: 5, y: 10 },
            ],
          ],
        },
      ],
    };
    const svg = toSvg(styleLineModel);
    expect(svg).toContain('fill="none" stroke="#000" stroke-width="0.25"/>');
    const noStyleLines = toSvg(model);
    expect(noStyleLines).not.toContain(
      'fill="none" stroke="#000" stroke-width="0.25"/>',
    );
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

  // #124: one solid tick per notch, from its outer to its inner point;
  // absent when the piece has none.
  it("renders a solid tick line per notch; no notches means none", () => {
    const svg = toSvg(model);
    // origin x=2cm,y=2cm -> outer (0,5)cm -> 20,70mm ; inner (0.3,5)cm -> 23,70mm
    expect(svg).toContain('<line x1="20" y1="70" x2="23" y2="70"');

    const noNotchModel: ExportModel = {
      ...model,
      pieces: [{ ...model.pieces[0], notches: undefined }],
    };
    const noNotchSvg = toSvg(noNotchModel);
    expect(noNotchSvg).not.toContain('x1="20" y1="70"');
  });

  // #243: an internal loop (hole) draws exactly like the piece's own outer
  // boundary -- one more solid cut path + one more dashed net path.
  describe("internal loops (#243)", () => {
    const loopModel: ExportModel = {
      ...model,
      pieces: [
        {
          ...model.pieces[0],
          internalLoops: [
            {
              outline: {
                start: { x: 3, y: 3 },
                segs: [
                  { kind: "line", to: { x: 7, y: 3 } },
                  { kind: "line", to: { x: 7, y: 7 } },
                  { kind: "line", to: { x: 3, y: 7 } },
                  { kind: "line", to: { x: 3, y: 3 } },
                ],
              },
              cutOutline: {
                start: { x: 4, y: 4 },
                segs: [
                  { kind: "line", to: { x: 6, y: 4 } },
                  { kind: "line", to: { x: 6, y: 6 } },
                  { kind: "line", to: { x: 4, y: 6 } },
                  { kind: "line", to: { x: 4, y: 4 } },
                ],
              },
            },
          ],
        },
      ],
    };

    it("adds one solid cut path and one dashed net path per loop", () => {
      const noLoop = toSvg(model);
      const withLoop = toSvg(loopModel);
      expect(withLoop.match(/<path /g)?.length).toBe(
        (noLoop.match(/<path /g)?.length ?? 0) + 2,
      );
    });

    it("the loop's cut line is smaller than its own net line -- it shrinks, not grows", () => {
      const svg = toSvg(loopModel);
      // net loop: (3,3)-(7,7)cm -> mm at origin (2,2)cm: M50 50 (=(2+3)*10)
      expect(svg).toContain("M50 50");
      // cut loop: (4,4)-(6,6)cm -> M60 60
      expect(svg).toContain("M60 60");
    });

    it("stays well-formed with an internal loop present", () => {
      assertWellFormedSvg(toSvg(loopModel));
    });
  });
});
