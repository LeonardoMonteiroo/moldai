import { describe, it, expect } from "vitest";
import { draftHoodie } from "./hoodie";
import { curveArcLengthCm } from "../../../core";
import { walkSeamPairs, SEAM_TOLERANCE_CM } from "../../../seams";
import { WAISTBAND_OVERLAP_CM } from "../../../subpieces";
import { WRIST_EASE_CM } from "../../../sleeve";
import { SIZE_TABLE_MALE, SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

function hoodieSpec(): GarmentSpec {
  return {
    type: "hoodie",
    gender: "female",
    measurementOverrides: {},
    style: {},
  };
}

describe("draftHoodie", () => {
  it("drafts exactly seven pieces: front, back, sleeve, cuff, hoodSide, hoodCenter, waistband", () => {
    const { drafted } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    expect(drafted.map((p) => p.id)).toEqual([
      "body-front",
      "body-back",
      "sleeve",
      "cuff",
      "hoodSide",
      "hoodCenter",
      "waistband",
    ]);
  });

  it("every piece has a real, finite, closed outline", () => {
    const { drafted } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    for (const piece of drafted) {
      expect(piece.outlineCm.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of piece.outlineCm) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("front and back are mirrored symmetric about their own foldEdge; sleeve/hoodSide/hoodCenter declare none", () => {
    const { drafted } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    const front = drafted.find((p) => p.id === "body-front")!;
    const back = drafted.find((p) => p.id === "body-back")!;
    for (const piece of [front, back]) {
      expect(piece.foldEdge).toBeDefined();
      const [a, b] = piece.foldEdge!;
      expect(piece.outlineCm[a][0]).toBeCloseTo(piece.outlineCm[b][0], 6);
      expect(piece.qty).toBe(1); // cut on fold
    }
    for (const id of ["sleeve", "hoodSide", "hoodCenter", "waistband"]) {
      expect(drafted.find((p) => p.id === id)!.foldEdge).toBeUndefined();
    }
  });

  it("declares the seven expected seam pairs", () => {
    const { seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    expect(seamPairs.map((p) => p.key)).toEqual([
      "hoodie-side",
      "hoodie-raglan-front",
      "hoodie-raglan-back",
      "hoodie-sleeve-underarm",
      "hoodie-cuff-wrist",
      "hoodie-waistband-hem",
      "hoodie-hood-center",
    ]);
  });

  // Unlike Titan's inseam/outseam (an internal fitting loop forces an
  // exact match), Hugo's own front.mjs/back.mjs/sleeve.mjs each draft
  // their own portion of the raglan seam independently -- this asserts
  // the real, measured residual stays comfortably inside
  // SEAM_TOLERANCE_CM, never that it's exactly zero.
  it("front/back raglan edges measure close to the sleeve's own matching edge, within SEAM_TOLERANCE_CM", () => {
    const { drafted, seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const front = measured.find((m) => m.key === "hoodie-raglan-front")!;
    const back = measured.find((m) => m.key === "hoodie-raglan-back")!;
    expect(front.diffCm).toBeLessThan(SEAM_TOLERANCE_CM);
    expect(back.diffCm).toBeLessThan(SEAM_TOLERANCE_CM);
  });

  it("sleeve-underarm is a self-pair (the sleeve's own two edges sewn to each other)", () => {
    const { drafted, seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const pair = measured.find((m) => m.key === "hoodie-sleeve-underarm")!;
    expect(pair.aPieceId).toBe("sleeve");
    expect(pair.bPieceId).toBe("sleeve");
    expect(pair.diffCm).toBe(0);
  });

  it("reports the cuff's own real WRIST_EASE_CM over the sleeve's measured wrist edge, not zero", () => {
    const { seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    const pair = seamPairs.find((p) => p.key === "hoodie-cuff-wrist")!;
    expect(pair.easeCm).toBe(WRIST_EASE_CM.knit);
    expect(pair.easeCm).not.toBe(0);
  });

  it("reports the waistband's own real WAISTBAND_OVERLAP_CM over the doubled front+back hem, not zero", () => {
    const { drafted, seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const pair = measured.find((m) => m.key === "hoodie-waistband-hem")!;
    expect(pair.easeCm).toBe(WAISTBAND_OVERLAP_CM);
    expect(pair.diffCm).toBe(0);

    const front = drafted.find((p) => p.id === "body-front")!;
    const back = drafted.find((p) => p.id === "body-back")!;
    const waistband = drafted.find((p) => p.id === "waistband")!;
    const frontHemHalfCm = curveArcLengthCm(
      front.outlineCm,
      front.curvedSpans ?? [],
      ...front.seamEdges!.hem,
    );
    const backHemHalfCm = curveArcLengthCm(
      back.outlineCm,
      back.curvedSpans ?? [],
      ...back.seamEdges!.hem,
    );
    const waistbandLenCm = curveArcLengthCm(
      waistband.outlineCm,
      waistband.curvedSpans ?? [],
      ...waistband.seamEdges!.waist,
    );
    // The real, full hem circumference is DOUBLE each declared half-hem
    // (front/back are cut-on-fold, qty 1) -- the waistband was sized off
    // exactly that doubled figure plus the overlap.
    expect(waistbandLenCm).toBeCloseTo(
      (frontHemHalfCm + backHemHalfCm) * 2 + WAISTBAND_OVERLAP_CM,
      1,
    );
  });

  it("hood-center's own edge measures the same length as hoodSide's own central seam", () => {
    const { drafted, seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const pair = measured.find((m) => m.key === "hoodie-hood-center")!;
    expect(pair.aPieceId).toBe("hoodSide");
    expect(pair.bPieceId).toBe("hoodCenter");
    expect(pair.diffCm).toBe(0);
    expect(pair.easeCm).toBe(0);
  });

  it("declares no armhole/sleeve-cap fields (a raglan seam, not a set-in armhole)", () => {
    const draft = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    expect(draft.armholeLenCm).toBeUndefined();
    expect(draft.sleeveArmholeCm).toBeUndefined();
    expect(draft.garmentLengthCm).toBeGreaterThan(0);
  });

  it("drafts for a male base row too", () => {
    const { drafted } = draftHoodie(
      { ...hoodieSpec(), gender: "male" },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(drafted).toHaveLength(7);
  });

  it("piece id/order/count depends only on the spec, not the measurements row (draftGradedOverlays contract)", () => {
    const spec = hoodieSpec();
    const rows = [SIZE_TABLE.PP, SIZE_TABLE.M, SIZE_TABLE.GG];
    const idSequences = rows.map((row) =>
      draftHoodie(spec, row, t).drafted.map((p) => p.id),
    );
    expect(idSequences[1]).toEqual(idSequences[0]);
    expect(idSequences[2]).toEqual(idSequences[0]);
  });
});
