import { describe, it, expect } from "vitest";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { draftTrousers, TROUSER_DEFAULT_LENGTH_CM } from "./trousers";
import { bbox } from "./core";
import { t } from "@/lib/i18n/test-translate";

const M = SIZE_TABLE.M;

describe("draftTrousers", () => {
  it("drafts a front and a back panel, each qty 2 (one leg mirrors the other by flipping fabric)", () => {
    const { front, back } = draftTrousers(M, {}, "female", t);
    expect(front.qty).toBe(2);
    expect(back.qty).toBe(2);
    expect(front.id).toBe("trouser-front");
    expect(back.id).toBe("trouser-back");
  });

  it("front and back share the same total waist-to-hem length (by construction)", () => {
    const { front, back } = draftTrousers(
      M,
      { trouserLengthCm: 95 },
      "female",
      t,
    );
    expect(bbox(front.outlineCm).h).toBeCloseTo(bbox(back.outlineCm).h, 5);
  });
});

// #326: an explicit or defaulted style.trouserLengthCm used to be read as
// one absolute number for EVERY graded size, freezing the leg identical
// across a graded layered PDF export while waistToFloor (the real per-size
// measurement it now grades against) already grades per chart -- mirrors
// lib/draft/skirt.test.ts's own "gradedLengthCm / draftSkirt's baseRow"
// regression suite, here against draftTrousers's own baseRow param.
describe("gradedLengthCm / draftTrousers's baseRow (#326)", () => {
  it("an explicit trouserLengthCm grades two sizes in the SAME ratio the chart's own waistToFloor grades", () => {
    const baseRow = SIZE_TABLE.M; // waistToFloor 104.8
    const rowPP = SIZE_TABLE.PP; // waistToFloor 101.1
    const rowGG = SIZE_TABLE.GG; // waistToFloor 108.4
    const style = { trouserLengthCm: 95 };
    const pp = draftTrousers(rowPP, style, "female", t, baseRow);
    const gg = draftTrousers(rowGG, style, "female", t, baseRow);
    const lenPP = bbox(pp.front.outlineCm).h;
    const lenGG = bbox(gg.front.outlineCm).h;
    expect(lenPP).not.toBeCloseTo(lenGG, 1);
    expect(lenPP / lenGG).toBeCloseTo(
      rowPP.waistToFloor / rowGG.waistToFloor,
      5,
    );
  });

  it("a DEFAULTED (no explicit) trouserLengthCm also grades across sizes, unlike the pre-#326 flat behavior", () => {
    const baseRow = SIZE_TABLE.M;
    const pp = draftTrousers(SIZE_TABLE.PP, {}, "female", t, baseRow);
    const gg = draftTrousers(SIZE_TABLE.GG, {}, "female", t, baseRow);
    const lenPP = bbox(pp.front.outlineCm).h;
    const lenGG = bbox(gg.front.outlineCm).h;
    expect(lenPP).not.toBeCloseTo(lenGG, 1);
    expect(lenPP / lenGG).toBeCloseTo(
      SIZE_TABLE.PP.waistToFloor / SIZE_TABLE.GG.waistToFloor,
      5,
    );
    // The base row's own defaulted length is still exactly
    // TROUSER_DEFAULT_LENGTH_CM (ratio 1 at the reference row itself).
    const atBase = draftTrousers(baseRow, {}, "female", t, baseRow);
    expect(bbox(atBase.front.outlineCm).h).toBeCloseTo(
      TROUSER_DEFAULT_LENGTH_CM.female,
      5,
    );
  });

  it("collapses to the explicit value unchanged when the reference row IS the target row (every pre-#326 call site)", () => {
    const dp = draftTrousers(
      SIZE_TABLE.GG,
      { trouserLengthCm: 95 },
      "female",
      t,
    );
    expect(bbox(dp.front.outlineCm).h).toBeCloseTo(95, 5);
  });

  // #326 AC4: a chart whose own waistToFloor doesn't vary by size (predates
  // #269's CORE promotion, was imported with an unmapped column, or had its
  // progression rule dropped by a PATCH) must degrade to the pre-#326 flat
  // behavior rather than throw or divide by zero -- simulated here by a
  // "graded" row whose waistToFloor is forced equal to the reference row's
  // own (every OTHER measurement still differs, so this isn't just the
  // "same row" case above).
  it("degrades to the pre-#326 flat length when the target row's own waistToFloor doesn't differ from the reference row's", () => {
    const baseRow = SIZE_TABLE.M;
    const flatGG = { ...SIZE_TABLE.GG, waistToFloor: baseRow.waistToFloor };
    const { front } = draftTrousers(flatGG, {}, "female", t, baseRow);
    expect(bbox(front.outlineCm).h).toBeCloseTo(
      TROUSER_DEFAULT_LENGTH_CM.female,
      5,
    );
  });

  // #326: garment.ts reads garmentLengthCm off the piece's own
  // resolvedLengthCm instead of a second gradedLengthCm call -- this pins
  // the field to the SAME value the outline itself was drafted at, on both
  // panels (see core.ts's own doc, and skirt.test.ts's identical precedent).
  it("exposes the resolved length as resolvedLengthCm on both panels, matching the drafted outline", () => {
    const baseRow = SIZE_TABLE.M;
    const { front, back } = draftTrousers(
      SIZE_TABLE.GG,
      { trouserLengthCm: 95 },
      "female",
      t,
      baseRow,
    );
    expect(front.resolvedLengthCm).toBeCloseTo(bbox(front.outlineCm).h, 5);
    expect(back.resolvedLengthCm).toBeCloseTo(front.resolvedLengthCm!, 5);
    expect(front.resolvedLengthCm).toBeCloseTo(
      (95 / baseRow.waistToFloor) * SIZE_TABLE.GG.waistToFloor,
      5,
    );
  });

  it("grades against the MALE chart's own waistToFloor for a male spec", () => {
    const baseRow = SIZE_TABLE_MALE.M; // waistToFloor 116.0
    const base = draftTrousers(baseRow, {}, "male", t, baseRow);
    const graded = draftTrousers(SIZE_TABLE_MALE.GG, {}, "male", t, baseRow);
    expect(bbox(base.front.outlineCm).h).toBeCloseTo(
      TROUSER_DEFAULT_LENGTH_CM.male,
      5,
    );
    expect(bbox(graded.front.outlineCm).h).not.toBeCloseTo(
      bbox(base.front.outlineCm).h,
      1,
    );
    expect(
      bbox(graded.front.outlineCm).h / bbox(base.front.outlineCm).h,
    ).toBeCloseTo(
      SIZE_TABLE_MALE.GG.waistToFloor / SIZE_TABLE_MALE.M.waistToFloor,
      5,
    );
  });
});
