import { describe, it, expect } from "vitest";
import { toPlt, planPltStrips, PLT_PENS } from "./plt";
import { planRollStrips } from "./strips";
import { buildExportModel } from "./model";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { DECORATION_CASES } from "@/lib/draft/fixtures";

function patternFor(spec: Pattern["spec"]): Pattern {
  const gender = spec?.gender;
  const m = gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
  return {
    id: "p1",
    name: "Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["M"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: m },
    pieces: [],
    spec,
  };
}

describe("planRollStrips", () => {
  it("a sheet no wider than the roll returns exactly one strip", () => {
    const plan = planRollStrips(100, 150);
    expect(plan.strips).toHaveLength(1);
    expect(plan.strips[0]).toEqual({
      stripNumber: 1,
      originCm: { x: 0, y: 0 },
      widthCm: 100,
    });
  });

  it("a pattern wider than the roll produces the expected strip count", () => {
    // roll 150cm, overlap 2cm -> step 148cm; sheet 400cm ->
    // ceil((400-2)/148) = ceil(2.689...) = 3 strips
    const plan = planRollStrips(400, 150, 2);
    expect(plan.strips).toHaveLength(3);
    expect(plan.strips.map((s) => s.stripNumber)).toEqual([1, 2, 3]);
    expect(plan.strips[1].originCm.x).toBeCloseTo(148, 6);
  });
});

describe("toPlt", () => {
  it("starts with IN; and ends with SP0;", () => {
    const pat = patternFor({
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: {},
    });
    const model = buildExportModel(pat, t);
    const out = toPlt(model);
    expect(out.startsWith("IN;\n")).toBe(true);
    expect(out.trim().endsWith("SP0;")).toBe(true);
  });

  it("emits one PG; (page advance) per extra strip when the roll is narrower than the sheet", () => {
    const pat = patternFor({
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        skirt: "a-line",
      },
    });
    const model = buildExportModel(pat, t);
    const { rollPlan } = planPltStrips(model, 60); // deliberately narrow
    expect(rollPlan.strips.length).toBeGreaterThan(1);
    const out = toPlt(model, { rollWidthCm: 60 });
    const pgCount = (out.match(/^PG;$/gm) ?? []).length;
    expect(pgCount).toBe(rollPlan.strips.length - 1);
  });

  it("draws distinguishable pens for the cut line, grainline, and notches", () => {
    const pat = patternFor({
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "round", sleeve: "short", darts: true },
    });
    const model = buildExportModel(pat, t);
    const out = toPlt(model);
    expect(out).toContain(`SP${PLT_PENS.cut};`);
    expect(out).toContain(`SP${PLT_PENS.grainline};`);
    expect(out).toContain(`SP${PLT_PENS.notch};`);
    expect(out).toContain(`SP${PLT_PENS.text};`);
    expect(PLT_PENS.cut).not.toBe(PLT_PENS.grainline);
    expect(PLT_PENS.cut).not.toBe(PLT_PENS.notch);
    expect(PLT_PENS.cut).not.toBe(PLT_PENS.text);
  });

  it("piece name label is present (LB) and quantity annotated", () => {
    const pat = patternFor({
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: {},
    });
    const model = buildExportModel(pat, t);
    const out = toPlt(model);
    const expectedLabel = `LB${model.pieces[0].name.toUpperCase()} · ${model.pieces[0].qty}x`;
    expect(out).toContain(expectedLabel);
  });

  // #135: coordinates round-trip to the input cm within 0.02cm -- reads the
  // cut line's first vertex back out of the emitted PU command and compares
  // it against the same absolute cm point toDxf/toPdf would draw.
  it("emitted coordinates round-trip to the input cm within 0.02cm", () => {
    for (const [, spec] of DECORATION_CASES) {
      const pat = patternFor(spec);
      const model = buildExportModel(pat, t);
      const out = toPlt(model);
      const piece = model.pieces[0];
      const expectedXcm = piece.originCm.x + piece.cutOutline.start.x;
      const expectedYcm =
        model.sheetHeightCm - (piece.originCm.y + piece.cutOutline.start.y);

      const puMatch = out.match(/PU(-?\d+),(-?\d+);/);
      expect(puMatch).not.toBeNull();
      const [, xu, yu] = puMatch!;
      const UNITS_PER_CM = 1016 / 2.54;
      const gotXcm = Number(xu) / UNITS_PER_CM;
      const gotYcm = Number(yu) / UNITS_PER_CM;
      expect(Math.abs(gotXcm - expectedXcm)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(gotYcm - expectedYcm)).toBeLessThanOrEqual(0.02);
    }
  });
});
