import { describe, it, expect } from "vitest";
import { Teagan } from "@freesewing/teagan";
import {
  flattenFreesewingSeam,
  mirrorFoldedPanel,
  locatePointIndex,
} from "./geometry";
import { curveArcLengthCm } from "../../core";

// A real, live Teagan draft (not a captured fixture) -- the whole point of
// this test is to catch a drift in @freesewing/core's own Path.ops shape
// across a version bump, which a hand-written fixture could never do.
// Measurements in mm (Teagan.patternConfig.measurements/optionalMeasurements),
// chosen so `chest` lands at 1000mm == 100cm, matching this repo's own
// SIZE_TABLE_MALE.M bust -- verified in docs/reference/freesewing-spike
// against @freesewing/models' cisMaleAdult["38"] row.
const MEASUREMENTS_MM = {
  biceps: 350,
  chest: 1000,
  hpsToBust: 280,
  hpsToWaistBack: 470,
  neck: 380,
  shoulderToShoulder: 450,
  shoulderSlope: 13,
  waistToArmpit: 210,
  waistToHips: 130,
  hips: 840,
  waist: 810,
  shoulderToWrist: 630,
  wrist: 175,
  highBust: 1030,
};

function draftTeagan() {
  const pattern = new Teagan({ measurements: MEASUREMENTS_MM, options: {} });
  pattern.draft();
  return pattern.parts[0];
}

describe("flattenFreesewingSeam, against a live Teagan draft", () => {
  it("front: measured length matches Path.length() within 0.05 cm", () => {
    const parts = draftTeagan();
    const seam = parts["teagan.front"].paths.seam;
    const { outlineCm, curvedSpans } = flattenFreesewingSeam(seam);
    const measuredCm = curveArcLengthCm(
      outlineCm,
      curvedSpans,
      0,
      outlineCm.length,
    );
    expect(measuredCm).toBeCloseTo(seam.length() / 10, 1);
  });

  it("back: measured length matches Path.length() within 0.05 cm", () => {
    const parts = draftTeagan();
    const seam = parts["teagan.back"].paths.seam;
    const { outlineCm, curvedSpans } = flattenFreesewingSeam(seam);
    const measuredCm = curveArcLengthCm(
      outlineCm,
      curvedSpans,
      0,
      outlineCm.length,
    );
    expect(measuredCm).toBeCloseTo(seam.length() / 10, 1);
  });

  it("sleeve (already a whole, non-folded piece): measured length matches Path.length()", () => {
    const parts = draftTeagan();
    const seam = parts["teagan.sleeve"].paths.seam;
    const { outlineCm, curvedSpans } = flattenFreesewingSeam(seam);
    const measuredCm = curveArcLengthCm(
      outlineCm,
      curvedSpans,
      0,
      outlineCm.length,
    );
    expect(measuredCm).toBeCloseTo(seam.length() / 10, 1);
  });

  it("drops the redundant explicit closing point without leaving a zero-length final span", () => {
    const parts = draftTeagan();
    const seam = parts["teagan.front"].paths.seam;
    const { outlineCm } = flattenFreesewingSeam(seam);
    const first = outlineCm[0];
    const last = outlineCm[outlineCm.length - 1];
    // The two must be DIFFERENT points (the fold's top vs. bottom), not a
    // duplicate of the same coordinate -- proves the closing-line dedup
    // didn't eat a real vertex.
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeGreaterThan(
      1,
    );
  });
});

describe("mirrorFoldedPanel, against a live Teagan draft", () => {
  it("front: produces a closed, symmetric whole outline", () => {
    const parts = draftTeagan();
    const seam = parts["teagan.front"].paths.seam;
    const half = flattenFreesewingSeam(seam);
    const { outlineCm, foldEdge } = mirrorFoldedPanel(half);

    // Symmetric: for every point, its mirror image (negated x) must exist
    // somewhere else in the outline (within floating-point tolerance) --
    // except the two fold points themselves, which sit exactly on x=0 and
    // are their own mirror image.
    for (const [x, y] of outlineCm) {
      const hasMirror = outlineCm.some(
        ([mx, my]) => Math.abs(mx + x) < 1e-6 && Math.abs(my - y) < 1e-6,
      );
      expect(hasMirror).toBe(true);
    }

    // foldEdge names the two vertices that sit on the fold axis.
    const [a, b] = foldEdge;
    expect(Math.abs(outlineCm[a][0])).toBeLessThan(0.01);
    expect(Math.abs(outlineCm[b][0])).toBeLessThan(0.01);
  });

  it("front: the whole mirrored outline has 2n-2 points for an n-point half-panel", () => {
    const parts = draftTeagan();
    const seam = parts["teagan.front"].paths.seam;
    const half = flattenFreesewingSeam(seam);
    const n = half.outlineCm.length;
    const { outlineCm } = mirrorFoldedPanel(half);
    expect(outlineCm.length).toBe(2 * n - 2);
  });

  it("front: curveArcLengthCm over the mirrored spans stays curved (no straight-line shortcut) at the fold-adjacent edge", () => {
    const parts = draftTeagan();
    const seam = parts["teagan.front"].paths.seam;
    const half = flattenFreesewingSeam(seam);
    const { outlineCm, curvedSpans } = mirrorFoldedPanel(half);
    // The whole perimeter must measure to roughly double the half-panel's
    // own curve-inclusive arc length minus the (now absent) fold-closing
    // edge -- a coarse sanity check that mirroring didn't silently drop or
    // duplicate a curved run.
    const halfMeasuredCm = curveArcLengthCm(
      half.outlineCm,
      half.curvedSpans,
      0,
      half.outlineCm.length - 1, // exclude the wrap edge back to point 0
    );
    const wholeMeasuredCm = curveArcLengthCm(
      outlineCm,
      curvedSpans,
      0,
      outlineCm.length,
    );
    // whole = 2 * (half perimeter minus the fold-axis closing edge)
    expect(wholeMeasuredCm).toBeCloseTo(2 * halfMeasuredCm, 0);
  });

  it("throws if the half-panel's endpoints are not on the fold axis (e.g. a whole piece like the sleeve)", () => {
    const parts = draftTeagan();
    const seam = parts["teagan.sleeve"].paths.seam;
    const half = flattenFreesewingSeam(seam);
    expect(() => mirrorFoldedPanel(half)).toThrow();
  });
});

describe("locatePointIndex, against a live Teagan draft", () => {
  it("finds the exact index of a named point (armhole) inside the flattened outline", () => {
    const parts = draftTeagan();
    const front = parts["teagan.front"];
    const { outlineCm } = flattenFreesewingSeam(front.paths.seam);
    // Teagan's own saBase draws armhole -> armholeHollow -> shoulder as the
    // FIRST two curve ops after the side curve -- verified independently in
    // designs/teagan.test.ts against the live store value. Confirms
    // locatePointIndex agrees with that hand-derived index (9, per
    // teagan.ts's own SIDE_SAMPLES-based split) without assuming the op
    // count itself.
    const idx = locatePointIndex(outlineCm, front.points.armhole);
    expect(idx).toBe(9);
  });

  it("throws for a point that is not actually a vertex on this seam", () => {
    const parts = draftTeagan();
    const front = parts["teagan.front"];
    const { outlineCm } = flattenFreesewingSeam(front.paths.seam);
    // armholeHollowCp1 is a Bézier CONTROL point, never itself an on-curve
    // vertex -- must not silently match some unrelated nearby index.
    expect(() =>
      locatePointIndex(outlineCm, front.points.armholeHollowCp1),
    ).toThrow();
  });
});
