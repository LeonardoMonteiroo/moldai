import { describe, it, expect } from "vitest";
import { distanceCm, nearestSnap } from "./measure";

describe("measure math", () => {
  it("distanceCm converts px->cm (4px = 1cm)", () => {
    expect(distanceCm({ x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(1, 5);
    expect(distanceCm({ x: 0, y: 0 }, { x: 12, y: 16 })).toBeCloseTo(5, 5); // 20px hypotenuse
  });

  it("nearestSnap finds the closest vertex within the threshold", () => {
    const verts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(nearestSnap({ x: 96, y: 3 }, verts, 10)).toEqual({ x: 100, y: 0 });
  });

  it("nearestSnap returns null outside the threshold", () => {
    const verts = [{ x: 0, y: 0 }];
    expect(nearestSnap({ x: 50, y: 50 }, verts, 10)).toBeNull();
  });
});
