import { describe, it, expect } from "vitest";
import { autoLayout, bbox, polyPath, smoothPath, PX, DraftedPiece } from "./core";

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
    const o = polyPath([[0, 0], [1, 0], [1, 1]]);
    expect(o.kind).toBe("polygon");
  });

  it("autoLayout empilha peças lado a lado e calcula viewBox > 0", () => {
    const { pieces, viewBox } = autoLayout([rect("a", 10, 20), rect("b", 30, 40)], 5);
    expect(pieces).toHaveLength(2);
    expect(viewBox.w).toBeGreaterThan(0);
    expect(viewBox.h).toBeGreaterThan(0);
    // segunda peça começa depois da primeira + gap (em px)
    const ax = (pieces[0].outline as { points: string }).points.split(" ")[0];
    const bx = (pieces[1].outline as { points: string }).points.split(" ")[0];
    expect(parseFloat(bx)).toBeGreaterThan(parseFloat(ax));
  });

  describe("smoothPath", () => {
    it("closed curve starts with M and ends with Z", () => {
      const result = smoothPath([[0, 0], [10, 0], [10, 10]], true);
      expect(result.kind).toBe("path");
      const pathResult = result as { kind: "path"; d: string };
      expect(pathResult.d).toMatch(/^M\d+\.?\d*\s+\d+\.?\d*/);
      expect(pathResult.d).toMatch(/Z$/);
    });

    it("open curve starts with M and does not end with Z", () => {
      const result = smoothPath([[0, 0], [10, 0], [10, 10]], false);
      expect(result.kind).toBe("path");
      const pathResult = result as { kind: "path"; d: string };
      expect(pathResult.d).toMatch(/^M\d+\.?\d*\s+\d+\.?\d*/);
      expect(pathResult.d).not.toMatch(/Z$/);
    });

    it("open 4-point curve has finite first control point within start region", () => {
      const result = smoothPath([[0, 0], [10, 0], [20, 0], [30, 0]], false);
      expect(result.kind).toBe("path");
      const pathResult = result as { kind: "path"; d: string };
      // Parse first C command: "C<x1> <y1> <x2> <y2> <x> <y> ..."
      const cMatch = pathResult.d.match(/C([\d.]+)\s+([\d.]+)/);
      expect(cMatch).not.toBeNull();
      const firstControlPointX = parseFloat(cMatch![1]);
      expect(firstControlPointX).toBeGreaterThanOrEqual(0);
      expect(firstControlPointX).toBeLessThanOrEqual(PX(30));
    });
  });
});
