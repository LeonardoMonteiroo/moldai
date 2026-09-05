import { describe, it, expect } from "vitest";
import { draftJett } from "./jett";
import { curveArcLengthCm } from "../../../core";
import { walkSeamPairs, SEAM_TOLERANCE_CM } from "../../../seams";
import { WAISTBAND_OVERLAP_CM } from "../../../subpieces";
import { WRIST_EASE_CM } from "../../../sleeve";
import { SIZE_TABLE_MALE, SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

function coatSpec(overrides: Partial<GarmentSpec["style"]> = {}): GarmentSpec {
  return {
    type: "coat",
    gender: "female",
    measurementOverrides: {},
    style: { ...overrides },
  };
}

describe("draftJett", () => {
  it("drafts exactly six pieces: front, back, sleeve, cuff, collarRibbing, waistband", () => {
    const { drafted } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    expect(drafted.map((p) => p.id)).toEqual([
      "body-front",
      "body-back",
      "sleeve",
      "cuff",
      "collarRibbing",
      "waistband",
    ]);
  });

  it("every piece has a real, finite, closed outline", () => {
    const { drafted } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    for (const piece of drafted) {
      expect(piece.outlineCm.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of piece.outlineCm) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("front and back are cut ×2 with no fold (a real placket, a real center-back seam); collarRibbing IS folded", () => {
    const { drafted } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    const front = drafted.find((p) => p.id === "body-front")!;
    const back = drafted.find((p) => p.id === "body-back")!;
    const collar = drafted.find((p) => p.id === "collarRibbing")!;
    expect(front.foldEdge).toBeUndefined();
    expect(front.qty).toBe(2);
    expect(back.foldEdge).toBeUndefined();
    expect(back.qty).toBe(2);
    expect(collar.foldEdge).toBeDefined();
    const [a, b] = collar.foldEdge!;
    expect(collar.outlineCm[a][0]).toBeCloseTo(collar.outlineCm[b][0], 6);
  });

  it("declares the seven expected seam pairs (no collar-to-neckline pairing -- see jett.ts's own comment)", () => {
    const { seamPairs } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    expect(seamPairs.map((p) => p.key)).toEqual([
      "coat-center-back",
      "coat-side",
      "coat-armhole-cap",
      "coat-shoulder",
      "coat-sleeve-underarm",
      "coat-cuff-wrist",
      "coat-waistband-hem",
    ]);
  });

  it("center-back is a self-pair (the back's own two mirrored halves, cut and flipped, not folded)", () => {
    const { drafted, seamPairs } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const pair = measured.find((m) => m.key === "coat-center-back")!;
    expect(pair.aPieceId).toBe("body-back");
    expect(pair.bPieceId).toBe("body-back");
    expect(pair.diffCm).toBe(0);
  });

  // The armhole-cap and shoulder pairs report a REAL MEASURED ease, not
  // an assumed 0 -- Jett is a woven, tailored jacket, unlike every knit-
  // adjacent archetype registered so far. This asserts the real, stable
  // residual stays comfortably inside SEAM_TOLERANCE_CM once the pair's
  // OWN declared ease is subtracted -- never that the raw lengths match
  // exactly -- the same "measured, not assumed" discipline skirt.ts's own
  // circle-skirt waist ease already established.
  it("armhole-cap and shoulder measure within SEAM_TOLERANCE_CM once their own declared ease is subtracted", () => {
    const { drafted, seamPairs } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const armholeCap = measured.find((m) => m.key === "coat-armhole-cap")!;
    const shoulder = measured.find((m) => m.key === "coat-shoulder")!;
    expect(armholeCap.diffCm).toBeLessThan(SEAM_TOLERANCE_CM);
    expect(shoulder.diffCm).toBeLessThan(SEAM_TOLERANCE_CM);
    // The armhole-cap ease is large enough (double digits) that a silent
    // regression to 0 (a boundary bug creeping back in) would be a real,
    // worth-catching change -- pinned as "not tiny", not an exact number.
    expect(Math.abs(armholeCap.easeCm)).toBeGreaterThan(5);
  });

  it("sleeve-underarm is a self-pair (the sleeve's own two edges sewn to each other)", () => {
    const { drafted, seamPairs } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const pair = measured.find((m) => m.key === "coat-sleeve-underarm")!;
    expect(pair.aPieceId).toBe("sleeve");
    expect(pair.bPieceId).toBe("sleeve");
    expect(pair.diffCm).toBe(0);
  });

  it("reports the cuff's own real WRIST_EASE_CM.woven over the sleeve's measured wrist edge, not zero", () => {
    const { seamPairs } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    const pair = seamPairs.find((p) => p.key === "coat-cuff-wrist")!;
    expect(pair.easeCm).toBe(WRIST_EASE_CM.woven);
    expect(pair.easeCm).not.toBe(0);
  });

  it("reports the waistband's own real WAISTBAND_OVERLAP_CM over the front+back hem, not zero", () => {
    const { drafted, seamPairs } = draftJett(coatSpec(), SIZE_TABLE.M, t);
    const measured = walkSeamPairs(drafted, seamPairs);
    const pair = measured.find((m) => m.key === "coat-waistband-hem")!;
    expect(pair.easeCm).toBe(WAISTBAND_OVERLAP_CM);
    expect(pair.diffCm).toBe(0);

    const front = drafted.find((p) => p.id === "body-front")!;
    const back = drafted.find((p) => p.id === "body-back")!;
    const waistband = drafted.find((p) => p.id === "waistband")!;
    const frontHemCm = curveArcLengthCm(
      front.outlineCm,
      front.curvedSpans ?? [],
      ...front.seamEdges!.hem,
    );
    const backHemCm = curveArcLengthCm(
      back.outlineCm,
      back.curvedSpans ?? [],
      ...back.seamEdges!.hem,
    );
    const waistbandLenCm = curveArcLengthCm(
      waistband.outlineCm,
      waistband.curvedSpans ?? [],
      ...waistband.seamEdges!.waist,
    );
    // Front/back are cut ×2 (left+right, no fold) -- their own declared
    // hem edge is already the real per-side length, so the total
    // circumference is simply both sides summed once each, doubled for
    // left+right (unlike hoodie.ts's own fold-cut panels, which need a
    // separate ×2 for the half-hem).
    expect(waistbandLenCm).toBeCloseTo(
      (frontHemCm + backHemCm) * 2 + WAISTBAND_OVERLAP_CM,
      1,
    );
  });

  it("a short sleeve request drafts a measurably shorter sleeve than long", () => {
    const short = draftJett(coatSpec({ sleeve: "short" }), SIZE_TABLE.M, t);
    const long = draftJett(coatSpec({ sleeve: "long" }), SIZE_TABLE.M, t);
    const sleeveHeight = (d: typeof short) => {
      const s = d.drafted.find((p) => p.id === "sleeve")!;
      const ys = s.outlineCm.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(sleeveHeight(long)).toBeGreaterThan(sleeveHeight(short));
  });

  it("declares no armhole/sleeve-cap scalar fields (those live on the seam pair, not EngineDraft's own top-level fields, for this archetype)", () => {
    const draft = draftJett(coatSpec(), SIZE_TABLE.M, t);
    expect(draft.armholeLenCm).toBeUndefined();
    expect(draft.sleeveArmholeCm).toBeUndefined();
    expect(draft.garmentLengthCm).toBeGreaterThan(0);
  });

  it("drafts for a male base row too", () => {
    const { drafted } = draftJett(
      { ...coatSpec(), gender: "male" },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(drafted).toHaveLength(6);
  });

  it("piece id/order/count depends only on the spec, not the measurements row (draftGradedOverlays contract)", () => {
    const spec = coatSpec();
    const rows = [SIZE_TABLE.PP, SIZE_TABLE.M, SIZE_TABLE.GG];
    const idSequences = rows.map((row) =>
      draftJett(spec, row, t).drafted.map((p) => p.id),
    );
    expect(idSequences[1]).toEqual(idSequences[0]);
    expect(idSequences[2]).toEqual(idSequences[0]);
  });
});
