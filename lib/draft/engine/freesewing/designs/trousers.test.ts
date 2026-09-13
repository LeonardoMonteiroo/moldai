import { describe, it, expect } from "vitest";
import { draftTrousers } from "./trousers";
import { curveArcLengthCm } from "../../../core";
import { walkSeamPairs } from "../../../seams";
import { WAISTBAND_OVERLAP_CM } from "../../../subpieces";
import { SIZE_TABLE_MALE, SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

function trousersSpec(
  overrides: Partial<GarmentSpec["style"]> = {},
): GarmentSpec {
  return {
    type: "trousers",
    gender: "female",
    measurementOverrides: {},
    style: { ...overrides },
  };
}

describe("draftTrousers", () => {
  it("drafts exactly three pieces: front, back, waistband", () => {
    const { drafted } = draftTrousers(trousersSpec(), SIZE_TABLE.M, t);
    expect(drafted.map((p) => p.id)).toEqual([
      "trouser-front",
      "trouser-back",
      "waistband",
    ]);
  });

  it("every piece has a real, finite, closed outline", () => {
    const { drafted } = draftTrousers(trousersSpec(), SIZE_TABLE.M, t);
    for (const piece of drafted) {
      expect(piece.outlineCm.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of piece.outlineCm) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  // Unlike a bodice/skirt panel, a trouser leg's inseam and outseam are
  // not symmetric about any centre line (lib/draft/trousers.ts's own top
  // comment) -- Titan draws each leg as a WHOLE, asymmetric single-leg
  // shape too, so neither panel should declare a foldEdge.
  it("front and back panels declare no foldEdge (asymmetric leg shapes, cut qty 2)", () => {
    const { drafted } = draftTrousers(trousersSpec(), SIZE_TABLE.M, t);
    const front = drafted.find((p) => p.id === "trouser-front")!;
    const back = drafted.find((p) => p.id === "trouser-back")!;
    expect(front.foldEdge).toBeUndefined();
    expect(back.foldEdge).toBeUndefined();
    expect(front.qty).toBe(2);
    expect(back.qty).toBe(2);
  });

  it("declares the five expected seam pairs", () => {
    const { seamPairs } = draftTrousers(trousersSpec(), SIZE_TABLE.M, t);
    expect(seamPairs.map((p) => p.key)).toEqual([
      "trouser-front-rise",
      "trouser-back-rise",
      "trouser-inseam",
      "trouser-outseam",
      "trouser-waistband-waist",
    ]);
  });

  it("front-rise and back-rise are self-pairs (a piece's own rise edge sewn to its own mirrored copy)", () => {
    const { drafted, seamPairs } = draftTrousers(
      trousersSpec(),
      SIZE_TABLE.M,
      t,
    );
    const measured = walkSeamPairs(drafted, seamPairs);
    const frontRise = measured.find((m) => m.key === "trouser-front-rise")!;
    const backRise = measured.find((m) => m.key === "trouser-back-rise")!;
    expect(frontRise.aPieceId).toBe("trouser-front");
    expect(frontRise.bPieceId).toBe("trouser-front");
    expect(frontRise.diffCm).toBe(0);
    expect(backRise.aPieceId).toBe("trouser-back");
    expect(backRise.bPieceId).toBe("trouser-back");
    expect(backRise.diffCm).toBe(0);
  });

  // Titan's own internal fitting loop (adaptInseam/adaptOutseam,
  // @freesewing/titan's front.mjs/back.mjs) explicitly adjusts the front
  // panel until its inseam and outseam match the back panel's own
  // stored lengths, converging to within 1mm by its own "delta > 1"
  // stopping condition -- this cross-checks that guarantee against the
  // ACTUALLY DRAFTED geometry (never trusting the design's own internal
  // accounting in isolation), the same armhole/cap discipline
  // tshirt.test.ts's own cross-check already establishes.
  it("front and back inseam/outseam match within Titan's own ~1mm fitting tolerance", () => {
    const { drafted, seamPairs } = draftTrousers(
      trousersSpec(),
      SIZE_TABLE.M,
      t,
    );
    const measured = walkSeamPairs(drafted, seamPairs);
    const inseam = measured.find((m) => m.key === "trouser-inseam")!;
    const outseam = measured.find((m) => m.key === "trouser-outseam")!;
    expect(inseam.diffCm).toBeLessThan(0.5);
    expect(outseam.diffCm).toBeLessThan(0.5);
  });

  it("reports the waistband's own real overlap over the summed front+back waist edges, not zero", () => {
    const { drafted, seamPairs } = draftTrousers(
      trousersSpec(),
      SIZE_TABLE.M,
      t,
    );
    const front = drafted.find((p) => p.id === "trouser-front")!;
    const back = drafted.find((p) => p.id === "trouser-back")!;
    const waistband = drafted.find((p) => p.id === "waistband")!;
    const waistLenCm =
      curveArcLengthCm(
        front.outlineCm,
        front.curvedSpans ?? [],
        ...front.seamEdges!.waist,
      ) *
        front.qty +
      curveArcLengthCm(
        back.outlineCm,
        back.curvedSpans ?? [],
        ...back.seamEdges!.waist,
      ) *
        back.qty;
    const waistbandLenCm = curveArcLengthCm(
      waistband.outlineCm,
      waistband.curvedSpans ?? [],
      ...waistband.seamEdges!.waist,
    );
    const pair = seamPairs.find((p) => p.key === "trouser-waistband-waist")!;
    expect(pair.easeCm).toBe(WAISTBAND_OVERLAP_CM);
    expect(pair.easeCm).not.toBe(0);
    expect(waistbandLenCm - waistLenCm).toBeCloseTo(WAISTBAND_OVERLAP_CM, 1);
  });

  it("a longer trouserLengthCm produces a taller drafted leg and a larger garmentLengthCm", () => {
    const short = draftTrousers(
      trousersSpec({ trouserLengthCm: 70 }),
      SIZE_TABLE.M,
      t,
    );
    const long = draftTrousers(
      trousersSpec({ trouserLengthCm: 100 }),
      SIZE_TABLE.M,
      t,
    );
    expect(long.garmentLengthCm).toBeGreaterThan(short.garmentLengthCm!);
    const height = (pieces: typeof short.drafted) => {
      const front = pieces.find((p) => p.id === "trouser-front")!;
      const ys = front.outlineCm.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height(long.drafted)).toBeGreaterThan(height(short.drafted));
  });

  it("falls back to moldai's own TROUSER_DEFAULT_LENGTH_CM per gender when trouserLengthCm is unset", () => {
    const female = draftTrousers(trousersSpec(), SIZE_TABLE.M, t);
    const male = draftTrousers(
      { ...trousersSpec(), gender: "male" },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(female.garmentLengthCm).toBe(100);
    expect(male.garmentLengthCm).toBe(104);
  });

  it("drafts for a male base row too", () => {
    const { drafted } = draftTrousers(
      { ...trousersSpec(), gender: "male" },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(drafted).toHaveLength(3);
  });

  it("piece id/order/count depends only on the spec, not the measurements row (draftGradedOverlays contract)", () => {
    const spec = trousersSpec();
    const rows = [SIZE_TABLE.PP, SIZE_TABLE.M, SIZE_TABLE.GG];
    const idSequences = rows.map((row) =>
      draftTrousers(spec, row, t).drafted.map((p) => p.id),
    );
    expect(idSequences[1]).toEqual(idSequences[0]);
    expect(idSequences[2]).toEqual(idSequences[0]);
  });

  it("garmentLengthCm is a real, positive number, and armhole/sleeve fields are absent", () => {
    const draft = draftTrousers(trousersSpec(), SIZE_TABLE.M, t);
    expect(draft.garmentLengthCm).toBeGreaterThan(0);
    expect(draft.armholeLenCm).toBeUndefined();
    expect(draft.sleeveArmholeCm).toBeUndefined();
  });

  // #326: Titan's own `lengthBonus` option is DEFINED as targetLengthCm /
  // base.waistToFloor, so without a distinct reference row the drafted leg
  // was solved to equal the SAME explicit/defaulted targetLengthCm on every
  // row (the freesewing-engine mirror of moldai's own flat-leg bug) --
  // fixed by resolving targetLengthCm through the shared gradedLengthCm
  // first (see designs/trousers.ts's own top-of-file import comment, and
  // designs/skirt.test.ts's identical precedent, #249).
  describe("trouserLengthCm grading across sizes (#326)", () => {
    function height(drafted: ReturnType<typeof draftTrousers>["drafted"]) {
      const front = drafted.find((p) => p.id === "trouser-front")!;
      const ys = front.outlineCm.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    }

    it("an explicit trouserLengthCm grades two sizes in the SAME ratio the chart's own waistToFloor grades", () => {
      const spec = trousersSpec({ trouserLengthCm: 95 });
      const baseRow = SIZE_TABLE.M;
      const pp = draftTrousers(spec, SIZE_TABLE.PP, t, baseRow);
      const gg = draftTrousers(spec, SIZE_TABLE.GG, t, baseRow);
      const lenPP = height(pp.drafted);
      const lenGG = height(gg.drafted);
      expect(lenPP).not.toBeCloseTo(lenGG, 1);
      // Titan's own construction (waistband additions on top of the pure
      // lengthBonus*waistToFloor leg) isn't a perfectly linear function of
      // targetLengthCm, so this is a looser bound than lib/draft/
      // trousers.test.ts's own exact-formula assertion -- proving the ratio
      // lands close to the chart's, not bit-identical to it.
      expect(lenPP / lenGG).toBeCloseTo(
        SIZE_TABLE.PP.waistToFloor / SIZE_TABLE.GG.waistToFloor,
        1,
      );
    });

    it("a fallback (no explicit) length still differs across two sizes, matching the chart directly", () => {
      const spec = trousersSpec();
      const pp = draftTrousers(spec, SIZE_TABLE.PP, t);
      const gg = draftTrousers(spec, SIZE_TABLE.GG, t);
      expect(height(pp.drafted)).not.toBeCloseTo(height(gg.drafted), 1);
    });

    it("without a distinct reference row (the freesewing engine's own draft() before this fix wired one through for trousers), an explicit length is used exactly as before", () => {
      const draft = draftTrousers(
        trousersSpec({ trouserLengthCm: 95 }),
        SIZE_TABLE.GG,
        t,
      );
      expect(draft.garmentLengthCm).toBeCloseTo(95, 5);
    });
  });
});
