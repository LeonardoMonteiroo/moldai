import { describe, it, expect } from "vitest";
import { draftSkirt } from "./skirt";
import { curveArcLengthCm } from "../../../core";
import { SIZE_TABLE_MALE, SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

function skirtSpec(overrides: Partial<GarmentSpec["style"]> = {}): GarmentSpec {
  return {
    type: "skirt",
    gender: "female",
    measurementOverrides: {},
    style: { ...overrides },
  };
}

describe("draftSkirt", () => {
  it("drafts exactly two pieces: skirt, waistband", () => {
    const { drafted } = draftSkirt(skirtSpec(), SIZE_TABLE.M, t);
    expect(drafted.map((p) => p.id)).toEqual(["skirt", "waistband"]);
  });

  it("every piece has a real, finite, closed outline", () => {
    const { drafted } = draftSkirt(skirtSpec(), SIZE_TABLE.M, t);
    for (const piece of drafted) {
      expect(piece.outlineCm.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of piece.outlineCm) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("the skirt wedge is mirrored symmetric about its own foldEdge", () => {
    const { drafted } = draftSkirt(skirtSpec(), SIZE_TABLE.M, t);
    const skirt = drafted.find((p) => p.id === "skirt")!;
    expect(skirt.foldEdge).toBeDefined();
    const [a, b] = skirt.foldEdge!;
    // The fold axis here is a vertical line NOT at x=0 (Sandy's own
    // drafting coordinate system) -- both fold points share an x, whatever
    // it is, rather than both being ~0.
    expect(skirt.outlineCm[a][0]).toBeCloseTo(skirt.outlineCm[b][0], 6);
  });

  it("declares the waistband-waist seam pair", () => {
    const { seamPairs } = draftSkirt(skirtSpec(), SIZE_TABLE.M, t);
    expect(seamPairs.map((p) => p.key)).toEqual(["waistband-waist"]);
  });

  it("the waistband-waist pair's a-side is repeated once per qty (panels)", () => {
    const { seamPairs, drafted } = draftSkirt(skirtSpec(), SIZE_TABLE.M, t);
    const skirt = drafted.find((p) => p.id === "skirt")!;
    const pair = seamPairs[0];
    expect(pair.a).toHaveLength(skirt.qty);
  });

  it("reports the waistband's own real ease over the skirt's waist edge, not zero", () => {
    // Sandy's own circle-skirt math bakes in real waist ease (measured,
    // documented in skirt.ts's own top comment) -- asserting it's some
    // real, nonzero, plausible number confirms this wrapper reports it
    // honestly rather than defaulting to 0 (which would flag it as an
    // unexpected seam conflict instead of the design's own known slack).
    const { seamPairs, drafted } = draftSkirt(skirtSpec(), SIZE_TABLE.M, t);
    const pair = seamPairs[0];
    const skirt = drafted.find((p) => p.id === "skirt")!;
    const waistband = drafted.find((p) => p.id === "waistband")!;
    const waistLenCm = curveArcLengthCm(
      skirt.outlineCm,
      skirt.curvedSpans ?? [],
      skirt.seamEdges!.waist[0],
      skirt.seamEdges!.waist[1],
    );
    const waistbandLenCm = curveArcLengthCm(
      waistband.outlineCm,
      waistband.curvedSpans ?? [],
      waistband.seamEdges!.waist[0],
      waistband.seamEdges!.waist[1],
    );
    expect(pair.easeCm).toBeCloseTo(waistbandLenCm - waistLenCm * skirt.qty, 1);
    expect(pair.easeCm).not.toBe(0);
  });

  it("a longer skirtLengthCm produces a taller drafted skirt", () => {
    const short = draftSkirt(skirtSpec({ skirtLengthCm: 40 }), SIZE_TABLE.M, t);
    const long = draftSkirt(skirtSpec({ skirtLengthCm: 90 }), SIZE_TABLE.M, t);
    const height = (pieces: typeof short.drafted) => {
      const skirt = pieces.find((p) => p.id === "skirt")!;
      const ys = skirt.outlineCm.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height(long.drafted)).toBeGreaterThan(height(short.drafted));
  });

  it("drafts for a male base row too", () => {
    const { drafted } = draftSkirt(
      { ...skirtSpec(), gender: "male" },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(drafted).toHaveLength(2);
  });

  it("piece id/order/count depends only on the spec, not the measurements row (draftGradedOverlays contract)", () => {
    const spec = skirtSpec();
    const rows = [SIZE_TABLE.PP, SIZE_TABLE.M, SIZE_TABLE.GG];
    const idSequences = rows.map((row) =>
      draftSkirt(spec, row, t).drafted.map((p) => p.id),
    );
    expect(idSequences[1]).toEqual(idSequences[0]);
    expect(idSequences[2]).toEqual(idSequences[0]);
  });

  it("garmentLengthCm is a real, positive number, and armhole/sleeve fields are absent", () => {
    const draft = draftSkirt(skirtSpec(), SIZE_TABLE.M, t);
    expect(draft.garmentLengthCm).toBeGreaterThan(0);
    expect(draft.armholeLenCm).toBeUndefined();
    expect(draft.sleeveArmholeCm).toBeUndefined();
  });
});
