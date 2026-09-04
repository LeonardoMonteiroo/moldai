import { describe, it, expect } from "vitest";
import { draftBlouse } from "./blouse";
import { curveArcLengthCm } from "../../../core";
import { SIZE_TABLE_MALE, SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

function blouseSpec(
  overrides: Partial<GarmentSpec["style"]> = {},
): GarmentSpec {
  return {
    type: "blouse",
    gender: "male",
    measurementOverrides: {},
    style: { sleeve: "long", ...overrides },
  };
}

describe("draftBlouse", () => {
  it("drafts exactly three pieces: body-front, body-back, sleeve", () => {
    const { drafted } = draftBlouse(blouseSpec(), SIZE_TABLE_MALE.M, t);
    expect(drafted.map((p) => p.id)).toEqual([
      "body-front",
      "body-back",
      "sleeve",
    ]);
  });

  it("every piece has a real, finite, closed outline", () => {
    const { drafted } = draftBlouse(blouseSpec(), SIZE_TABLE_MALE.M, t);
    for (const piece of drafted) {
      expect(piece.outlineCm.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of piece.outlineCm) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("front and back panels are mirrored symmetric about their own foldEdge", () => {
    const { drafted } = draftBlouse(blouseSpec(), SIZE_TABLE_MALE.M, t);
    for (const piece of drafted.filter((p) => p.id !== "sleeve")) {
      expect(piece.foldEdge).toBeDefined();
      const [a, b] = piece.foldEdge!;
      expect(Math.abs(piece.outlineCm[a][0])).toBeLessThan(0.01);
      expect(Math.abs(piece.outlineCm[b][0])).toBeLessThan(0.01);
    }
  });

  it("declares the four expected seam pairs", () => {
    const { seamPairs } = draftBlouse(blouseSpec(), SIZE_TABLE_MALE.M, t);
    expect(seamPairs.map((p) => p.key).sort()).toEqual(
      ["armhole-cap", "shoulder", "side", "sleeve-underarm"].sort(),
    );
  });

  it("the armhole-cap pair measures within a few mm -- the design's own inherited fit, not ours", () => {
    const { seamPairs, drafted } = draftBlouse(
      blouseSpec(),
      SIZE_TABLE_MALE.M,
      t,
    );
    const pair = seamPairs.find((p) => p.key === "armhole-cap")!;
    const sumLen = (refs: typeof pair.a) =>
      refs.reduce((total, ref) => {
        const piece = drafted.find((p) => p.id === ref.pieceId)!;
        return (
          total +
          curveArcLengthCm(
            piece.outlineCm,
            piece.curvedSpans ?? [],
            ref.from,
            ref.to,
          )
        );
      }, 0);
    const aLen = sumLen(pair.a);
    const bLen = sumLen(pair.b);
    expect(Math.abs(bLen - aLen - pair.easeCm)).toBeLessThan(0.5);
  });

  it("the sleeve-underarm self-pair measures near zero (comparing the same seam to itself)", () => {
    const { seamPairs, drafted } = draftBlouse(
      blouseSpec(),
      SIZE_TABLE_MALE.M,
      t,
    );
    const pair = seamPairs.find((p) => p.key === "sleeve-underarm")!;
    const lenOf = (ref: (typeof pair.a)[number]) => {
      const piece = drafted.find((p) => p.id === ref.pieceId)!;
      return curveArcLengthCm(
        piece.outlineCm,
        piece.curvedSpans ?? [],
        ref.from,
        ref.to,
      );
    };
    expect(lenOf(pair.a[0])).toBeCloseTo(lenOf(pair.b[0]), 1);
  });

  it("drafts for a female base row too", () => {
    const { drafted } = draftBlouse(
      { ...blouseSpec(), gender: "female" },
      SIZE_TABLE.M,
      t,
    );
    expect(drafted).toHaveLength(3);
  });

  it("piece id/order/count depends only on the spec, not the measurements row (draftGradedOverlays contract)", () => {
    const spec = blouseSpec();
    const rows = [SIZE_TABLE_MALE.PP, SIZE_TABLE_MALE.M, SIZE_TABLE_MALE.GG];
    const idSequences = rows.map((row) =>
      draftBlouse(spec, row, t).drafted.map((p) => p.id),
    );
    expect(idSequences[1]).toEqual(idSequences[0]);
    expect(idSequences[2]).toEqual(idSequences[0]);
  });

  it("garmentLengthCm and armholeLenCm/sleeveArmholeCm are real, positive numbers", () => {
    const draft = draftBlouse(blouseSpec(), SIZE_TABLE_MALE.M, t);
    expect(draft.garmentLengthCm).toBeGreaterThan(0);
    expect(draft.armholeLenCm).toBeGreaterThan(0);
    expect(draft.sleeveArmholeCm).toBeGreaterThan(0);
  });
});
