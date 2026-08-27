import { describe, expect, it } from "vitest";
import { toUser } from "./useCanvasViewport";

/**
 * toUser used to go through DOMPoint/DOMMatrix, both `undefined` in jsdom, so
 * it could not be tested at all -- which is how CutPlanTab shipped a drag that
 * mapped every pointer to {0,0}. These cover the arithmetic directly.
 */
function svgWithCtm(ctm: object | null): SVGSVGElement {
  return { getScreenCTM: () => ctm } as unknown as SVGSVGElement;
}

describe("toUser", () => {
  it("inverts a translate-and-scale CTM back into user space", () => {
    // user -> screen: x*4 + 100, y*4 + 50
    const svg = svgWithCtm({ a: 4, b: 0, c: 0, d: 4, e: 100, f: 50 });
    expect(toUser(svg, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(toUser(svg, 140, 90)).toEqual({ x: 10, y: 10 });
  });

  it("round-trips a point through an arbitrary affine CTM", () => {
    const m = { a: 2.5, b: 0.4, c: -0.7, d: 3.1, e: 12, f: -8 };
    const svg = svgWithCtm(m);
    const ux = 7.25;
    const uy = -3.5;
    const screenX = m.a * ux + m.c * uy + m.e;
    const screenY = m.b * ux + m.d * uy + m.f;
    const back = toUser(svg, screenX, screenY);
    expect(back.x).toBeCloseTo(ux, 10);
    expect(back.y).toBeCloseTo(uy, 10);
  });

  it("returns the origin rather than NaN when there is no CTM", () => {
    expect(toUser(svgWithCtm(null), 300, 200)).toEqual({ x: 0, y: 0 });
  });

  it("returns the origin rather than Infinity for a degenerate CTM", () => {
    const svg = svgWithCtm({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 });
    expect(toUser(svg, 300, 200)).toEqual({ x: 0, y: 0 });
  });
});
