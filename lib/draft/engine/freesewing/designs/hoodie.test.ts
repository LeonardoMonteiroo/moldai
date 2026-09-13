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
  it("drafts exactly eight pieces: front, back, sleeve, cuff, hoodSide, hoodCenter, waistband, neckBinding", () => {
    const { drafted } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    expect(drafted.map((p) => p.id)).toEqual([
      "body-front",
      "body-back",
      "sleeve",
      "cuff",
      "hoodSide",
      "hoodCenter",
      "waistband",
      "neckBinding",
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
    for (const id of [
      "sleeve",
      "hoodSide",
      "hoodCenter",
      "waistband",
      "neckBinding",
    ]) {
      expect(drafted.find((p) => p.id === id)!.foldEdge).toBeUndefined();
    }
  });

  it("declares the nine expected seam pairs", () => {
    const { seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    expect(seamPairs.map((p) => p.key)).toEqual([
      "hoodie-side",
      "hoodie-raglan-front",
      "hoodie-raglan-back",
      "hoodie-sleeve-underarm",
      "hoodie-hood-neckline",
      "hoodie-cuff-wrist",
      "hoodie-waistband-hem",
      "hoodie-hood-center",
      "hoodie-neck-binding",
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

  // #341: hoodCenter now covers BOTH of the hood's two physical seams
  // (near/far, straightBand's own two equal-length long edges) -- the
  // pair's own a/b sides each carry two edges now, still equal by
  // construction (both are the same synthetic rectangle), so diffCm stays
  // exactly 0 without loosening anything.
  it("hood-center's own edge measures the same length as hoodSide's own central seam, on both of the hood's two physical seams", () => {
    const { drafted, seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    const pair = seamPairs.find((p) => p.key === "hoodie-hood-center")!;
    expect(pair.a).toHaveLength(2);
    expect(pair.b).toHaveLength(2);
    const measured = walkSeamPairs(drafted, seamPairs);
    const m = measured.find((x) => x.key === "hoodie-hood-center")!;
    expect(m.aPieceId).toBe("hoodSide");
    expect(m.bPieceId).toBe("hoodCenter");
    expect(m.diffCm).toBe(0);
    expect(m.easeCm).toBe(0);
  });

  // #341: the hood's own neck edge, sewn onto the body's already-closed
  // neck opening (front+back neckline, doubled for the fold, plus both
  // sleeves' own raglan-top gap). diffCm is tautologically 0 once
  // easeCm is subtracted (it IS the measured residual) -- what actually
  // proves this pair is correct, not just self-consistent, is that the
  // hood's own ring runs a STABLE ~3.3-3.7% longer than the body's own
  // opening across every size in SIZE_TABLE/SIZE_TABLE_MALE, the same
  // "cross-body stability stands in for a correctness check" discipline
  // Jett's own armhole-cap/shoulder pairs already established.
  it("hood-neckline pair closes exactly (easeCm is the measured residual) and the residual is a stable ~3.3-3.7% across bodies", () => {
    for (const row of [
      SIZE_TABLE.PP,
      SIZE_TABLE.M,
      SIZE_TABLE.GG,
      SIZE_TABLE_MALE.M,
    ]) {
      const { drafted, seamPairs } = draftHoodie(hoodieSpec(), row, t);
      const measured = walkSeamPairs(drafted, seamPairs);
      const pair = measured.find((m) => m.key === "hoodie-hood-neckline")!;
      expect(pair.diffCm).toBe(0);
      expect(pair.easeCm).toBeGreaterThan(0);
      const ratio = pair.bLenCm / pair.aLenCm;
      expect(ratio).toBeGreaterThan(1.03);
      expect(ratio).toBeLessThan(1.038);
    }
  });

  it("neck-binding is drafted to the exact measured neck-ring length (easeCm 0, diffCm 0)", () => {
    const { drafted, seamPairs } = draftHoodie(hoodieSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const pair = measured.find((m) => m.key === "hoodie-neck-binding")!;
    expect(pair.aPieceId).not.toBe(pair.bPieceId);
    expect(pair.bPieceId).toBe("neckBinding");
    expect(pair.easeCm).toBe(0);
    expect(pair.diffCm).toBe(0);

    // The binding's own a-side is the SAME six edges hoodie-hood-neckline
    // already names -- deliberate edge reuse (docs/architecture/
    // seams-and-assembly.md), not an accidental duplicate.
    const necklinePair = seamPairs.find(
      (p) => p.key === "hoodie-hood-neckline",
    )!;
    const bindingPair = seamPairs.find((p) => p.key === "hoodie-neck-binding")!;
    expect(bindingPair.a).toEqual(necklinePair.a);

    const neckBinding = drafted.find((p) => p.id === "neckBinding")!;
    expect(neckBinding.qty).toBe(1);
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
    expect(drafted).toHaveLength(8);
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
