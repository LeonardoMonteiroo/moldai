import { describe, it, expect } from "vitest";
import { flattenCubic, TOL_CM, flattenOutlineCm } from "./dxf";
import type { ExPt } from "./model";

// evaluates the true cubic at t
function cubicAt(p0: ExPt, c1: ExPt, c2: ExPt, p3: ExPt, t: number): ExPt {
  const u = 1 - t;
  const b0 = u * u * u,
    b1 = 3 * u * u * t,
    b2 = 3 * u * t * t,
    b3 = t * t * t;
  return {
    x: b0 * p0.x + b1 * c1.x + b2 * c2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * c1.y + b2 * c2.y + b3 * p3.y,
  };
}

// distance from point q to segment a→b
function distToSegment(q: ExPt, a: ExPt, b: ExPt): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(q.x - a.x, q.y - a.y);
  let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

// largest distance from the true (densely sampled) curve to the polyline [p0, ...pts]
function maxCurveError(
  p0: ExPt,
  c1: ExPt,
  c2: ExPt,
  p3: ExPt,
  pts: ExPt[],
): number {
  const poly = [p0, ...pts];
  let worst = 0;
  for (let k = 0; k <= 400; k++) {
    const c = cubicAt(p0, c1, c2, p3, k / 400);
    let best = Infinity;
    for (let s = 0; s + 1 < poly.length; s++)
      best = Math.min(best, distToSegment(c, poly[s], poly[s + 1]));
    worst = Math.max(worst, best);
  }
  return worst;
}

describe("flattenCubic", () => {
  it("a practically straight cubic becomes a single point (p3)", () => {
    const p0 = { x: 0, y: 0 },
      c1 = { x: 3, y: 0 },
      c2 = { x: 7, y: 0 },
      p3 = { x: 10, y: 0 };
    const out = flattenCubic(p0, c1, c2, p3, TOL_CM);
    expect(out).toEqual([{ x: 10, y: 0 }]);
  });

  it("curved cubic: the polyline approximates the curve within tolerance and ends at p3", () => {
    const p0 = { x: 0, y: 0 },
      c1 = { x: 0, y: 10 },
      c2 = { x: 10, y: 10 },
      p3 = { x: 10, y: 0 };
    const out = flattenCubic(p0, c1, c2, p3, TOL_CM);
    expect(out.length).toBeGreaterThan(1);
    // the true curve never strays from the polyline by more than the tolerance
    expect(maxCurveError(p0, c1, c2, p3, out)).toBeLessThanOrEqual(TOL_CM);
    expect(out[out.length - 1]).toEqual({ x: 10, y: 0 });
  });
});

import { toDxf } from "./dxf";
import type { ExportModel } from "./model";

// vertices (x,y) of the first LWPOLYLINE on the given layer -- #123: CONTORNO
// (cut) and COSTURA (net) are both LWPOLYLINEs now, so "the first one" is no
// longer unambiguous the way it was before this existed.
function lwVerticesOnLayer(
  dxf: string,
  layer: string,
): { x: number; y: number }[] {
  const lines = dxf.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "LWPOLYLINE" || lines[i + 2] !== layer) continue;
    const count = Number(lines[i + 4]);
    const verts: { x: number; y: number }[] = [];
    let k = i;
    while (verts.length < count) {
      const xi = lines.indexOf("10", k);
      verts.push({ x: Number(lines[xi + 1]), y: Number(lines[xi + 3]) });
      k = xi + 4;
    }
    return verts;
  }
  throw new Error(`no LWPOLYLINE found on layer ${layer}`);
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
      // #123: the 1cm-allowance cut line, matching what offsetOutlineCm
      // actually produces for a plain square (see offset.test.ts's own
      // "grows a square by exactly d" case) -- a 12x12 square.
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

const cubicModel: ExportModel = {
  patternName: "Curva",
  size: "P",
  unit: "cm",
  seamAllowanceCm: null,
  sheetWidthCm: 20,
  sheetHeightCm: 20,
  foldLabel: "dobra",
  pieces: [
    {
      id: "c",
      name: "Copa",
      qty: 1,
      widthCm: 10,
      heightCm: 10,
      outline: {
        start: { x: 0, y: 0 },
        segs: [
          {
            kind: "cubic",
            c1: { x: 0, y: 10 },
            c2: { x: 10, y: 10 },
            to: { x: 10, y: 0 },
          },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      cutOutline: {
        start: { x: -1, y: -1 },
        segs: [
          {
            kind: "cubic",
            c1: { x: -1, y: 11 },
            c2: { x: 11, y: 11 },
            to: { x: 11, y: -1 },
          },
          { kind: "line", to: { x: -1, y: -1 } },
        ],
      },
      cutWidthCm: 12,
      cutHeightCm: 12,
      originCm: { x: 2, y: 2 },
    },
  ],
};

// Same 3-point dart shape as lib/export/dxf-aama.test.ts's dartModel, so
// every serializer's test exercises the identical fixture.
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

describe("toDxf", () => {
  it("header: $INSUNITS = 4 (mm) and a 999 comment with size/allowance", () => {
    const dxf = toDxf(squareModel);
    expect(dxf).toMatch(/\$ACADVER\n1\nAC1014/);
    expect(dxf).toMatch(/\$INSUNITS\n70\n4/);
    expect(dxf).toContain("999");
    expect(dxf).toContain("tam M");
    expect(dxf).toContain(
      "folga 1cm (CONTORNO = linha de corte, COSTURA = linha de costura líquida)",
    );
  });

  it("declares the seven named layers", () => {
    const dxf = toDxf(squareModel);
    for (const layer of [
      "CONTORNO",
      "COSTURA",
      "INTERNO",
      "GRAINLINE",
      "TEXTO",
      "DOBRA",
      "PIQUE",
    ]) {
      expect(dxf).toContain(layer);
    }
  });

  // #123: CONTORNO (the cut line) and COSTURA (the net line) are each their
  // own LWPOLYLINE now -- there is no dart on this fixture, so exactly two.
  it("cut + net LWPOLYLINEs per piece, with LINE (grainline + fold) and TEXT (name)", () => {
    const dxf = toDxf(squareModel);
    expect(dxf.match(/\nLWPOLYLINE\n/g)?.length).toBe(2);
    expect(dxf.match(/\nLINE\n/g)?.length).toBe(2); // grainline + fold
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf).toContain("FRENTE · 2x");
  });

  // #126: geometry-only, matching the grainline's own no-text precedent --
  // "dobra" is reserved for the printed formats (svg/pdf).
  it("fold comes out as a LINE on the DOBRA layer; no fold means no such LINE", () => {
    const dxf = toDxf(squareModel);
    expect(dxf).toMatch(/LINE\n8\nDOBRA\n10\n70\n20\n280\n11\n70\n21\n180/);
    const noFold: ExportModel = {
      ...squareModel,
      pieces: [{ ...squareModel.pieces[0], fold: undefined }],
    };
    expect(toDxf(noFold)).not.toContain("DOBRA\n10");
  });

  // #124: geometry-only, matching the grainline/fold's own no-text
  // precedent -- one LINE per notch, on its own PIQUE layer.
  it("each notch comes out as a LINE on the PIQUE layer; no notches means none", () => {
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
    const dxf = toDxf(notchModel);
    // origin (2,2)cm, sheetHeightCm=30: X=(2+x)*10, Y=(30-(2+y))*10
    expect(dxf).toMatch(/LINE\n8\nPIQUE\n10\n20\n20\n230\n11\n23\n21\n230/);
    expect(toDxf(squareModel)).not.toContain("PIQUE\n10");
  });

  // #87: the dart used to close (p(70,1)), drawing a fourth segment straight
  // back along the base -- a marking line that isn't part of the dart and
  // disagreed with the AAMA exporter's own open layer-8 polyline for the
  // identical pattern.
  it("dart comes out as an OPEN LWPOLYLINE (70=0) with exactly dart.length vertices", () => {
    const dxf = toDxf(dartModel);
    expect(dxf.match(/\nLWPOLYLINE\n/g)?.length).toBe(3); // cut + net + dart
    expect(dxf).toMatch(/LWPOLYLINE\n8\nINTERNO\n90\n3\n70\n0\n/);
  });

  // #127: a dart's own fold line -> LINE on INTERNO, the same layer as the
  // dart itself; a drill hole -> both a POINT and a CIRCLE, also on INTERNO.
  it("internal fold line and drill hole come out on INTERNO", () => {
    const internalsModel: ExportModel = {
      ...squareModel,
      pieces: [
        {
          ...squareModel.pieces[0],
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
    const dxf = toDxf(internalsModel);
    // origin (2,2)cm, sheetHeightCm=30: X=(2+x)*10, Y=(30-(2+y))*10
    expect(dxf).toMatch(/LINE\n8\nINTERNO\n10\n60\n20\n260\n11\n60\n21\n220/);
    expect(dxf).toMatch(/POINT\n8\nINTERNO\n10\n60\n20\n250/);
    expect(dxf).toMatch(/CIRCLE\n8\nINTERNO\n10\n60\n20\n250\n40\n1\.5/);
    const noInternals = toDxf(squareModel);
    expect(noInternals).not.toContain("\nPOINT\n");
    expect(noInternals).not.toContain("\nCIRCLE\n");
  });

  // #244: a pleat's own placement/stitch line -> an open LWPOLYLINE on
  // INTERNO, same "internal, not cut" layer as the dart/fold line above.
  it("a pleat's placement line comes out as an OPEN LWPOLYLINE on INTERNO", () => {
    const pleatModel: ExportModel = {
      ...squareModel,
      pieces: [
        {
          ...squareModel.pieces[0],
          pleats: [
            [
              { x: 4, y: 2 },
              { x: 4, y: 6 },
            ],
          ],
        },
      ],
    };
    const dxf = toDxf(pleatModel);
    expect(dxf.match(/\nLWPOLYLINE\n/g)?.length).toBe(3); // cut + net + pleat
    expect(dxf).toMatch(/LWPOLYLINE\n8\nINTERNO\n90\n2\n70\n0\n/);
    const noPleats = toDxf(squareModel);
    expect(noPleats.match(/\nLWPOLYLINE\n/g)?.length).toBe(2); // cut + net only
  });

  it("1:1 scale: CONTORNO is the 12cm cut line, COSTURA the 10cm net line (mm)", () => {
    const dxf = toDxf(squareModel);
    const cutXs = lwVerticesOnLayer(dxf, "CONTORNO").map((v) => v.x);
    const netXs = lwVerticesOnLayer(dxf, "COSTURA").map((v) => v.x);
    expect(Math.max(...cutXs) - Math.min(...cutXs)).toBeCloseTo(120, 6);
    expect(Math.max(...netXs) - Math.min(...netXs)).toBeCloseTo(100, 6);
  });

  it("flattening inserts vertices: an outline with a cubic has more vertices than segs", () => {
    const dxf = toDxf(cubicModel);
    expect(lwVerticesOnLayer(dxf, "COSTURA").length).toBeGreaterThan(2); // 2 segs in the model
  });

  it("a null allowance becomes 0cm in the comment", () => {
    const dxf = toDxf(cubicModel);
    expect(dxf).toContain(
      "folga 0cm (CONTORNO = linha de corte, COSTURA = linha de costura líquida)",
    );
  });

  // #243: an internal loop (hole) is a genuine cut boundary too -- it shares
  // CONTORNO/COSTURA with the piece's own outer boundary, not INTERNO (which
  // is reserved for marks that are never actually cut).
  describe("internal loops (#243)", () => {
    function allLwPolylineLayers(dxf: string): string[] {
      const lines = dxf.split("\n");
      const layers: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === "LWPOLYLINE") layers.push(lines[i + 2]);
      }
      return layers;
    }

    const loopModel: ExportModel = {
      ...squareModel,
      pieces: [
        {
          ...squareModel.pieces[0],
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

    it("adds one more CONTORNO and one more COSTURA LWPOLYLINE, not a third layer", () => {
      const layers = allLwPolylineLayers(toDxf(loopModel));
      expect(layers.filter((l) => l === "CONTORNO")).toHaveLength(2);
      expect(layers.filter((l) => l === "COSTURA")).toHaveLength(2);
      expect(layers).toHaveLength(4); // no loop vertices land on INTERNO
    });

    it("the loop's own cut vertices are present in the emitted geometry", () => {
      const dxf = toDxf(loopModel);
      // loop cutOutline point (4,4)cm, origin (2,2)cm, sheetHeightCm=30:
      // X=(2+4)*10=60, Y=(30-(2+4))*10=240
      expect(dxf).toContain("10\n60\n20\n240");
    });
  });
});

describe("flattenOutlineCm", () => {
  it("straight-only outline: corner vertices, without duplicating the closing one", () => {
    const out = flattenOutlineCm(
      {
        start: { x: 0, y: 0 },
        segs: [
          { kind: "line", to: { x: 10, y: 0 } },
          { kind: "line", to: { x: 10, y: 10 } },
          { kind: "line", to: { x: 0, y: 10 } },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      TOL_CM,
    );
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("outline with a cubic: flattening inserts vertices (more than the seg count)", () => {
    const out = flattenOutlineCm(
      {
        start: { x: 0, y: 0 },
        segs: [
          {
            kind: "cubic",
            c1: { x: 0, y: 10 },
            c2: { x: 10, y: 10 },
            to: { x: 10, y: 0 },
          },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      TOL_CM,
    );
    expect(out.length).toBeGreaterThan(2);
  });
});
