import { describe, it, expect } from "vitest";
import type { DraftedPiece } from "./core";
import {
  walkSeamPairs,
  SEAM_TOLERANCE_CM,
  pitchNotchDistanceCm,
  PITCH_NOTCH_RISE_CM,
  type SeamPairDecl,
} from "./seams";

// A minimal rectangular piece whose edge [0,1] is a straight, horizontal
// segment of length `w` -- exactly the shape core.test.ts's own `rect`
// fixture uses, so curveArcLengthCm measures a known, exact length with no
// curvedSpans involved.
const rect = (id: string, w: number, h = 5): DraftedPiece => ({
  id,
  name: id,
  qty: 1,
  outlineCm: [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ],
  detailRows: [],
});

describe("walkSeamPairs", () => {
  it("sums a multi-edge side and reports diffCm against b's total (pre-#253/#255 behavior, gatherRatio/expectEqualSplit absent)", () => {
    const pieces = [rect("front", 10), rect("back", 10), rect("cap", 20)];
    const pair: SeamPairDecl = {
      key: "armhole-cap",
      labelKey: "armholeCap",
      a: [
        { pieceId: "front", from: 0, to: 1 },
        { pieceId: "back", from: 0, to: 1 },
      ],
      b: [{ pieceId: "cap", from: 0, to: 1 }],
      easeCm: 0,
      fixable: true,
    };
    const [m] = walkSeamPairs(pieces, [pair]);
    expect(m.aLenCm).toBe(20);
    expect(m.bLenCm).toBe(20);
    expect(m.diffCm).toBe(0);
    expect(m.gatherRatio).toBe(1);
    expect(m.subSegmentDiffCm).toBe(0);
  });

  it("reports a real diffCm when the totals genuinely don't close", () => {
    const pieces = [rect("front", 10), rect("back", 12), rect("cap", 20)];
    const pair: SeamPairDecl = {
      key: "armhole-cap",
      labelKey: "armholeCap",
      a: [
        { pieceId: "front", from: 0, to: 1 },
        { pieceId: "back", from: 0, to: 1 },
      ],
      b: [{ pieceId: "cap", from: 0, to: 1 }],
      easeCm: 0,
      fixable: true,
    };
    const [m] = walkSeamPairs(pieces, [pair]);
    expect(m.aLenCm).toBe(22);
    expect(m.diffCm).toBe(2);
  });

  // #255: an intentional gather -- side b is drafted to be `aLen *
  // gatherRatio + easeCm`, and diffCm nets that out to 0 rather than
  // reporting a false conflict.
  describe("gatherRatio (#255)", () => {
    const waistband = rect("waistband", 10);
    const skirtGathered = rect("skirt", 14); // 10 * 1.4

    it("a pair with no gatherRatio reports the raw divergence (unrepresentable gather, today's behavior)", () => {
      const pair: SeamPairDecl = {
        key: "waistband-waist",
        labelKey: "waistbandWaist",
        a: [{ pieceId: "waistband", from: 0, to: 1 }],
        b: [{ pieceId: "skirt", from: 0, to: 1 }],
        easeCm: 0,
        fixable: false,
      };
      const [m] = walkSeamPairs([waistband, skirtGathered], [pair]);
      expect(m.gatherRatio).toBe(1);
      expect(m.diffCm).toBe(4);
    });

    it("a pair declaring gatherRatio: 1.4 reports zero divergence for the same two pieces", () => {
      const pair: SeamPairDecl = {
        key: "waistband-waist",
        labelKey: "waistbandWaist",
        a: [{ pieceId: "waistband", from: 0, to: 1 }],
        b: [{ pieceId: "skirt", from: 0, to: 1 }],
        easeCm: 0,
        fixable: false,
        gatherRatio: 1.4,
      };
      const [m] = walkSeamPairs([waistband, skirtGathered], [pair]);
      expect(m.gatherRatio).toBe(1.4);
      expect(m.diffCm).toBe(0);
      expect(m.aLenCm).toBe(10);
      expect(m.bLenCm).toBe(14);
    });

    it("gatherRatio composes with a real easeCm", () => {
      const skirt = rect("skirt", 15); // 10 * 1.4 + 1 ease
      const pair: SeamPairDecl = {
        key: "waistband-waist",
        labelKey: "waistbandWaist",
        a: [{ pieceId: "waistband", from: 0, to: 1 }],
        b: [{ pieceId: "skirt", from: 0, to: 1 }],
        easeCm: 1,
        fixable: false,
        gatherRatio: 1.4,
      };
      const [m] = walkSeamPairs([waistband, skirt], [pair]);
      expect(m.diffCm).toBe(0);
    });

    // #319/#320: a ratio BELOW 1 is take-up (side a's own flat cut edge
    // presents less once its own darts/pleats are folded away) -- the same
    // field and formula as the gather case above, read in the other
    // direction.
    it("a ratio below 1 (take-up) also reports zero divergence, in the other direction", () => {
      const cutPanel = rect("panel", 20); // the flat, un-netted cut edge
      const band = rect("band", 15); // 20 * 0.75, the FOLDED length it's cut to
      const pair: SeamPairDecl = {
        key: "waistband-waist",
        labelKey: "waistbandWaist",
        a: [{ pieceId: "panel", from: 0, to: 1 }],
        b: [{ pieceId: "band", from: 0, to: 1 }],
        easeCm: 0,
        fixable: false,
        gatherRatio: 0.75,
      };
      const [m] = walkSeamPairs([cutPanel, band], [pair]);
      expect(m.gatherRatio).toBe(0.75);
      expect(m.diffCm).toBe(0);
      expect(m.aLenCm).toBe(20);
      expect(m.bLenCm).toBe(15);
    });

    it("a below-1 ratio also composes with a real easeCm", () => {
      const cutPanel = rect("panel", 20);
      const band = rect("band", 18); // 20 * 0.75 + 3 ease
      const pair: SeamPairDecl = {
        key: "waistband-waist",
        labelKey: "waistbandWaist",
        a: [{ pieceId: "panel", from: 0, to: 1 }],
        b: [{ pieceId: "band", from: 0, to: 1 }],
        easeCm: 3,
        fixable: false,
        gatherRatio: 0.75,
      };
      const [m] = walkSeamPairs([cutPanel, band], [pair]);
      expect(m.diffCm).toBe(0);
    });
  });

  // #253: per-edge fractions, and the sub-segment divergence they enable.
  describe("expectEqualSplit / subSegmentDiffCm (#253)", () => {
    it("returns per-edge lenCm and cumulative endFracOfSide for a multi-edge side", () => {
      const pieces = [rect("front", 10), rect("back", 20), rect("cap", 30)];
      const pair: SeamPairDecl = {
        key: "armhole-cap",
        labelKey: "armholeCap",
        a: [
          { pieceId: "front", from: 0, to: 1 },
          { pieceId: "back", from: 0, to: 1 },
        ],
        b: [{ pieceId: "cap", from: 0, to: 1 }],
        easeCm: 0,
        fixable: true,
      };
      const [m] = walkSeamPairs(pieces, [pair]);
      expect(m.aEdges).toHaveLength(2);
      expect(m.aEdges[0]).toMatchObject({
        pieceId: "front",
        lenCm: 10,
        endFracOfSide: 10 / 30,
      });
      expect(m.aEdges[1]).toMatchObject({
        pieceId: "back",
        lenCm: 20,
        endFracOfSide: 1,
      });
      expect(m.bEdges).toHaveLength(1);
      expect(m.bEdges[0]).toMatchObject({
        pieceId: "cap",
        lenCm: 30,
        endFracOfSide: 1,
      });
    });

    it("is 0 when the pair doesn't opt in, even for a wildly unequal split (e.g. a V-neck front vs a shallow back)", () => {
      const pieces = [rect("front", 10), rect("back", 20), rect("cap", 30)];
      const pair: SeamPairDecl = {
        key: "collar-neckline",
        labelKey: "collarNeckline",
        a: [
          { pieceId: "front", from: 0, to: 1 },
          { pieceId: "back", from: 0, to: 1 },
        ],
        b: [{ pieceId: "cap", from: 0, to: 1 }],
        easeCm: 0,
        fixable: false,
        // expectEqualSplit deliberately absent
      };
      const [m] = walkSeamPairs(pieces, [pair]);
      expect(m.diffCm).toBe(0); // totals still agree (10+20 === 30)
      expect(m.subSegmentDiffCm).toBe(0);
    });

    it("is 0 when the multi-edge side genuinely IS an equal split", () => {
      const pieces = [rect("front", 15), rect("back", 15), rect("cap", 30)];
      const pair: SeamPairDecl = {
        key: "armhole-cap",
        labelKey: "armholeCap",
        a: [
          { pieceId: "front", from: 0, to: 1 },
          { pieceId: "back", from: 0, to: 1 },
        ],
        b: [{ pieceId: "cap", from: 0, to: 1 }],
        easeCm: 0,
        fixable: true,
        expectEqualSplit: true,
      };
      const [m] = walkSeamPairs(pieces, [pair]);
      expect(m.subSegmentDiffCm).toBe(0);
    });

    // The bug #253 exists to catch: totals agree (diffCm === 0, "measures as
    // a perfect seam"), but the split between front and back is wrong.
    it("is a real, tolerance-exceeding number when totals agree but the split doesn't (the bug this issue closes)", () => {
      const pieces = [rect("front", 10), rect("back", 20), rect("cap", 30)];
      const pair: SeamPairDecl = {
        key: "armhole-cap",
        labelKey: "armholeCap",
        a: [
          { pieceId: "front", from: 0, to: 1 },
          { pieceId: "back", from: 0, to: 1 },
        ],
        b: [{ pieceId: "cap", from: 0, to: 1 }],
        easeCm: 0,
        fixable: true,
        expectEqualSplit: true,
      };
      const [m] = walkSeamPairs(pieces, [pair]);
      expect(m.diffCm).toBe(0); // 10 + 20 === 30: totals still close exactly
      expect(m.subSegmentDiffCm).toBeGreaterThan(SEAM_TOLERANCE_CM);
      // front should be 50% of the total (15 of 30); it's actually 33.3% --
      // a 16.7% deviation, projected onto the 30cm cap: 5cm.
      expect(m.subSegmentDiffCm).toBeCloseTo(5, 1);
    });

    // #253 (code-review fix): a many-to-many pair (both sides declaring more
    // than one edge) must have BOTH sides' own split checked, not only
    // whichever side happens to be inspected first -- otherwise a real
    // imbalance on the second side would silently report 0.
    it("checks both sides independently for a many-to-many pair -- a bad split on EITHER side is caught", () => {
      const pieces = [
        rect("a1", 10),
        rect("a2", 20), // a: 33/67 split of 30 (uneven; should be 50/50)
        rect("b1", 15),
        rect("b2", 15), // b: even 50/50 split of 30
      ];
      const pair: SeamPairDecl = {
        key: "many-to-many",
        labelKey: "manyToMany",
        a: [
          { pieceId: "a1", from: 0, to: 1 },
          { pieceId: "a2", from: 0, to: 1 },
        ],
        b: [
          { pieceId: "b1", from: 0, to: 1 },
          { pieceId: "b2", from: 0, to: 1 },
        ],
        easeCm: 0,
        fixable: true,
        expectEqualSplit: true,
      };
      const [m] = walkSeamPairs(pieces, [pair]);
      expect(m.diffCm).toBe(0); // both totals are 30
      // side a's own uneven split against side b's own 30cm total is caught
      // even though side b's own split is perfectly even.
      expect(m.subSegmentDiffCm).toBeGreaterThan(SEAM_TOLERANCE_CM);
    });
  });
});

describe("pitchNotchDistanceCm (#253)", () => {
  it("returns the fixed rise for a long enough total (unclamped)", () => {
    expect(pitchNotchDistanceCm(100)).toBe(PITCH_NOTCH_RISE_CM);
  });

  it("clamps to a fraction of the total for a short armhole", () => {
    const totalCm = 10; // 0.35 * 10 = 3.5, well under PITCH_NOTCH_RISE_CM
    expect(pitchNotchDistanceCm(totalCm)).toBeCloseTo(3.5, 5);
  });

  it("is a pure function of the TOTAL, not of either side individually -- the same distance results regardless of how the total is split", () => {
    // Two armholes summing to the same total (30) should derive the exact
    // same shared pitch distance, whether front/back are equal (15/15) or
    // very unequal (5/25) -- this is what removes the two-independent-
    // clamps bug (each side used to clamp against only its OWN length).
    expect(pitchNotchDistanceCm(15 + 15)).toBe(pitchNotchDistanceCm(5 + 25));
  });
});
