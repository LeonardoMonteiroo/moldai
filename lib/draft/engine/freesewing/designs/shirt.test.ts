import { describe, it, expect } from "vitest";
import { draftShirt } from "./shirt";
import { walkSeamPairs, SEAM_TOLERANCE_CM } from "../../../seams";
import { WRIST_EASE_CM } from "../../../sleeve";
import { BUTTON_STAND_WIDTH_CM } from "../../../subpieces";
import { SIZE_TABLE_MALE, SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

function shirtSpec(overrides: Partial<GarmentSpec["style"]> = {}): GarmentSpec {
  return {
    type: "shirt",
    gender: "female",
    measurementOverrides: {},
    style: { ...overrides },
  };
}

describe("draftShirt", () => {
  it("drafts back/yoke/front-right/front-left/sleeve/cuff/collar-stand/collar-fall for a long sleeve", () => {
    const { drafted } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    expect(drafted.map((p) => p.id)).toEqual([
      "body-back",
      "yoke",
      "body-front-right",
      "body-front-left",
      "sleeve",
      "cuff",
      "collar-stand",
      "collar-fall",
    ]);
  });

  it("drafts no cuff for a short sleeve -- Simon's own short branch finishes with a folded hem", () => {
    const { drafted, seamPairs } = draftShirt(
      shirtSpec({ sleeve: "short" }),
      SIZE_TABLE.M,
      t,
    );
    expect(drafted.map((p) => p.id)).toEqual([
      "body-back",
      "yoke",
      "body-front-right",
      "body-front-left",
      "sleeve",
      "collar-stand",
      "collar-fall",
    ]);
    expect(seamPairs.some((p) => p.key === "shirt-cuff-wrist")).toBe(false);
  });

  it("every piece has a real, finite, closed outline", () => {
    const { drafted } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    for (const piece of drafted) {
      expect(piece.outlineCm.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of piece.outlineCm) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("back is cut on fold; front-right/front-left/yoke are not", () => {
    const { drafted } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    const back = drafted.find((p) => p.id === "body-back")!;
    const frontRight = drafted.find((p) => p.id === "body-front-right")!;
    const frontLeft = drafted.find((p) => p.id === "body-front-left")!;
    const yoke = drafted.find((p) => p.id === "yoke")!;
    expect(back.foldEdge).toBeDefined();
    expect(back.qty).toBe(1);
    expect(frontRight.foldEdge).toBeUndefined();
    expect(frontRight.qty).toBe(1);
    expect(frontLeft.foldEdge).toBeUndefined();
    expect(frontLeft.qty).toBe(1);
    expect(yoke.foldEdge).toBeUndefined();
    expect(yoke.qty).toBe(2);
  });

  it("declares the expected seam pairs for a long sleeve", () => {
    const { seamPairs } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    expect(seamPairs.map((p) => p.key)).toEqual([
      "shirt-yoke-back",
      "shirt-side-right",
      "shirt-side-left",
      "shirt-shoulder-right",
      "shirt-shoulder-left",
      "shirt-armhole-cap-right",
      "shirt-armhole-cap-left",
      "shirt-sleeve-underarm",
      "shirt-cuff-wrist",
      "shirt-collar-neckline",
      "shirt-collar-stand-fall",
    ]);
  });

  it("yoke-back and sleeve-underarm are exact (0 diff) -- same points by construction", () => {
    const { drafted, seamPairs } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    const measured = walkSeamPairs(drafted, seamPairs);
    const yokeBack = measured.find((m) => m.key === "shirt-yoke-back")!;
    expect(yokeBack.diffCm).toBeLessThan(SEAM_TOLERANCE_CM);
    const underarm = measured.find((m) => m.key === "shirt-sleeve-underarm")!;
    expect(underarm.aPieceId).toBe("sleeve");
    expect(underarm.bPieceId).toBe("sleeve");
    expect(underarm.diffCm).toBe(0);
  });

  it("both armhole-cap pairs (right and left) measure within tolerance", () => {
    const { drafted, seamPairs } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    const measured = walkSeamPairs(drafted, seamPairs);
    const right = measured.find((m) => m.key === "shirt-armhole-cap-right")!;
    const left = measured.find((m) => m.key === "shirt-armhole-cap-left")!;
    expect(right.diffCm).toBeLessThan(SEAM_TOLERANCE_CM);
    expect(left.diffCm).toBeLessThan(SEAM_TOLERANCE_CM);
  });

  it("reports the cuff's own real WRIST_EASE_CM.woven over the sleeve's measured wrist edge, not zero", () => {
    const { seamPairs } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    const pair = seamPairs.find((p) => p.key === "shirt-cuff-wrist")!;
    expect(pair.easeCm).toBe(WRIST_EASE_CM.woven);
    expect(pair.easeCm).not.toBe(0);
  });

  it("reports the collar's own real BUTTON_STAND_WIDTH_CM over the measured neckline, not zero", () => {
    const { seamPairs } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    const pair = seamPairs.find((p) => p.key === "shirt-collar-neckline")!;
    expect(pair.easeCm).toBe(BUTTON_STAND_WIDTH_CM);
    expect(pair.easeCm).not.toBe(0);
  });

  it("collar-stand-fall is exact (0 diff) -- the fall is sized off the stand's own measured seam", () => {
    const { drafted, seamPairs } = draftShirt(
      shirtSpec({ sleeve: "long" }),
      SIZE_TABLE.M,
      t,
    );
    const measured = walkSeamPairs(drafted, seamPairs);
    const pair = measured.find((m) => m.key === "shirt-collar-stand-fall")!;
    expect(pair.diffCm).toBeLessThan(SEAM_TOLERANCE_CM);
  });

  it("a short sleeve request drafts a measurably shorter sleeve than long", () => {
    const short = draftShirt(shirtSpec({ sleeve: "short" }), SIZE_TABLE.M, t);
    const long = draftShirt(shirtSpec({ sleeve: "long" }), SIZE_TABLE.M, t);
    const sleeveHeight = (d: typeof short) => {
      const s = d.drafted.find((p) => p.id === "sleeve")!;
      const ys = s.outlineCm.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(sleeveHeight(long)).toBeGreaterThan(sleeveHeight(short));
  });

  it("declares no armhole/sleeve-cap scalar fields (those live on the seam pairs, not EngineDraft's own top-level fields, for this archetype)", () => {
    const draft = draftShirt(shirtSpec({ sleeve: "long" }), SIZE_TABLE.M, t);
    expect(draft.armholeLenCm).toBeUndefined();
    expect(draft.sleeveArmholeCm).toBeUndefined();
    expect(draft.garmentLengthCm).toBeGreaterThan(0);
  });

  it("drafts for a male base row too", () => {
    const { drafted } = draftShirt(
      { ...shirtSpec({ sleeve: "long" }), gender: "male" },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(drafted).toHaveLength(8);
  });

  it("piece id/order/count depends only on the spec, not the measurements row (draftGradedOverlays contract)", () => {
    const spec = shirtSpec({ sleeve: "long" });
    const rows = [SIZE_TABLE.PP, SIZE_TABLE.M, SIZE_TABLE.GG];
    const idSequences = rows.map((row) =>
      draftShirt(spec, row, t).drafted.map((p) => p.id),
    );
    expect(idSequences[1]).toEqual(idSequences[0]);
    expect(idSequences[2]).toEqual(idSequences[0]);
  });
});
