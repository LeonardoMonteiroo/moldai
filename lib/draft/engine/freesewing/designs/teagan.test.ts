import { describe, it, expect } from "vitest";
import { draftTeagan } from "./teagan";
import { curveArcLengthCm } from "../../../core";
import { SIZE_TABLE_MALE, SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

function tshirtSpec(
  overrides: Partial<GarmentSpec["style"]> = {},
): GarmentSpec {
  return {
    type: "tshirt",
    gender: "male",
    measurementOverrides: {},
    style: { sleeve: "short", ...overrides },
  };
}

describe("draftTeagan", () => {
  it("drafts exactly three pieces: body-front, body-back, sleeve", () => {
    const { drafted } = draftTeagan(tshirtSpec(), SIZE_TABLE_MALE.M, t);
    expect(drafted.map((p) => p.id)).toEqual([
      "body-front",
      "body-back",
      "sleeve",
    ]);
  });

  it("every piece has a real, finite, closed outline", () => {
    const { drafted } = draftTeagan(tshirtSpec(), SIZE_TABLE_MALE.M, t);
    for (const piece of drafted) {
      expect(piece.outlineCm.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of piece.outlineCm) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("front and back panels are mirrored symmetric about their own foldEdge", () => {
    const { drafted } = draftTeagan(tshirtSpec(), SIZE_TABLE_MALE.M, t);
    for (const piece of drafted.filter((p) => p.id !== "sleeve")) {
      expect(piece.foldEdge).toBeDefined();
      const [a, b] = piece.foldEdge!;
      expect(Math.abs(piece.outlineCm[a][0])).toBeLessThan(0.01);
      expect(Math.abs(piece.outlineCm[b][0])).toBeLessThan(0.01);
    }
  });

  it("declares the four expected seam pairs", () => {
    const { seamPairs } = draftTeagan(tshirtSpec(), SIZE_TABLE_MALE.M, t);
    expect(seamPairs.map((p) => p.key).sort()).toEqual(
      ["armhole-cap", "shoulder", "side", "sleeve-underarm"].sort(),
    );
  });

  it("the armhole-cap pair measures within a few mm -- Teagan's own solver, not ours", () => {
    const { seamPairs, drafted } = draftTeagan(
      tshirtSpec(),
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

  it("a longer sleeveLength style produces a longer sleeve", () => {
    const short = draftTeagan(
      tshirtSpec({ sleeve: "short" }),
      SIZE_TABLE_MALE.M,
      t,
    );
    const long = draftTeagan(
      tshirtSpec({ sleeve: "long" }),
      SIZE_TABLE_MALE.M,
      t,
    );
    const sleeveHeight = (pieces: typeof short.drafted) => {
      const sleeve = pieces.find((p) => p.id === "sleeve")!;
      const ys = sleeve.outlineCm.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(sleeveHeight(long.drafted)).toBeGreaterThan(
      sleeveHeight(short.drafted),
    );
  });

  it("drafts for a female base row too", () => {
    const { drafted } = draftTeagan(
      { ...tshirtSpec(), gender: "female" },
      SIZE_TABLE.M,
      t,
    );
    expect(drafted).toHaveLength(3);
  });

  it("piece id/order/count depends only on the spec, not the measurements row (draftGradedOverlays contract)", () => {
    const spec = tshirtSpec();
    const rows = [SIZE_TABLE_MALE.PP, SIZE_TABLE_MALE.M, SIZE_TABLE_MALE.GG];
    const idSequences = rows.map((row) =>
      draftTeagan(spec, row, t).drafted.map((p) => p.id),
    );
    expect(idSequences[1]).toEqual(idSequences[0]);
    expect(idSequences[2]).toEqual(idSequences[0]);
  });

  it("garmentLengthCm and armholeLenCm/sleeveArmholeCm are real, positive numbers", () => {
    const draft = draftTeagan(tshirtSpec(), SIZE_TABLE_MALE.M, t);
    expect(draft.garmentLengthCm).toBeGreaterThan(0);
    expect(draft.armholeLenCm).toBeGreaterThan(0);
    expect(draft.sleeveArmholeCm).toBeGreaterThan(0);
  });
});
