import { describe, it, expect } from "vitest";
import { flattenCubic, TOL_CM } from "./dxf";
import type { ExPt } from "./model";

// avalia a cúbica verdadeira em t
function cubicAt(p0: ExPt, c1: ExPt, c2: ExPt, p3: ExPt, t: number): ExPt {
  const u = 1 - t;
  const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
  return {
    x: b0 * p0.x + b1 * c1.x + b2 * c2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * c1.y + b2 * c2.y + b3 * p3.y,
  };
}

// distância do ponto q ao segmento a→b
function distToSegment(q: ExPt, a: ExPt, b: ExPt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(q.x - a.x, q.y - a.y);
  let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

// maior distância da curva verdadeira (amostrada densa) à polilinha [p0, ...pts]
function maxCurveError(p0: ExPt, c1: ExPt, c2: ExPt, p3: ExPt, pts: ExPt[]): number {
  const poly = [p0, ...pts];
  let worst = 0;
  for (let k = 0; k <= 400; k++) {
    const c = cubicAt(p0, c1, c2, p3, k / 400);
    let best = Infinity;
    for (let s = 0; s + 1 < poly.length; s++) best = Math.min(best, distToSegment(c, poly[s], poly[s + 1]));
    worst = Math.max(worst, best);
  }
  return worst;
}

describe("flattenCubic", () => {
  it("cúbica praticamente reta vira um único ponto (p3)", () => {
    const p0 = { x: 0, y: 0 }, c1 = { x: 3, y: 0 }, c2 = { x: 7, y: 0 }, p3 = { x: 10, y: 0 };
    const out = flattenCubic(p0, c1, c2, p3, TOL_CM);
    expect(out).toEqual([{ x: 10, y: 0 }]);
  });

  it("cúbica curva: a polilinha aproxima a curva dentro da tolerância e termina em p3", () => {
    const p0 = { x: 0, y: 0 }, c1 = { x: 0, y: 10 }, c2 = { x: 10, y: 10 }, p3 = { x: 10, y: 0 };
    const out = flattenCubic(p0, c1, c2, p3, TOL_CM);
    expect(out.length).toBeGreaterThan(1);
    // a curva verdadeira nunca se afasta da polilinha mais que a tolerância
    expect(maxCurveError(p0, c1, c2, p3, out)).toBeLessThanOrEqual(TOL_CM);
    expect(out[out.length - 1]).toEqual({ x: 10, y: 0 });
  });
});

import { toDxf } from "./dxf";
import type { ExportModel } from "./model";

// nº de vértices (código 90) da primeira LWPOLYLINE
function firstLwVertexCount(dxf: string): number {
  const lines = dxf.split("\n");
  const i = lines.indexOf("LWPOLYLINE");
  const j = lines.indexOf("90", i);
  return Number(lines[j + 1]);
}

// vértices (x,y) da primeira LWPOLYLINE — pares 10/20 logo após o cabeçalho da entidade
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
      id: "frente",
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
      grainline: [{ x: 5, y: 1 }, { x: 5, y: 9 }],
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
          { kind: "cubic", c1: { x: 0, y: 10 }, c2: { x: 10, y: 10 }, to: { x: 10, y: 0 } },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      originCm: { x: 2, y: 2 },
    },
  ],
};

describe("toDxf", () => {
  it("cabeçalho: $INSUNITS = 4 (mm) e comentário 999 com tamanho/folga", () => {
    const dxf = toDxf(squareModel);
    expect(dxf).toMatch(/\$INSUNITS\n70\n4/);
    expect(dxf).toContain("999");
    expect(dxf).toContain("tam M");
    expect(dxf).toContain("folga 1cm (net line)");
  });

  it("declara as quatro layers nomeadas", () => {
    const dxf = toDxf(squareModel);
    for (const layer of ["CONTORNO", "INTERNO", "GRAINLINE", "TEXTO"]) {
      expect(dxf).toContain(layer);
    }
  });

  it("uma LWPOLYLINE de contorno por peça, com LINE (fio) e TEXT (nome)", () => {
    const dxf = toDxf(squareModel);
    expect(dxf.match(/\nLWPOLYLINE\n/g)?.length).toBe(1); // só o contorno (sem dart)
    expect(dxf).toContain("\nLINE\n");
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf).toContain("FRENTE · 2x");
  });

  it("escala 1:1: contorno de 10cm de largura ocupa 100 unidades (mm)", () => {
    const verts = firstLwVertices(toDxf(squareModel));
    const xs = verts.map((v) => v.x);
    // largura 10cm -> span de X de 100 unidades (mm), independente da inversão de Y
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 6);
  });

  it("achatamento insere vértices: contorno com cubic tem mais vértices que segs", () => {
    const dxf = toDxf(cubicModel);
    expect(firstLwVertexCount(dxf)).toBeGreaterThan(2); // 2 segs no model
  });

  it("folga nula vira 0cm no comentário", () => {
    const dxf = toDxf(cubicModel);
    expect(dxf).toContain("folga 0cm (net line)");
  });
});
