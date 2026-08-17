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

// vertex count (code 90) of the first LWPOLYLINE
function firstLwVertexCount(dxf: string): number {
  const lines = dxf.split("\n");
  const i = lines.indexOf("LWPOLYLINE");
  const j = lines.indexOf("90", i);
  return Number(lines[j + 1]);
}

// vertices (x,y) of the first LWPOLYLINE — 10/20 pairs right after the entity header
function firstLwVertices(dxf: string): { x: number; y: number }[] {
  const lines = dxf.split("\n");
  const i = lines.indexOf("LWPOLYLINE");
  const count = firstLwVertexCount(dxf);
  const verts: { x: number; y: number }[] = [];
  let k = i;
  while (verts.length < count) {
    const xi = lines.indexOf("10", k);
    verts.push({ x: Number(lines[xi + 1]), y: Number(lines[xi + 3]) });
    k = xi + 4;
  }
  return verts;
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

const cubicModel: ExportModel = {
  patternName: "Curva",
  size: "P",
  unit: "cm",
  seamAllowanceCm: null,
  sheetWidthCm: 20,
  sheetHeightCm: 20,
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
      originCm: { x: 2, y: 2 },
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
    expect(dxf).toContain("folga 1cm (net line)");
  });

  it("declares the four named layers", () => {
    const dxf = toDxf(squareModel);
    for (const layer of ["CONTORNO", "INTERNO", "GRAINLINE", "TEXTO"]) {
      expect(dxf).toContain(layer);
    }
  });

  it("one outline LWPOLYLINE per piece, with LINE (grainline) and TEXT (name)", () => {
    const dxf = toDxf(squareModel);
    expect(dxf.match(/\nLWPOLYLINE\n/g)?.length).toBe(1); // only the outline (no dart)
    expect(dxf).toContain("\nLINE\n");
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf).toContain("FRENTE · 2x");
  });

  it("1:1 scale: a 10cm-wide outline spans 100 units (mm)", () => {
    const verts = firstLwVertices(toDxf(squareModel));
    const xs = verts.map((v) => v.x);
    // 10cm width -> 100-unit (mm) X span, regardless of the Y flip
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 6);
  });

  it("flattening inserts vertices: an outline with a cubic has more vertices than segs", () => {
    const dxf = toDxf(cubicModel);
    expect(firstLwVertexCount(dxf)).toBeGreaterThan(2); // 2 segs in the model
  });

  it("a null allowance becomes 0cm in the comment", () => {
    const dxf = toDxf(cubicModel);
    expect(dxf).toContain("folga 0cm (net line)");
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
