import { describe, it, expect } from "vitest";
import { autoLayout, bbox, polyPath, outlinePath, DraftedPiece } from "./core";

const rect = (id: string, w: number, h: number): DraftedPiece => ({
  id, name: id, qty: 1,
  outlineCm: [[0, 0], [w, 0], [w, h], [0, h]],
  detailRows: [],
});

describe("core drafting", () => {
  it("bbox mede a peça", () => {
    expect(bbox([[2, 3], [10, 3], [10, 20]])).toEqual({ minX: 2, minY: 3, maxX: 10, maxY: 20, w: 8, h: 17 });
  });

  it("polyPath fecha o polígono", () => {
    expect(polyPath([[0, 0], [1, 0], [1, 1]]).kind).toBe("polygon");
  });

  it("autoLayout empacota peças sem sobreposição dentro do viewBox", () => {
    const { pieces, viewBox } = autoLayout([rect("a", 10, 20), rect("b", 30, 40)], 5);
    expect(pieces).toHaveLength(2);
    expect(viewBox.w).toBeGreaterThan(0);
    expect(viewBox.h).toBeGreaterThan(0);
    const rects = pieces.map((p) => {
      const xs = p.vertices!.map((v) => v.x);
      const ys = p.vertices!.map((v) => v.y);
      return {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
      };
    });
    // toda peça cabe dentro do viewBox empacotado
    for (const r of rects) {
      expect(r.minX).toBeGreaterThanOrEqual(0);
      expect(r.minY).toBeGreaterThanOrEqual(0);
      expect(r.maxX).toBeLessThanOrEqual(viewBox.w + 1e-6);
      expect(r.maxY).toBeLessThanOrEqual(viewBox.h + 1e-6);
    }
    // as duas peças nunca se sobrepõem (retângulos disjuntos)
    const [a, b] = rects;
    const disjoint =
      a.maxX <= b.minX + 1e-6 || b.maxX <= a.minX + 1e-6 ||
      a.maxY <= b.minY + 1e-6 || b.maxY <= a.minY + 1e-6;
    expect(disjoint).toBe(true);
  });

  describe("outlinePath", () => {
    it("sem spans: só retas (L), nenhum C, fecha com Z", () => {
      const o = outlinePath([[0, 0], [10, 0], [10, 10], [0, 10]], []) as { kind: "path"; d: string };
      expect(o.kind).toBe("path");
      expect(o.d).not.toMatch(/C/);
      expect(o.d).toMatch(/L/);
      expect(o.d).toMatch(/Z$/);
    });

    it("com span: as arestas do span viram C; as de fora seguem L", () => {
      // quadrado; curva só a aresta entre v1 e v2 (span [1,2])
      const o = outlinePath([[0, 0], [10, 0], [10, 10], [0, 10]], [[1, 2]]) as { kind: "path"; d: string };
      expect(o.d).toMatch(/C/);
      expect(o.d).toMatch(/L/);
      expect(o.d).toMatch(/Z$/);
    });

    it("span de fechamento [k,n] curva a aresta que volta ao vértice 0", () => {
      const pts: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
      const o = outlinePath(pts, [[3, 4]]) as { kind: "path"; d: string };
      // 4 vértices; span [3,4] cobre a aresta 3->0 (fechamento)
      expect(o.d).toMatch(/C[^Z]*Z$/);
    });
  });

  it("autoLayout anexa vertices alinhados aos cantos do outline", () => {
    const { pieces } = autoLayout([rect("a", 10, 20)], 5);
    const p = pieces[0];
    expect(p.vertices).toBeDefined();
    expect(p.vertices).toHaveLength(4);
    // primeiro vértice = primeiro par "x,y" do polygon
    const [px, py] = (p.outline as { points: string }).points
      .split(" ")[0].split(",").map(Number);
    expect(p.vertices![0].x).toBeCloseTo(px, 1);
    expect(p.vertices![0].y).toBeCloseTo(py, 1);
  });
});
