import { describe, it, expect } from "vitest";
import {
  zoomAt,
  fit,
  scaleOf,
  zoomByCenter,
  panBy,
  MAX_SCALE,
} from "./viewport";

const natural = { w: 100, h: 100 };

describe("viewport math", () => {
  it("fit centers with padding", () => {
    expect(fit({ w: 100, h: 50 }, 24)).toEqual({
      x: -24,
      y: -24,
      w: 148,
      h: 98,
    });
  });

  it("scaleOf: natural viewport = scale 1; smaller = more zoom", () => {
    expect(scaleOf({ x: 0, y: 0, w: 100, h: 100 }, natural)).toBeCloseTo(1, 5);
    expect(scaleOf({ x: 0, y: 0, w: 50, h: 50 }, natural)).toBeCloseTo(2, 5);
  });

  it("zoomAt keeps the focus point fixed (same fraction of the viewBox)", () => {
    const vp = { x: 0, y: 0, w: 100, h: 100 };
    const focus = { x: 30, y: 70 };
    const out = zoomAt(vp, focus, 2, natural);
    const fxBefore = (focus.x - vp.x) / vp.w;
    const fxAfter = (focus.x - out.x) / out.w;
    expect(fxAfter).toBeCloseTo(fxBefore, 6);
    expect(scaleOf(out, natural)).toBeCloseTo(2, 5);
  });

  it("zoomAt respects the max-scale clamp", () => {
    let vp = { x: 0, y: 0, w: 100, h: 100 };
    for (let i = 0; i < 100; i++) vp = zoomByCenter(vp, 2, natural);
    expect(scaleOf(vp, natural)).toBeLessThanOrEqual(MAX_SCALE + 1e-9);
  });

  it("panBy shifts the viewBox opposite to the drag", () => {
    expect(panBy({ x: 10, y: 10, w: 100, h: 100 }, 5, -3)).toEqual({
      x: 5,
      y: 13,
      w: 100,
      h: 100,
    });
  });
});
