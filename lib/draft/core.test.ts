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

  it("autoLayout empilha peças lado a lado e calcula viewBox > 0", () => {
    const { pieces, viewBox } = autoLayout([rect("a", 10, 20), rect("b", 30, 40)], 5);
    expect(pieces).toHaveLength(2);
    expect(viewBox.w).toBeGreaterThan(0);
    expect(viewBox.h).toBeGreaterThan(0);
    const ax = (pieces[0].outline as { points: string }).points.split(" ")[0];
    const bx = (pieces[1].outline as { points: string }).points.split(" ")[0];
    expect(parseFloat(bx)).toBeGreaterThan(parseFloat(ax));
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
});
