import { describe, it, expect } from "vitest";
import { autoLayout, bbox, polyPath, DraftedPiece } from "./core";

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
});
