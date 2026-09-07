import { describe, it, expect } from "vitest";
import {
  validateSpec,
  validateQuestions,
  seamCheck,
  STYLE_LIMITS,
} from "./garment";
import {
  draftGarment,
  draftPiecesCm,
  draftGradedOverlays,
  measureSeams,
  measureSeamGraph,
} from "./engine/facade";
import { DEFAULT_ENGINE_ID } from "./engine/capability";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  MEASUREMENT_RANGES,
  type Measurements,
} from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import {
  curveArcLengthCm,
  bbox,
  catmullRomSegments,
  type InternalCm,
} from "./core";
import { DECORATION_CASES } from "./fixtures";
import {
  PLACKET_FOLD_OVERLAP_CM,
  PLACKET_FOLD_UNDERLAP_CM,
  BUTTON_STAND_WIDTH_CM,
} from "./subpieces";
import { buildAssemblyOrder } from "./assembly";
import type { GarmentSpec, Pattern } from "@/lib/types";

function isFoldLine(
  e: InternalCm,
): e is Extract<InternalCm, { kind: "foldLine" }> {
  return e.kind === "foldLine";
}

describe("validateSpec", () => {
  it("falls back to defaults on invalid enums and clamps ranges", () => {
    const s = validateSpec({
      type: "foo",
      gender: "xx",
      style: { skirt: "xxx", skirtLengthCm: 999, necklineDepthCm: -5 },
      measurementOverrides: { waist: 70, hack: 1 },
    });
    expect(s.type).toBe("blouse");
    expect(s.gender).toBe("female");
    expect(s.style.skirt).toBe("straight");
    expect(s.style.skirtLengthCm).toBeLessThanOrEqual(120);
    expect(s.style.necklineDepthCm).toBeGreaterThanOrEqual(0);
    expect(s.measurementOverrides.hack).toBeUndefined();
    expect(s.measurementOverrides.waist).toBe(70);
  });
  it("accepts type tshirt and gender male", () => {
    const s = validateSpec({
      type: "tshirt",
      gender: "male",
      style: {},
      measurementOverrides: {},
    });
    expect(s.type).toBe("tshirt");
    expect(s.gender).toBe("male");
  });
  it("preserves a valid zero in seamAllowanceCm", () => {
    expect(
      validateSpec({
        type: "skirt",
        style: { seamAllowanceCm: 0 },
        measurementOverrides: {},
      }).style.seamAllowanceCm,
    ).toBe(0);
  });
  it("clamps an invalid zero in skirtLengthCm to the lower bound", () => {
    expect(
      validateSpec({
        type: "skirt",
        style: { skirtLengthCm: 0 },
        measurementOverrides: {},
      }).style.skirtLengthCm,
    ).toBe(25);
  });
  it("uses the default for non-finite values", () => {
    expect(
      validateSpec({
        type: "skirt",
        style: { skirtLengthCm: "xxx" as unknown as number },
        measurementOverrides: {},
      }).style.skirtLengthCm,
    ).toBe(60);
  });
  it("clamps armholeDeepenCm to 0..6 and discards sleeveRefit coming from the AI", () => {
    const s = validateSpec({
      type: "blouse",
      style: { armholeDeepenCm: 99, sleeveRefit: true },
      measurementOverrides: {},
    });
    expect(s.style.armholeDeepenCm).toBe(6);
    expect(s.style.sleeveRefit).toBeUndefined();
  });
  it("clamps a negative armholeDeepenCm to 0", () => {
    expect(
      validateSpec({
        type: "blouse",
        style: { armholeDeepenCm: -3 },
        measurementOverrides: {},
      }).style.armholeDeepenCm,
    ).toBe(0);
  });
  it("falls back to the fitted/none defaults on invalid fit/stretch enums", () => {
    const s = validateSpec({
      type: "blouse",
      style: { fit: "baggy", stretch: "extreme" },
      measurementOverrides: {},
    });
    expect(s.style.fit).toBe("fitted");
    expect(s.style.stretch).toBe("none");
  });
  it("accepts every valid fit and stretch class", () => {
    for (const fit of ["close", "fitted", "semiFitted", "loose"] as const) {
      expect(
        validateSpec({
          type: "blouse",
          style: { fit },
          measurementOverrides: {},
        }).style.fit,
      ).toBe(fit);
    }
    for (const stretch of ["none", "low", "medium", "high"] as const) {
      expect(
        validateSpec({
          type: "tshirt",
          style: { stretch },
          measurementOverrides: {},
        }).style.stretch,
      ).toBe(stretch);
    }
  });
  it("leaves fit/stretch undefined when the spec doesn't mention them", () => {
    const s = validateSpec({
      type: "blouse",
      style: {},
      measurementOverrides: {},
    });
    expect(s.style.fit).toBeUndefined();
    expect(s.style.stretch).toBeUndefined();
  });
  it("clamps numeric style fields to the exported STYLE_LIMITS bounds", () => {
    const s = validateSpec({
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: {
        necklineDepthCm: 999,
        skirtLengthCm: 0,
        seamAllowanceCm: 99,
        armholeDeepenCm: 99,
      },
    });
    expect(s.style.necklineDepthCm).toBe(STYLE_LIMITS.necklineDepthCm.max);
    expect(s.style.skirtLengthCm).toBe(STYLE_LIMITS.skirtLengthCm.min);
    expect(s.style.seamAllowanceCm).toBe(STYLE_LIMITS.seamAllowanceCm.max);
    expect(s.style.armholeDeepenCm).toBe(STYLE_LIMITS.armholeDeepenCm.max);
  });

  // #129/#130/#131: collar/cuff/waistband are closed enums (no numeric
  // range) -- an invalid value falls back to a fixed default the same way
  // neckline/sleeve/skirt already do, and collar/cuff default "none" while
  // waistband defaults "straight" (see lib/types.ts's GarmentStyle doc for
  // why the three don't share one default).
  it("falls back to none/none/straight on invalid collar/cuff/waistband enums", () => {
    const s = validateSpec({
      type: "blouse",
      style: { collar: "peter-pan", cuff: "tower", waistband: "contoured" },
      measurementOverrides: {},
    });
    expect(s.style.collar).toBe("none");
    expect(s.style.cuff).toBe("none");
    expect(s.style.waistband).toBe("straight");
  });

  it("accepts every valid collar/cuff/waistband value", () => {
    const s = validateSpec({
      type: "blouse",
      style: { collar: "convertible", cuff: "straight", waistband: "none" },
      measurementOverrides: {},
    });
    expect(s.style.collar).toBe("convertible");
    expect(s.style.cuff).toBe("straight");
    expect(s.style.waistband).toBe("none");
  });

  // #221: "band" is the second real collar shape -- accepted exactly like
  // "convertible", never falling back to it.
  it("accepts collar: band", () => {
    const s = validateSpec({
      type: "blouse",
      style: { collar: "band" },
      measurementOverrides: {},
    });
    expect(s.style.collar).toBe("band");
  });

  // #222: "shirt" (the two-piece stand+fall assembly) is the third real
  // collar shape -- accepted exactly like "convertible"/"band", never
  // falling back to either.
  it("accepts collar: shirt", () => {
    const s = validateSpec({
      type: "blouse",
      style: { collar: "shirt" },
      measurementOverrides: {},
    });
    expect(s.style.collar).toBe("shirt");
  });

  it("leaves collar/cuff/waistband undefined when the spec doesn't mention them", () => {
    const s = validateSpec({
      type: "blouse",
      style: {},
      measurementOverrides: {},
    });
    expect(s.style.collar).toBeUndefined();
    expect(s.style.cuff).toBeUndefined();
    expect(s.style.waistband).toBeUndefined();
  });

  it("falls back to none on an invalid frontClosure enum", () => {
    const s = validateSpec({
      type: "blouse",
      style: { frontClosure: "zipper" },
      measurementOverrides: {},
    });
    expect(s.style.frontClosure).toBe("none");
  });

  it("accepts frontClosure: buttonStand", () => {
    const s = validateSpec({
      type: "blouse",
      style: { frontClosure: "buttonStand" },
      measurementOverrides: {},
    });
    expect(s.style.frontClosure).toBe("buttonStand");
  });

  it("leaves frontClosure undefined when the spec doesn't mention it", () => {
    const s = validateSpec({
      type: "blouse",
      style: {},
      measurementOverrides: {},
    });
    expect(s.style.frontClosure).toBeUndefined();
  });
});

// #269: "hoodie"/"coat" are real app-level GarmentTypes (validateSpec/TYPES
// both accept them -- lib/draft/vocabulary.ts) that moldai's own drafter
// has no branch for at all (MOLDAI_CAPABILITY.types deliberately excludes
// both, lib/draft/engine/capability.ts). A production caller is gated
// upstream by checkEngineSupport's own "type" gap before ever reaching
// this far -- this test pins the defensive backstop for the case that
// gate is ever skipped (a future bug, a new direct-call test): a loud
// failure, never a silently empty `drafted: []`.
describe("draftGarment throws for a type moldai has no drafter for", () => {
  it.each(["hoodie", "coat"] as const)("%s", (type) => {
    const spec: GarmentSpec = {
      type,
      gender: "female",
      measurementOverrides: {},
      style: {},
    };
    expect(() =>
      draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t),
    ).toThrow(/no drafter wired/);
  });
});

describe("draftGarment", () => {
  it("blouse generates front, back, and sleeve", () => {
    const { pieces } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", neckline: "V" },
      },
      SIZE_TABLE.M,
      t,
    );
    expect(pieces.map((p) => p.id).sort()).toEqual([
      "body-back",
      "body-front",
      "sleeve",
    ]);
  });
  it("tshirt generates front/back/sleeve/collar, no dart, round neckline", () => {
    const { pieces } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "tshirt",
        gender: "male",
        measurementOverrides: {},
        style: {},
      },
      SIZE_TABLE_MALE.M,
      t,
    );
    const ids = pieces.map((p) => p.id).sort();
    expect(ids).toEqual(["body-back", "body-front", "collar", "sleeve"]);
    const front = pieces.find((p) => p.id === "body-front")!;
    expect(front.darts).toBeUndefined();
    expect(front.detailRows.some((r) => r.value === "neckline.round")).toBe(
      true,
    );
  });
  // tshirt-fit-calibration: the default collar: "band" must not override an
  // explicit caller choice.
  it("tshirt with an explicit collar: none drafts no collar piece", () => {
    const { pieces } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "tshirt",
        gender: "male",
        measurementOverrides: {},
        style: { collar: "none" },
      },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(pieces.map((p) => p.id)).not.toContain("collar");
  });
  it("skirt generates the skirt panel plus its default waistband, and viewBox > 0 (#131)", () => {
    const { pieces, viewBox } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "skirt",
        gender: "female",
        measurementOverrides: {},
        style: { skirt: "gore" },
      },
      SIZE_TABLE.M,
      t,
    );
    expect(pieces.map((p) => p.id)).toEqual(["skirt", "waistband"]);
    expect(viewBox.w).toBeGreaterThan(0);
  });

  it('skirt with waistband: "none" generates only the skirt piece (#131)', () => {
    const { pieces } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "skirt",
        gender: "female",
        measurementOverrides: {},
        style: { skirt: "gore", waistband: "none" },
      },
      SIZE_TABLE.M,
      t,
    );
    expect(pieces.map((p) => p.id)).toEqual(["skirt"]);
  });
  it("dress combines body + skirt", () => {
    const { pieces } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "dress",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "none", skirt: "a-line" },
      },
      SIZE_TABLE.M,
      t,
    );
    const ids = pieces.map((p) => p.id);
    expect(ids).toContain("skirt");
    expect(ids).toContain("body-front");
  });
  it("armholeDeepenCm makes the body armhole diverge from the sleeve cap (triggers seamCheck)", () => {
    const { armholeLenCm, sleeveArmholeCm } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", armholeDeepenCm: 2 },
      },
      SIZE_TABLE.M,
      t,
    );
    expect(armholeLenCm! - sleeveArmholeCm!).toBeGreaterThan(1);
  });
  it("without an armhole adjustment, the cap's measured fit matches the body's measured armhole (no conflict)", () => {
    // sleeveArmholeCm is now measured from the drafted cap's own curve
    // (fitted arc minus the documented cap ease), not an echo of the
    // argument passed into draftSleeve (#78) — so this only holds if the
    // solver in sleeve.ts actually converges the cap to the target.
    const { armholeLenCm, sleeveArmholeCm } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short" },
      },
      SIZE_TABLE.M,
      t,
    );
    expect(Math.abs(armholeLenCm! - sleeveArmholeCm!)).toBeLessThan(0.01);
  });
  it("sleeveRefit remakes the cap for the adjusted armhole (seams match again)", () => {
    const { armholeLenCm, sleeveArmholeCm } = draftGarment(
      DEFAULT_ENGINE_ID,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", armholeDeepenCm: 2, sleeveRefit: true },
      },
      SIZE_TABLE.M,
      t,
    );
    expect(Math.abs(armholeLenCm! - sleeveArmholeCm!)).toBeLessThan(0.01);
  });

  // #140: an incomplete `baseMeasurements` row (e.g. a corrupted
  // `Pattern.sizeTable[size]`) used to reach the drafters as `undefined`
  // fields, which turn into NaN outline coordinates and hang
  // buildExportModel's offset/curve geometry for 95+ seconds of spinning CPU
  // instead of failing -- measured against the running app while writing a
  // TechSheetTab regression test. It must now fail fast instead. The 2s test
  // timeout is deliberate: if this regresses, the test times out loudly in a
  // couple of seconds instead of hanging CI for the full 95+.
  it("throws fast instead of hanging on an incomplete measurements row", () => {
    expect(() =>
      draftGarment(
        DEFAULT_ENGINE_ID,
        {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: { sleeve: "short", neckline: "V" },
        },
        {} as Measurements,
        t,
      ),
    ).toThrow();
  }, 2000);
});

// #139 acceptance criteria: for every sleeved combination in the drafting
// matrix, the CAP's measured arc must exceed the FULL armhole's measured
// arc by the intended (documented) ease, within 0.3 cm — both quantities
// measured from the emitted geometry (curveArcLengthCm on the actual
// outline/curvedSpans), never from the arguments that built it.
describe("sleeve cap ease is real, and measured from the drafted geometry", () => {
  const CASES: [string, Parameters<typeof draftPiecesCm>[1], number][] = [
    [
      "female short woven",
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short" },
      },
      2.5,
    ],
    [
      "female long woven",
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "long" },
      },
      2.5,
    ],
    [
      "male short woven",
      {
        type: "blouse",
        gender: "male",
        measurementOverrides: {},
        style: { sleeve: "short" },
      },
      2.5,
    ],
    [
      "female knit short (tshirt)",
      {
        type: "tshirt",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      1,
    ],
    [
      "male knit short (tshirt)",
      { type: "tshirt", gender: "male", measurementOverrides: {}, style: {} },
      1,
    ],
  ];

  for (const [name, spec, expectedEaseCm] of CASES) {
    it(`${name}: cap arc exceeds full armhole arc by ~${expectedEaseCm} cm`, () => {
      const m = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t);
      const front = pieces.find((p) => p.id === "body-front")!;
      const back = pieces.find((p) => p.id === "body-back")!;
      const sleeve = pieces.find((p) => p.id === "sleeve")!;

      // Full armhole circumference: front edge + back edge. Each piece's
      // left-armhole span is always curvedSpans[1] (neckline-left, armhole-
      // left, armhole-right, neckline-right, in that push order — see
      // body.ts's `bodice`), regardless of neckline/dart style, so this
      // doesn't hardcode point indices.
      const [fFrom, fTo] = front.curvedSpans![1];
      const frontEdge = curveArcLengthCm(
        front.outlineCm,
        front.curvedSpans ?? [],
        fFrom,
        fTo,
      );
      const [bFrom, bTo] = back.curvedSpans![1];
      const backEdge = curveArcLengthCm(
        back.outlineCm,
        back.curvedSpans ?? [],
        bFrom,
        bTo,
      );
      const fullArmholeCm = frontEdge + backEdge;
      expect(fullArmholeCm).toBeGreaterThan(30);

      const capArcCm = curveArcLengthCm(
        sleeve.outlineCm,
        sleeve.curvedSpans ?? [],
        0,
        4,
      );
      expect(Math.abs(capArcCm - fullArmholeCm - expectedEaseCm)).toBeLessThan(
        0.3,
      );
    });
  }
});

describe("draftPiecesCm", () => {
  it("returns pieces in cm (front/back/sleeve/collar) for tshirt", () => {
    const pcs = draftPiecesCm(
      DEFAULT_ENGINE_ID,
      {
        type: "tshirt",
        gender: "male",
        measurementOverrides: {},
        style: {},
      },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(pcs.map((p) => p.id)).toEqual([
      "body-front",
      "body-back",
      "sleeve",
      "collar",
    ]);
    const front = pcs[0];
    // outlineCm in real cm: front width in the tens of cm, not hundreds (px)
    const xs = front.outlineCm.map(([x]) => x);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeGreaterThan(20);
    expect(width).toBeLessThan(80);
  });
});

describe("measureSeams", () => {
  it("reports both seam lengths and agrees with seamCheck's diff", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const, armholeDeepenCm: 3 },
    };
    const { armholeLenCm, sleeveArmholeCm } = measureSeams(
      DEFAULT_ENGINE_ID,
      spec,
      SIZE_TABLE.M,
      t,
    );
    // The body's armhole is the deepened one; the cap is still sized from the base.
    expect(armholeLenCm!).toBeGreaterThan(sleeveArmholeCm!);
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const conflicts = seamCheck(graph);
    const armholeCap = conflicts.find((c) => c.key === "armhole-cap");
    expect(armholeCap).toBeDefined();
    expect(Math.abs(armholeLenCm! - sleeveArmholeCm!)).toBeCloseTo(
      armholeCap!.diffCm,
      1,
    );
  });
  it("matches what draftGarment computed for the same spec", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: { bust: 96 },
      style: { sleeve: "short" as const, armholeDeepenCm: 2 },
    };
    const drafted = draftGarment(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(measureSeams(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t)).toEqual({
      armholeLenCm: drafted.armholeLenCm,
      sleeveArmholeCm: drafted.sleeveArmholeCm,
      garmentLengthCm: drafted.garmentLengthCm,
    });
  });
  it("reports no seams for a garment without an armhole", () => {
    const { armholeLenCm, sleeveArmholeCm } = measureSeams(
      DEFAULT_ENGINE_ID,
      {
        type: "skirt",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      SIZE_TABLE.M,
      t,
    );
    expect(armholeLenCm).toBeUndefined();
    expect(sleeveArmholeCm).toBeUndefined();
  });

  // #234: one length figure per archetype -- a bodice's own length, a dress's
  // bodice-to-waist plus its skirt panel, a standalone skirt's own length,
  // and a trouser's own waist-to-hem length -- each the same formula the
  // relevant drafter resolves internally, asserted here rather than a
  // duplicated hardcoded cm figure.
  it("reports the blouse body length", () => {
    const { garmentLengthCm } = measureSeams(
      DEFAULT_ENGINE_ID,
      { type: "blouse", gender: "female", measurementOverrides: {}, style: {} },
      SIZE_TABLE.M,
      t,
    );
    expect(garmentLengthCm).toBeCloseTo(
      SIZE_TABLE.M.backLength + SIZE_TABLE.M.hipHeight + 5,
      5,
    );
  });
  // tshirt-fit-calibration: the tshirt archetype no longer reuses the blouse
  // hip-length formula -- see garment.ts's TSHIRT_HEM_DROP_CM.
  it("reports the tshirt body length using its own hem-drop constant, not the blouse hip-length formula", () => {
    const { garmentLengthCm } = measureSeams(
      DEFAULT_ENGINE_ID,
      { type: "tshirt", gender: "female", measurementOverrides: {}, style: {} },
      SIZE_TABLE.M,
      t,
    );
    expect(garmentLengthCm).toBeCloseTo(SIZE_TABLE.M.backLength + 18.5, 5);
    expect(garmentLengthCm).not.toBeCloseTo(
      SIZE_TABLE.M.backLength + SIZE_TABLE.M.hipHeight + 5,
      5,
    );
  });
  it("reports a dress's bodice-to-waist length plus its skirt panel", () => {
    const { garmentLengthCm } = measureSeams(
      DEFAULT_ENGINE_ID,
      {
        type: "dress",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      SIZE_TABLE.M,
      t,
    );
    expect(garmentLengthCm).toBeCloseTo(
      SIZE_TABLE.M.backLength + SIZE_TABLE.M.skirtLength,
      5,
    );
  });
  it("reports a standalone skirt's own length", () => {
    const { garmentLengthCm } = measureSeams(
      DEFAULT_ENGINE_ID,
      { type: "skirt", gender: "female", measurementOverrides: {}, style: {} },
      SIZE_TABLE.M,
      t,
    );
    expect(garmentLengthCm).toBeCloseTo(SIZE_TABLE.M.skirtLength, 5);
  });
  it("reports the trouser's own waist-to-hem length, style override included", () => {
    const { garmentLengthCm } = measureSeams(
      DEFAULT_ENGINE_ID,
      {
        type: "trousers",
        gender: "female",
        measurementOverrides: {},
        style: { trouserLengthCm: 95 },
      },
      SIZE_TABLE.M,
      t,
    );
    expect(garmentLengthCm).toBeCloseTo(95, 5);
  });
});

// #59: grading used to charge 6 credits for state-flag bookkeeping that
// produced no geometry -- draftGradedOverlays is the redraft the graduated
// chip now actually backs, recomputed on demand from the frozen sizeTable
// rather than persisted.
describe("draftGradedOverlays", () => {
  const spec = {
    type: "blouse" as const,
    gender: "female" as const,
    measurementOverrides: {},
    style: {},
  };

  it("returns no overlays when no size is applied", () => {
    const { pieces } = draftGarment(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(
      draftGradedOverlays(
        DEFAULT_ENGINE_ID,
        spec,
        pieces,
        SIZE_TABLE.M,
        SIZE_TABLE,
        [],
        t,
      ),
    ).toEqual([]);
  });

  it("returns one overlay per piece per applied size, keyed to the base piece's own id", () => {
    const { pieces } = draftGarment(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const overlays = draftGradedOverlays(
      DEFAULT_ENGINE_ID,
      spec,
      pieces,
      SIZE_TABLE.M,
      SIZE_TABLE,
      ["G"],
      t,
    );
    expect(overlays).toHaveLength(pieces.length);
    expect(overlays.map((o) => o.pieceId).sort()).toEqual(
      pieces.map((p) => p.id).sort(),
    );
    expect(overlays.every((o) => o.size === "G")).toBe(true);
  });

  it("produces a distinct outline from the base piece (G is a real size larger than M)", () => {
    const { pieces } = draftGarment(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const [overlay] = draftGradedOverlays(
      DEFAULT_ENGINE_ID,
      spec,
      pieces,
      SIZE_TABLE.M,
      SIZE_TABLE,
      ["G"],
      t,
    );
    const base = pieces.find((p) => p.id === overlay.pieceId)!;
    expect(overlay.outline).not.toEqual(base.outline);
  });

  it("aligns onto the base piece's own placed position exactly: grading 'M' against itself reproduces the identical outline", () => {
    // A fresh autoLayout of a same-measurements redraft would coincidentally
    // match too, so this alone wouldn't prove alignment -- it's the
    // "distinct from base" test above, together with this one, that pins the
    // transform down: same measurements -> byte-identical outline (the
    // computed dx/dy exactly recovers what autoLayout originally placed this
    // piece at); different measurements (G, above) -> a different outline.
    const { pieces } = draftGarment(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const front = pieces.find((p) => p.id === "body-front")!;
    const overlays = draftGradedOverlays(
      DEFAULT_ENGINE_ID,
      spec,
      pieces,
      SIZE_TABLE.M,
      SIZE_TABLE,
      ["M"],
      t,
    );
    const overlay = overlays.find((o) => o.pieceId === "body-front")!;
    expect(overlay.outline).toEqual(front.outline);
  });

  it("silently skips a size missing from the sizeTable rather than throwing", () => {
    const { pieces } = draftGarment(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(
      draftGradedOverlays(
        DEFAULT_ENGINE_ID,
        spec,
        pieces,
        SIZE_TABLE.M,
        SIZE_TABLE,
        ["not-a-real-size"],
        t,
      ),
    ).toEqual([]);
  });
});

describe("validateQuestions", () => {
  it("keeps a valid question and derives a stable id", () => {
    const qs = validateQuestions([
      { label: "Neckline", options: ["round", "V", "boat"], allowOther: true },
    ]);
    expect(qs).toHaveLength(1);
    expect(qs[0].id).toBe("q0");
    expect(qs[0].label).toBe("Neckline");
    expect(qs[0].options).toEqual(["round", "V", "boat"]);
    expect(qs[0].allowOther).toBe(true);
  });
  it("limits to 4 questions", () => {
    const raw = Array.from({ length: 7 }, (_, i) => ({
      label: `P${i}`,
      options: ["a", "b"],
    }));
    expect(validateQuestions(raw)).toHaveLength(4);
  });
  it("discards a question with fewer than 2 options or an empty label", () => {
    const qs = validateQuestions([
      { label: "", options: ["a", "b"] },
      { label: "Ok", options: ["only one"] },
      { label: "Good", options: ["a", "b"] },
    ]);
    expect(qs.map((q) => q.label)).toEqual(["Good"]);
  });
  it("truncates to 6 options and strips empty/duplicate strings", () => {
    const qs = validateQuestions([
      {
        label: "Many",
        options: ["a", "a", "", "b", "c", "d", "e", "f", "g"],
      },
    ]);
    expect(qs[0].options).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
  it("degrades to an empty list when nothing is usable", () => {
    expect(validateQuestions("junk")).toEqual([]);
    expect(validateQuestions([{ label: "x", options: [] }])).toEqual([]);
  });
  it("allowOther defaults to false when missing/invalid", () => {
    const qs = validateQuestions([{ label: "P", options: ["a", "b"] }]);
    expect(qs[0].allowOther).toBe(false);
  });
});

// Every drafter decoration (grainline, dart) is a line drawn *inside* the
// piece, and it reaches all five export formats — so containment is a
// geometry invariant, not a rendering detail. The bounding box is a superset
// of the piece: anywhere the outline is concave (the neckline scoop) an
// offset measured from the bbox top lands outside the piece.
function verticalSpanAt(pts: [number, number][], x: number) {
  let top = Infinity,
    bottom = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    if (a[0] === b[0]) continue;
    if (x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
    const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { top, bottom };
}

// #2: the vertex polygon UNDERCUTS the real boundary wherever an edge range
// is curved -- a Catmull-Rom cap bulges above the chord between its own two
// vertices. Every other decoration kind is interior by construction, so the
// cheap vertex-polygon span is fine for it; a notch, by contrast, is placed
// ON the boundary and its tip sits one notch-depth inside, which puts it
// squarely inside that chord-vs-curve gap. Measured: a sleeve-cap notch tip
// reads 0.26cm "outside" a chord it is really inside. So notch tips are
// checked against a densified outline sampled off the same Catmull-Rom
// geometry the drafter placed them on.
function densifiedOutline(
  ptsCm: [number, number][],
  curvedSpans?: [number, number][],
): [number, number][] {
  const { start, segs } = catmullRomSegments(ptsCm, curvedSpans ?? []);
  const out: [number, number][] = [start];
  let cur = start;
  const STEPS = 24;
  for (const seg of segs) {
    if (seg.kind === "line") {
      out.push(seg.to);
      cur = seg.to;
      continue;
    }
    for (let i = 1; i <= STEPS; i++) {
      const u = i / STEPS;
      const v = 1 - u;
      out.push([
        v * v * v * cur[0] +
          3 * v * v * u * seg.c1[0] +
          3 * v * u * u * seg.c2[0] +
          u * u * u * seg.to[0],
        v * v * v * cur[1] +
          3 * v * v * u * seg.c1[1] +
          3 * v * u * u * seg.c2[1] +
          u * u * u * seg.to[1],
      ]);
    }
    cur = seg.to;
  }
  return out;
}

function assertDecorationsContained(pieces: ReturnType<typeof draftPiecesCm>) {
  expect(pieces.length).toBeGreaterThan(0);
  for (const piece of pieces) {
    const points: [number, number][] = [...(piece.grainlineCm ?? [])];
    // #127: every internal-geometry kind's own point(s) -- dart legs,
    // fold-line endpoints, drill-hole centres. Dart legs are the one
    // exception the acceptance criterion carves out: a single-ended dart's
    // wide end sits exactly ON the seam it opens onto, not strictly inside
    // -- the boundary-inclusive check below (>=/<=) already accommodates
    // that, the same way it always has for dartsCm.
    for (const entry of piece.internalsCm ?? []) {
      switch (entry.kind) {
        case "dart":
        case "pleat":
        case "styleLine":
          points.push(...entry.ptsCm);
          break;
        case "foldLine":
          points.push(entry.aCm, entry.bCm);
          break;
        case "drillHole":
        case "placementMark":
          points.push(entry.atCm);
          break;
      }
    }
    // #2: a notch's inward tip is decoration placed off the boundary just
    // like a grainline or a drill hole, and it was the one kind this sweep
    // never checked -- notchAt() picks its inward normal by biasing toward a
    // caller-supplied interior point, so a wrong reference point on a scooped
    // or tapered edge sends the tip straight out of the piece. The outer
    // point is asserted to sit ON the boundary elsewhere; here we only need
    // the tip, and the check below is boundary-inclusive anyway.
    if (piece.notches?.length) {
      const dense = densifiedOutline(piece.outlineCm, piece.curvedSpans);
      for (const notch of piece.notches) {
        const [nx, ny] = notch.innerCm;
        const span = verticalSpanAt(dense, nx);
        expect(
          ny,
          `${piece.id} notch tip (${nx.toFixed(1)}, ${ny.toFixed(1)}) vs outline y-range [${span.top.toFixed(1)}, ${span.bottom.toFixed(1)}]`,
        ).toBeGreaterThanOrEqual(span.top);
        expect(ny).toBeLessThanOrEqual(span.bottom);
      }
    }

    for (const [x, y] of points) {
      const span = verticalSpanAt(piece.outlineCm, x);
      expect(
        y,
        `${piece.id} point (${x.toFixed(1)}, ${y.toFixed(1)}) vs outline y-range [${span.top.toFixed(1)}, ${span.bottom.toFixed(1)}]`,
      ).toBeGreaterThanOrEqual(span.top);
      expect(y).toBeLessThanOrEqual(span.bottom);
    }
  }
}

describe("drafted decorations stay inside their own piece", () => {
  for (const [name, spec] of DECORATION_CASES) {
    it(`${name}: grainline and dart never leave the outline`, () => {
      const m = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      assertDecorationsContained(draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t));
    });
  }
});

// #132 acceptance criterion: "a chart with none of the new keys drafts
// byte-identical geometry to today". For each DECORATION_CASES case, drafts
// twice from the SAME core measurements: once with the six EXTENDED keys
// entirely absent (a chart written before this issue, or one that simply
// never sets them -- the real-world case this guards), and once with them
// explicitly set to literally today's hardcoded proportion, reconstructed
// here from the same expressions body.ts/sleeve.ts fall back to -- not from
// lib/sizeCharts/seed.ts's derivation, so this test doesn't just check that
// module against itself. If the fallback branch in body.ts/sleeve.ts ever
// stops being a no-op (a wrong divisor, an accidentally-always-taken
// branch), the two drafts diverge and this fails.
// Reconstructing neckGirth as (bust*6)/14 so that neckGirth/6 "equals"
// bust/14 is true mathematically but not bit-for-bit in IEEE 754 (division
// and multiplication by the same constant don't always invert exactly) --
// verified empirically: (92*6/14)/6 !== 92/14, off by ~1e-15. That's noise
// four orders of magnitude below anything a cm-precision pattern cares
// about, so the comparison below rounds every number in both drafts to 1e-9
// cm before comparing structurally, rather than asserting bit-exactness
// floating point arithmetic doesn't actually offer here.
function roundNumbersDeep<T>(value: T): T {
  if (typeof value === "number") {
    return (Number.isFinite(value)
      ? Math.round(value * 1e9) / 1e9
      : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => roundNumbersDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = roundNumbersDeep(v);
    }
    return out as T;
  }
  return value;
}

// backWidth is deliberately excluded from withFormula below: unlike the
// other four (pure bust/gender proportions, independent of style), its
// fallback -- the armhole curve's shoulder/underarm interpolation in
// body.ts -- depends on the style-driven wearingEase, so no single fixed
// Measurements.backWidth value reproduces it across every DECORATION_CASES
// style. body.test.ts's own "omitting backWidth reproduces the
// shoulder/underarm interpolation exactly" test covers that field's
// absent-vs-present-with-the-fallback's-own-value equivalence directly, for
// one fixed style/ease. Omitting it from both `withoutExtended` and
// `withFormula` here still exercises the true "chart has none of the new
// keys" case this suite exists to prove -- backWidth is absent in both.
// #269: neckGirth/bicep were promoted to CORE, so SIZE_TABLE/SIZE_TABLE_MALE
// now carry real (rounded-to-1-decimal) values for both -- there is no more
// "chart omits this key" case to construct for them, and re-deriving the
// SAME formula unrounded (as this test used to) no longer reproduces the
// table's own rounded value bit-for-bit, so both are excluded from
// `withFormula` below the same way backWidth already was, for the same
// reason: `base` already provides the real, current value directly.
// highBust/shoulderSlope remain genuinely EXTENDED (optional, with a live
// fallback in body.ts), so they're still meaningfully "omitted vs supplied"
// here.
describe("#132: drafting with no extended measurement keys is byte-identical to reconstructing today's formula explicitly", () => {
  for (const [name, spec] of DECORATION_CASES) {
    it(name, () => {
      const male = spec.gender === "male";
      const base = male ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const withoutExtended: Measurements = { ...base };

      const withFormula: Measurements = {
        ...base,
        highBust: base.bust,
        shoulderSlope: male ? 4.5 : 4.0,
      };

      const a = draftPiecesCm(DEFAULT_ENGINE_ID, spec, withoutExtended, t);
      const b = draftPiecesCm(DEFAULT_ENGINE_ID, spec, withFormula, t);
      expect(roundNumbersDeep(b)).toEqual(roundNumbersDeep(a));
    });
  }
});

// #132 (post-review): every prior test above the "reconstruct today's
// formula" one exercises the ABSENT branch. Nothing exercised a chart that
// actually SETS a plausible, non-neutral value for every extended
// key at once -- exactly the path a real user takes (the DangerZone this
// issue exists to close), and the one that caught the backWidth defect
// (a real ~37cm across-back value drove a real ~10cm-narrower garment,
// because the field was wired to the wrong height in the drafter). Two
// personas at opposite ends of MEASUREMENT_RANGES, both plausible bodies a
// real chart could describe (all values loosely proportioned around a
// smaller/larger frame, not an inconsistent mix of extremes) -- verified
// against the SAME full-drafting invariant (assertDecorationsContained)
// the fallback path already has to satisfy, plus explicit positive-width
// and finite-coordinate checks a self-intersecting or collapsed piece
// would fail.
const PERSONAS: [string, Partial<Measurements>][] = [
  [
    "petite frame",
    {
      neckGirth: 33,
      highBust: 78,
      shoulderSlope: 3.3,
      backWidth: 31,
      bicep: 22,
    },
  ],
  [
    "fuller frame",
    {
      neckGirth: 45,
      highBust: 118,
      shoulderSlope: 6.5,
      backWidth: 44,
      bicep: 42,
    },
  ],
];

function assertPositiveGeometry(pieces: ReturnType<typeof draftPiecesCm>) {
  expect(pieces.length).toBeGreaterThan(0);
  for (const piece of pieces) {
    expect(bbox(piece.outlineCm).w).toBeGreaterThan(0);
    expect(bbox(piece.outlineCm).h).toBeGreaterThan(0);
    for (const [x, y] of piece.outlineCm) {
      expect(Number.isFinite(x), `${piece.id} x`).toBe(true);
      expect(Number.isFinite(y), `${piece.id} y`).toBe(true);
    }
  }
}

describe("#132: a chart carrying a plausible value for every extended key drafts sane, contained geometry", () => {
  for (const [personaName, persona] of PERSONAS) {
    for (const [name, spec] of DECORATION_CASES) {
      it(`${personaName} / ${name}`, () => {
        const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
        const m: Measurements = { ...base, ...persona };
        const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t);
        assertPositiveGeometry(pieces);
        assertDecorationsContained(pieces);
      });
    }
  }

  // The specific regression this review round exists to close: a realistic
  // across-back value must not collapse the back panel narrower than the
  // front's own bust-derived armhole-level width, and a fuller across-back
  // value must genuinely widen the back's armhole curve relative to a
  // petite one -- proven through the full draftGarment path (garment.ts),
  // not just draftBody in isolation.
  it("a fuller-frame backWidth drafts a wider back armhole curve than a petite one, both plausible", () => {
    // The armhole control point (index 4, see bodice()'s push() order) is
    // what backWidth actually moves -- the overall piece bbox is dominated
    // by the hip-derived hem in both personas (hemHalf unaffected by
    // backWidth), so it wouldn't show this difference at all.
    const spec = DECORATION_CASES[0][1];
    const petite = draftPiecesCm(
      DEFAULT_ENGINE_ID,
      spec,
      { ...SIZE_TABLE.M, ...PERSONAS[0][1] },
      t,
    );
    const fuller = draftPiecesCm(
      DEFAULT_ENGINE_ID,
      spec,
      { ...SIZE_TABLE.M, ...PERSONAS[1][1] },
      t,
    );
    const back = (pieces: typeof petite) =>
      pieces.find((p) => p.id === "body-back")!;
    const armCtrlOffset = (piece: ReturnType<typeof back>) =>
      Math.abs(piece.outlineCm[4][0] - piece.outlineCm[0][0]);
    expect(armCtrlOffset(back(fuller))).toBeGreaterThan(
      armCtrlOffset(back(petite)),
    );
  });
});

// #82: reported against a since-superseded version of the waist dart, which
// was a single wedge centred exactly at cx -- at that x, a deep V-neck plus a
// short back could push the piece's own top edge (neckDrop) below the dart's
// fixed 12 cm apex, floating it above the neckline. #122 (closed after #82
// was filed) split that into two darts offset toward the side seam
// (dartOffset = waistHalf * 0.5), which is provably always greater than
// neckHalf given the drafting formulas here -- so the dart's x can no longer
// land inside the neckline curve's own span at all, and the escape #82
// reported is not reachable through today's code. Verified empirically: this
// matrix (every DECORATION_CASES case, at the MEASUREMENT_RANGES corners for
// bust/backLength/shoulder, plus the exact reported repro) all pass against
// body.ts as it stood before this issue was picked up, with no code change
// needed. Kept anyway as a permanent regression guard, since the previous
// sweep's real gap -- one fixed measurement row (SIZE_TABLE.M) that never
// combined a deep neckline with a short back -- is still worth closing.
const MEASUREMENT_CORNERS: [string, Partial<Measurements>][] = [
  [
    "min",
    {
      bust: MEASUREMENT_RANGES.bust.min,
      backLength: MEASUREMENT_RANGES.backLength.min,
      shoulder: MEASUREMENT_RANGES.shoulder.min,
    },
  ],
  [
    "max",
    {
      bust: MEASUREMENT_RANGES.bust.max,
      backLength: MEASUREMENT_RANGES.backLength.max,
      shoulder: MEASUREMENT_RANGES.shoulder.max,
    },
  ],
];

describe("drafted decorations stay inside their own piece, at the measurement range corners", () => {
  for (const [name, spec] of DECORATION_CASES) {
    for (const [cornerName, corner] of MEASUREMENT_CORNERS) {
      it(`${name} @ ${cornerName}: grainline and dart never leave the outline`, () => {
        const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
        const m = { ...base, ...corner };
        assertDecorationsContained(
          draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t),
        );
      });
    }
  }

  // The exact repro from #82.
  it("deep V-neck on a short back with a large bust: dart apex stays below the neckline", () => {
    const m: Measurements = {
      ...SIZE_TABLE.M,
      bust: MEASUREMENT_RANGES.bust.max,
      backLength: MEASUREMENT_RANGES.backLength.min,
    };
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {
        neckline: "V" as const,
        necklineDepthCm: STYLE_LIMITS.necklineDepthCm.max,
        darts: true,
      },
    };
    assertDecorationsContained(draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t));
  });
});

// #79: a dress bodice used to push extra fitted-waist vertices at
// waistY === len (the hem), exactly retracing the hem edge it had just
// drawn -- e.g. (cx-22,41) -> (cx-27,41) -> (cx+27,41) -> (cx+22,41), a
// non-simple boundary the decoration-containment suite above cannot see
// (an on-the-boundary point still satisfies y <= span.bottom).
function hasRetracedEdge(pts: [number, number][]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const [cx, cy] = pts[(i + 2) % n];
    if (ay !== by || by !== cy) continue;
    const [ax] = pts[i];
    const dir1 = Math.sign(bx - ax);
    const dir2 = Math.sign(cx - bx);
    if (dir1 !== 0 && dir2 !== 0 && dir1 !== dir2) return true;
  }
  return false;
}

// #126 AC 6: marking the fold is additive metadata, not a geometry change --
// every foldEdge endpoint is either a pre-existing curve joint (cf, and the
// radial skirt's own arc-centre sample), which #126 never touched, or a
// newly-inserted straight-edge vertex, which must land exactly collinear
// with its immediate polygon neighbours so the rendered outline is
// byte-for-byte the same shape it was before the vertex existed.
function foldEndpointChangesNothing(
  pts: [number, number][],
  spans: [number, number][],
  i: number,
): boolean {
  const n = pts.length;
  const onCurve = spans.some(
    ([a, b]) => (i - 1 >= a && i <= b) || (i >= a && i + 1 <= b),
  );
  if (onCurve) return true;
  const [px, py] = pts[(i - 1 + n) % n];
  const [cx, cy] = pts[i];
  const [nx, ny] = pts[(i + 1) % n];
  const cross = (cx - px) * (ny - py) - (cy - py) * (nx - px);
  return Math.abs(cross) < 1e-6;
}

// #124 acceptance criteria: "for every sleeved garment in the matrix, each
// sleeve notch has exactly one body counterpart and the walked distances
// match within 0.2 cm". Scoped to the two PITCH notches specifically -- the
// sleeve's third notch (the cap apex) marks where the shoulder seam meets
// the cap, and has no single body-side counterpart to pair with (the
// shoulder point exists on both the front AND back panels), so it's
// excluded here rather than forced into a pairing that doesn't reflect the
// real construction.
describe("#124: sleeve pitch notches match the body's, generated from the same computation", () => {
  const dist = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);

  for (const [name, spec] of DECORATION_CASES) {
    if (!spec.style.sleeve || spec.style.sleeve === "none") continue;
    it(`${name}: sleeve's single/double pitch notches land the same distance from the underarm as front's/back's own`, () => {
      const m = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t);
      const sleeve = pieces.find((p) => p.id === "sleeve")!;
      const front = pieces.find((p) => p.id === "body-front")!;
      const back = pieces.find((p) => p.id === "body-back")!;

      const [slSingle, slDouble] = sleeve.notches!;
      expect(slSingle.type).toBe("single");
      expect(slDouble.type).toBe("double");
      const sleeveSingleDistCm = dist(sleeve.outlineCm[0], slSingle.outerCm);
      const sleeveDoubleDistCm = dist(sleeve.outlineCm[4], slDouble.outerCm);

      // front's/back's own pitch notch is the first entry -- see body.ts's
      // notch-emission order (pitchLeft, pitchRight, hemFold, ...).
      const [frontPitchL] = front.notches!;
      const [backPitchL] = back.notches!;
      expect(frontPitchL.type).toBe("single");
      expect(backPitchL.type).toBe("double");
      const frontUaL = front.outlineCm[front.curvedSpans![1][1]];
      const backUaL = back.outlineCm[back.curvedSpans![1][1]];
      const frontDistCm = dist(frontUaL, frontPitchL.outerCm);
      const backDistCm = dist(backUaL, backPitchL.outerCm);

      expect(Math.abs(sleeveSingleDistCm - frontDistCm)).toBeLessThan(0.2);
      expect(Math.abs(sleeveDoubleDistCm - backDistCm)).toBeLessThan(0.2);
    });
  }

  it("still matches when armholeDeepenCm creates a seam conflict (unrefit) -- the sleeve's cap and pitch notches both stay keyed to the BASE armhole", () => {
    const spec: Parameters<typeof draftPiecesCm>[1] = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", armholeDeepenCm: 3 },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const sleeve = pieces.find((p) => p.id === "sleeve")!;
    // The sleeve's own pitch-notch distance only ever needs to be internally
    // consistent with whichever armhole its cap was actually sized against
    // (the base one here, since it's unrefit) -- covered by the general
    // matrix test's construction already; this case only asserts the
    // notches still exist and keep their front/back types under a conflict.
    const types = sleeve.notches!.map((n) => n.type);
    expect(types).toEqual(["single", "double", "single"]);
  });

  it("matches again once sleeveRefit remakes the cap for the adjusted armhole", () => {
    const spec: Parameters<typeof draftPiecesCm>[1] = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", armholeDeepenCm: 3, sleeveRefit: true },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const sleeve = pieces.find((p) => p.id === "sleeve")!;
    const front = pieces.find((p) => p.id === "body-front")!;
    const [slSingle] = sleeve.notches!;
    const [frontPitchL] = front.notches!;
    const sleeveSingleDistCm = dist(sleeve.outlineCm[0], slSingle.outerCm);
    const frontUaL = front.outlineCm[front.curvedSpans![1][1]];
    const frontDistCm = dist(frontUaL, frontPitchL.outerCm);
    expect(Math.abs(sleeveSingleDistCm - frontDistCm)).toBeLessThan(0.2);
  });
});

describe("fold edge is additive metadata, not a geometry change (#126)", () => {
  for (const [name, spec] of DECORATION_CASES) {
    it(`${name}: every piece's foldEdge endpoints change no rendered coordinate`, () => {
      const m = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t);
      const withFold = pieces.filter((p) => p.foldEdge);
      // #128: trousers legitimately drafts NO on-fold piece -- a straight
      // trouser leg panel is not symmetric about any centre line the way a
      // bodice/skirt panel is (its own inseam and outseam are different
      // edges, not mirror halves), so front/back/waistband declare no
      // foldEdge at all. The "at least one case in the whole matrix
      // exercises a fold edge" coverage check moved to its own assertion
      // below rather than being required of every single case.
      for (const piece of withFold) {
        const pts = piece.outlineCm as [number, number][];
        const spans = piece.curvedSpans ?? [];
        for (const idx of piece.foldEdge!) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(pts.length);
          expect(
            foldEndpointChangesNothing(pts, spans, idx),
            `${piece.id} foldEdge index ${idx} is neither a curve joint nor collinear with its neighbours`,
          ).toBe(true);
        }
      }
    });
  }

  it("at least one DECORATION_CASES entry drafts an on-fold piece", () => {
    const anyFold = DECORATION_CASES.some(([, spec]) => {
      const m = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      return draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t).some(
        (p) => p.foldEdge,
      );
    });
    expect(anyFold).toBe(true);
  });
});

describe("drafted outlines have no retraced edge (#79)", () => {
  for (const [name, spec] of DECORATION_CASES) {
    it(`${name}: no three consecutive same-y vertices reverse direction`, () => {
      const m = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      for (const piece of draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t)) {
        expect(
          hasRetracedEdge(piece.outlineCm as [number, number][]),
          `${piece.id} outline retraces an edge`,
        ).toBe(false);
      }
    });
  }

  it("a dress bodice's hem width equals the skirt panel's own waist width", () => {
    const spec: Parameters<typeof draftPiecesCm>[1] = {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", darts: true, skirt: "straight" },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const front = pieces.find((p) => p.id === "body-front")!;
    const skirt = pieces.find((p) => p.id === "skirt")!;

    const frontMaxY = Math.max(...front.outlineCm.map(([, y]) => y));
    const hemXs = front.outlineCm
      .filter(([, y]) => y === frontMaxY)
      .map(([x]) => x);
    const bodiceHemWidth = Math.max(...hemXs) - Math.min(...hemXs);

    const skirtMinY = Math.min(...skirt.outlineCm.map(([, y]) => y));
    const waistXs = skirt.outlineCm
      .filter(([, y]) => y === skirtMinY)
      .map(([x]) => x);
    const skirtWaistWidth = Math.max(...waistXs) - Math.min(...waistXs);

    expect(bodiceHemWidth).toBeCloseTo(skirtWaistWidth, 5);
    // Exactly three hem-level vertices -- left hem, #126's fold-centre, and
    // right hem (not the old four-with-a-duplicate-fitted-waist-pair bug
    // this test guards, and not more than the one legitimate fold vertex
    // #126 added).
    expect(hemXs).toHaveLength(3);
  });
});

// #134: the generalised seam graph. `measureSeamGraph` walks every mated
// pair a garment declares (lib/draft/seams.ts's walkSeamPairs); `seamCheck`
// narrows that down to the pairs that actually diverge beyond
// SEAM_TOLERANCE_CM. These tests are the AC's own "zero divergences once the
// drafters are correct, and perturbing one drafter produces exactly the
// expected divergence" -- and the sweep across SIZE_TABLE's every size is
// the "runs per graded size" AC, since a graded size is exactly a different
// Measurements row through the same spec/graph-building code.
describe("seam graph (#134)", () => {
  it("reports zero divergences for every DECORATION_CASES entry", () => {
    for (const [name, spec] of DECORATION_CASES) {
      const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, base, t);
      const conflicts = seamCheck(graph);
      expect(conflicts, `${name}: ${JSON.stringify(conflicts)}`).toEqual([]);
    }
  });

  it("reports zero divergences at the measurement-range corners too", () => {
    for (const [name, spec] of DECORATION_CASES) {
      for (const [cornerName, corner] of MEASUREMENT_CORNERS) {
        const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
        const m = { ...base, ...corner };
        const conflicts = seamCheck(
          measureSeamGraph(DEFAULT_ENGINE_ID, spec, m, t),
        );
        expect(
          conflicts,
          `${name} @ ${cornerName}: ${JSON.stringify(conflicts)}`,
        ).toEqual([]);
      }
    }
  });

  // "The check runs per graded size once grading drafts real geometry":
  // grading redrafts the full piece set at each applied size's own row from
  // the SAME sizeTable/spec (lib/draft/garment.ts's draftGradedOverlays) --
  // so walking every SIZE_TABLE row through the graph, for a representative
  // sample of DECORATION_CASES, is the seam-graph half of that same
  // per-size redraft. A correctly-drafted garment stays conflict-free at
  // every size, not only the base.
  it("reports zero divergences at every graded size (PP..GG), not only the base", () => {
    const sizes = Object.keys(SIZE_TABLE);
    expect(sizes.length).toBeGreaterThan(1);
    for (const [name, spec] of DECORATION_CASES) {
      const table = spec.gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE;
      for (const size of sizes) {
        const conflicts = seamCheck(
          measureSeamGraph(DEFAULT_ENGINE_ID, spec, table[size], t),
        );
        expect(
          conflicts,
          `${name} @ ${size}: ${JSON.stringify(conflicts)}`,
        ).toEqual([]);
      }
    }
  });

  it("perturbing armholeDeepenCm without a refit produces EXACTLY the expected armhole-cap divergence, nothing else", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const, armholeDeepenCm: 3 },
    };
    const conflicts = seamCheck(
      measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].key).toBe("armhole-cap");
    expect(conflicts[0].fixable).toBe(true);
    expect(conflicts[0].diffCm).toBeGreaterThan(1);
  });

  it("sleeveRefit closes the armhole-cap divergence the perturbation above created", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {
        sleeve: "short" as const,
        armholeDeepenCm: 3,
        sleeveRefit: true,
      },
    };
    const conflicts = seamCheck(
      measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t),
    );
    expect(conflicts).toEqual([]);
  });

  // #177 (owner decision, superseding the #134 finding this test used to
  // document, refined by a follow-up review -- see #185, closed by folding
  // its fix into #177's own PR): the dress bodice hem no longer reads
  // skirtWaistHalfCm(hip) -- it reads dressWaistHalfCm(waist), a SINGLE
  // silhouette-independent function (lib/draft/skirt.ts) both the bodice
  // hem and every skirt silhouette's own dress-mode waist sizing meet
  // exactly, so the two sides of the waist join are equal by construction
  // for all five silhouettes, not only straight/a-line. Flipped from
  // "reports a REAL divergence" to "reports zero", per #177's own
  // acceptance criteria -- and strengthened past a bare zero-diff check:
  // the review that produced #185 pointed out that "zero divergence" is
  // satisfiable by a WRONG value too (half-circle's first cut matched a
  // 74cm-wide bodice hem against a 74cm skirt edge and still reported
  // zero), so this test also pins the actual measured aLen/bLen to the one
  // shared value every silhouette must agree on at SIZE_TABLE.M (waist 74,
  // so waistCm/4 = 18.5 half-width = 37 full width), not just their
  // difference.
  it("#177/#185: every dress silhouette's waist-join reports zero divergence AND the same bodice-hem value (waistCm/4 half-width)", () => {
    const expectedWidthCm = SIZE_TABLE.M.waist / 2; // 2 * dressWaistHalfCm(waist)
    for (const skirt of [
      "straight",
      "a-line",
      "circle",
      "gore",
      "half-circle",
    ] as const) {
      const spec = {
        type: "dress" as const,
        gender: "female" as const,
        measurementOverrides: {},
        style: { sleeve: "none" as const, darts: true, skirt },
      };
      const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
      const joins = graph.filter((m) => m.key.startsWith("waist-join"));
      expect(joins, skirt).toHaveLength(2);
      for (const j of joins) {
        expect(j.diffCm, `${skirt} ${j.key}`).toBe(0);
        expect(j.aLenCm, `${skirt} ${j.key} aLen`).toBeCloseTo(
          expectedWidthCm,
          1,
        );
        expect(j.bLenCm, `${skirt} ${j.key} bLen`).toBeCloseTo(
          expectedWidthCm,
          1,
        );
      }
      expect(
        seamCheck(graph).filter((c) => c.key.startsWith("waist-join")),
        skirt,
      ).toEqual([]);
    }
  });

  // #185's own finding, as a direct regression guard: half-circle's skirt
  // is a SINGLE undivided panel whose one waist arc equals the FULL waist
  // measurement -- front and back must each match HALF of that one arc, not
  // the whole thing each (which is what #177's first cut did, and what made
  // #185 necessary). This asserts the physical invariant #185 was filed
  // over: front + back together equal the panel's own one waist arc.
  it("#185: a half-circle dress's front and back waist-join TOGETHER equal the skirt's one undivided waist arc, not each individually", () => {
    const spec = {
      type: "dress" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {
        sleeve: "none" as const,
        darts: true,
        skirt: "half-circle" as const,
      },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const front = graph.find((m) => m.key === "waist-join-front")!;
    const back = graph.find((m) => m.key === "waist-join-back")!;
    expect(front.bLenCm + back.bLenCm).toBeCloseTo(SIZE_TABLE.M.waist, 1);
  });

  it("the full graph includes the equal-by-construction pairs too, not only the divergent ones", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const keys = graph.map((m) => m.key).sort();
    expect(keys).toEqual(
      ["armhole-cap", "shoulder", "side", "sleeve-underarm"].sort(),
    );
    // Every one of them measures near-zero (well under the 1cm tolerance) --
    // "equal by construction" as a live assertion, not just a comment.
    for (const m of graph) {
      expect(m.diffCm, `${m.key}: ${m.diffCm}`).toBeLessThan(1);
    }
  });

  // #129/#130/#131 (Wave 2/W4) acceptance criterion, verbatim: "derived from
  // the measured [edge], with a test asserting the match within 0.3 cm."
  // seamCheck's own 1cm SEAM_TOLERANCE_CM is a looser bound meant to catch a
  // genuine fit defect; these three assert the tighter number the issues
  // actually ask for, against the real seam graph (not a hand re-derivation
  // of each drafter's own arithmetic).
  it("#129: the collar's neckline seam matches the front+back neckline arc within 0.3cm", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {
        neckline: "round" as const,
        sleeve: "none" as const,
        collar: "convertible" as const,
      },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "collar-neckline");
    expect(pair).toBeDefined();
    expect(pair!.fixable).toBe(false);
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  // #221: same acceptance shape as #129's convertible test above, for the
  // new "band" (stand/mandarin) collar type -- its own seam pair carries a
  // non-zero easeCm (the front-edge closure extension), so a genuine match
  // depends on walkSeamPairs' "gap minus intended ease" comparison, not
  // just on the two raw lengths happening to agree.
  it("#221: the band collar's neckline seam matches the (lowered) front+back neckline arc plus its own front extension, within 0.3cm", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {
        neckline: "round" as const,
        sleeve: "none" as const,
        collar: "band" as const,
      },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "collar-neckline");
    expect(pair).toBeDefined();
    expect(pair!.fixable).toBe(false);
    expect(pair!.easeCm).toBeGreaterThan(0);
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  // #221 AC: the neckline the band collar seats against must be genuinely
  // lowered BEFORE it's measured, not just accepted at its pre-existing
  // size -- a band spec's own neckline arc (the seam pair's `a` side) has to
  // come out larger than the identical spec drafted with "convertible"
  // (which doesn't touch the neckline at all).
  it("#221: choosing collar: band genuinely enlarges the neckline arc the collar mates against, vs. convertible", () => {
    const base = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { neckline: "round" as const, sleeve: "none" as const },
    };
    const convertibleArc = measureSeamGraph(
      DEFAULT_ENGINE_ID,
      { ...base, style: { ...base.style, collar: "convertible" as const } },
      SIZE_TABLE.M,
      t,
    ).find((m) => m.key === "collar-neckline")!.aLenCm;
    const bandArc = measureSeamGraph(
      DEFAULT_ENGINE_ID,
      { ...base, style: { ...base.style, collar: "band" as const } },
      SIZE_TABLE.M,
      t,
    ).find((m) => m.key === "collar-neckline")!.aLenCm;
    expect(bandArc).toBeGreaterThan(convertibleArc);
  });

  // #221 AC: "straight-up stand, no fall" -- unlike the convertible shape
  // (two curved outer-edge spans, see draftCollar), the band collar's own
  // outline is a plain rectangle with no curvature at all.
  it("#221: the band collar drafts a plain rectangular stand, with no curved spans (no fall)", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { neckline: "round" as const, collar: "band" as const },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const collar = pieces.find((p) => p.id === "collar")!;
    expect(collar).toBeDefined();
    expect(collar.curvedSpans ?? []).toHaveLength(0);
    expect(collar.outlineCm).toHaveLength(6); // straightBand()'s own rectangle
  });

  // tshirt-fit-calibration: BAND_COLLAR_HEIGHT_CM corrected from 4 to 5cm --
  // no test guarded this constant before now.
  it("the band collar's stand height is exactly 5cm", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { neckline: "round" as const, collar: "band" as const },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const collar = pieces.find((p) => p.id === "collar")!;
    const ys = collar.outlineCm.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(5, 5);
  });

  // #222 AC: the classic two-piece shirt collar -- a stand mated to the
  // body's neckline (same construction as "band") PLUS a separate fall
  // mated to the stand's own upper seam, instead of the single-piece
  // convertible/band shape.
  it("#222 AC: drafts TWO mated pieces (stand + fall), not the single-piece convertible/band shape", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { neckline: "round" as const, collar: "shirt" as const },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const ids = pieces.map((p) => p.id);
    expect(ids).toContain("collar-stand");
    expect(ids).toContain("collar-fall");
    expect(ids).not.toContain("collar");
  });

  it("#222: the shirt collar's stand-neckline seam matches the (lowered) front+back neckline arc plus the button-stand width, within 0.3cm", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { neckline: "round" as const, collar: "shirt" as const },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "collar-neckline");
    expect(pair).toBeDefined();
    expect(pair!.fixable).toBe(false);
    expect(pair!.easeCm).toBe(BUTTON_STAND_WIDTH_CM);
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  // #222 AC: the stand's own upper seam (where the fall sews on) is joined
  // to the fall's own neckline seam via its own declared seam-graph pair,
  // like every other sub-piece pairing in this file -- and the fall's seam
  // length is measured off the stand's ACTUALLY-drafted (shortened) upper
  // seam, so the two match by construction.
  it("#222: the stand's own upper seam matches the fall's own neckline seam (collar-stand-fall) within 0.3cm", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { neckline: "round" as const, collar: "shirt" as const },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "collar-stand-fall");
    expect(pair).toBeDefined();
    expect(pair!.fixable).toBe(false);
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  // #222 AC: "the stand's upper seam is drafted as a curve, shortened
  // relative to its lower (neckline) edge -- not a straight edge like
  // #221's plain band."
  it("#222 AC: the stand's own upper (fall) seam is a genuine curve, shorter than its own lower (neckline) seam", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { neckline: "round" as const, collar: "shirt" as const },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const stand = pieces.find((p) => p.id === "collar-stand")!;
    expect(stand).toBeDefined();
    expect(stand.curvedSpans ?? []).not.toHaveLength(0);
    const neckLenCm = curveArcLengthCm(
      stand.outlineCm,
      stand.curvedSpans ?? [],
      ...stand.seamEdges!.neckline,
    );
    const fallSeamLenCm = curveArcLengthCm(
      stand.outlineCm,
      stand.curvedSpans ?? [],
      ...stand.seamEdges!.fallSeam,
    );
    expect(fallSeamLenCm).toBeLessThan(neckLenCm);
  });

  // #222 AC: "the stand's width is derived from the measured half-neckline
  // plus the button-stand width ..., not a fixed constant." Two different
  // bodies (female vs male base measurements) draft two different measured
  // neckline arcs, so a fixed constant would fail this; the ONLY constant
  // reused is BUTTON_STAND_WIDTH_CM itself, the same extension #223's own
  // front-closure work already derived.
  it("#222 AC: the stand's own width tracks the measured neckline arc plus the button-stand width, not a fixed constant", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { neckline: "round" as const, collar: "shirt" as const },
    };
    const femalePair = measureSeamGraph(
      DEFAULT_ENGINE_ID,
      spec,
      SIZE_TABLE.M,
      t,
    ).find((m) => m.key === "collar-neckline")!;
    const malePair = measureSeamGraph(
      DEFAULT_ENGINE_ID,
      { ...spec, gender: "male" as const },
      SIZE_TABLE_MALE.M,
      t,
    ).find((m) => m.key === "collar-neckline")!;
    // Different bodies -> genuinely different measured neckline arcs.
    expect(femalePair.aLenCm).not.toBeCloseTo(malePair.aLenCm, 0);
    // Each stand's own finished length (bLenCm) is still exactly its own
    // measured arc plus the SAME button-stand width either way.
    expect(femalePair.bLenCm - femalePair.aLenCm).toBeCloseTo(
      BUTTON_STAND_WIDTH_CM,
      1,
    );
    expect(malePair.bLenCm - malePair.aLenCm).toBeCloseTo(
      BUTTON_STAND_WIDTH_CM,
      1,
    );
  });

  it("#130: the cuff's own seam matches the sleeve's measured hem edge (plus wrist ease) within 0.3cm", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "long" as const, cuff: "straight" as const },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "cuff-hem");
    expect(pair).toBeDefined();
    expect(pair!.fixable).toBe(false);
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  it("#223: the button stand's own seam matches the front's measured center-front edge within 0.3cm", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { frontClosure: "buttonStand" as const },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "button-stand-center-front");
    expect(pair).toBeDefined();
    expect(pair!.fixable).toBe(false);
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  it("#223: no button stand is drafted when frontClosure is unset", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {},
    };
    // draftPiecesCm, not draftAll -- draftAll is not exported from this
    // file; draftPiecesCm is the exported wrapper the existing "no cuff is
    // drafted for a short sleeve..." test above already uses for the
    // identical shape of assertion.
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(pieces.map((p) => p.id)).not.toContain("button-stand");
  });

  it("#223: a collar drafted together with a button stand still matches the front+back neckline arc (front counted from ONE half, doubled)", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {
        neckline: "round" as const,
        collar: "convertible" as const,
        frontClosure: "buttonStand" as const,
      },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "collar-neckline");
    expect(pair).toBeDefined();
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  it("no cuff is drafted for a short sleeve even when style.cuff is set (cuff only applies to sleeve: long)", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const, cuff: "straight" as const },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(pieces.map((p) => p.id)).not.toContain("cuff");
    expect(pieces.map((p) => p.id)).not.toContain("placket");
  });

  // #225: a verified source on sleeve-placket construction states the
  // overlap piece is finished with an asymmetric fold -- 3/8" on one long
  // edge, 1/4" on the other -- not the symmetric strip this drafter used to
  // cut. Reuses the "blouse deep V long" DECORATION_CASES style (long sleeve
  // + straight cuff) so this is the same spec shape the containment/offset
  // matrix already exercises the placket through.
  it("#225: the placket's two long edges carry different fold allowances (overlap vs underlap), not a symmetric rectangle", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "long" as const, cuff: "straight" as const },
    };
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const placket = pieces.find((p) => p.id === "placket");
    expect(placket).toBeDefined();

    expect(PLACKET_FOLD_OVERLAP_CM).not.toBe(PLACKET_FOLD_UNDERLAP_CM);

    const width = bbox(placket!.outlineCm).w;
    const foldLines = (placket!.internalsCm ?? []).filter(isFoldLine);
    expect(foldLines).toHaveLength(2);

    // Each fold line's distance from its OWN nearest long edge -- the
    // asymmetry the issue is about, not just two arbitrary internal lines.
    const distancesFromNearestEdge = foldLines
      .map((f) => f.aCm[0])
      .map((x) => Math.min(x, width - x))
      .sort((a, b) => a - b);
    expect(distancesFromNearestEdge[0]).toBeCloseTo(
      PLACKET_FOLD_UNDERLAP_CM,
      5,
    );
    expect(distancesFromNearestEdge[1]).toBeCloseTo(PLACKET_FOLD_OVERLAP_CM, 5);

    // The piece card states both measurements explicitly (#225 AC), through
    // the same injected Translate/PatternData catalog path every other
    // subpiece detail row already uses -- t() is the identity function in
    // tests, so the label IS the catalog key here.
    expect(
      placket!.detailRows.some((r) => r.label === "rows.placketFoldOverlap"),
    ).toBe(true);
    expect(
      placket!.detailRows.some((r) => r.label === "rows.placketFoldUnderlap"),
    ).toBe(true);
  });

  it("#131: the waistband's own seam matches the skirt's measured waist edge (plus overlap) within 0.3cm, for every silhouette", () => {
    for (const silhouette of [
      "straight",
      "a-line",
      "gore",
      "half-circle",
      "circle",
    ] as const) {
      const spec = {
        type: "skirt" as const,
        gender: "female" as const,
        measurementOverrides: {},
        style: { skirt: silhouette },
      };
      const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
      const pair = graph.find((m) => m.key === "waistband-waist");
      expect(pair, silhouette).toBeDefined();
      expect(pair!.fixable, silhouette).toBe(false);
      expect(pair!.diffCm, silhouette).toBeLessThan(0.3);
    }
  });

  // #244: proves the widened panel isn't "free" fabric -- the waistband is
  // DERIVED from the panel's own real (pleat-widened) waist edge
  // (garment.ts's curveArcLengthCm call, unchanged by this feature), so it
  // grows to match automatically and the seam graph stays closed exactly
  // like the unpleated case just above.
  it.each(["box", "inverted-box"] as const)(
    "#244: a %s pleat still matches its own waistband within 0.3cm, and the band grows to hold the extra fabric",
    (pleats) => {
      const plainSpec = {
        type: "skirt" as const,
        gender: "female" as const,
        measurementOverrides: {},
        style: { skirt: "straight" as const },
      };
      const pleatedSpec = {
        ...plainSpec,
        style: { ...plainSpec.style, pleats },
      };
      const plainGraph = measureSeamGraph(
        DEFAULT_ENGINE_ID,
        plainSpec,
        SIZE_TABLE.M,
        t,
      );
      const pleatedGraph = measureSeamGraph(
        DEFAULT_ENGINE_ID,
        pleatedSpec,
        SIZE_TABLE.M,
        t,
      );
      const plainPair = plainGraph.find((m) => m.key === "waistband-waist")!;
      const pleatedPair = pleatedGraph.find(
        (m) => m.key === "waistband-waist",
      )!;
      expect(pleatedPair.diffCm).toBeLessThan(0.3);
      expect(seamCheck(pleatedGraph)).toEqual([]);
      expect(pleatedPair.aLenCm).toBeGreaterThan(plainPair.aLenCm);
    },
  );

  it("#131: a dress's skirt panel gets no waistband -- it joins the bodice at the natural waist instead", () => {
    const spec = {
      type: "dress" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "none" as const, darts: true, skirt: "a-line" as const },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(graph.find((m) => m.key === "waistband-waist")).toBeUndefined();
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(pieces.map((p) => p.id)).not.toContain("waistband");
  });

  // #128: the trousers block declares four kinds of seam -- front/back's own
  // rise (self-paired, the mirrored-leg fly/back seam), inseam, outseam
  // (front vs back, equal by construction -- see lib/draft/trousers.ts) and
  // the waistband, reusing #131's draftWaistband verbatim. Every pair must
  // be present and, other than the waistband's own deliberate
  // WAISTBAND_OVERLAP_CM ease, essentially exact.
  it("#128: every trouser seam is declared and closes within 0.3cm", () => {
    const spec = {
      type: "trousers" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {},
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    const keys = graph.map((m) => m.key).sort();
    expect(keys).toEqual(
      [
        "trouser-front-rise",
        "trouser-back-rise",
        "trouser-inseam",
        "trouser-outseam",
        "trouser-waistband-waist",
      ].sort(),
    );
    for (const pair of graph) {
      expect(pair.fixable, pair.key).toBe(false);
      expect(pair.diffCm, pair.key).toBeLessThan(0.3);
    }
    expect(seamCheck(graph)).toEqual([]);
  });

  it("#128: no waistband is drafted for trousers when style.waistband is 'none'", () => {
    const spec = {
      type: "trousers" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { waistband: "none" as const },
    };
    const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(
      graph.find((m) => m.key === "trouser-waistband-waist"),
    ).toBeUndefined();
    const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, SIZE_TABLE.M, t);
    expect(pieces.map((p) => p.id)).not.toContain("waistband");
  });

  // The shared MEASUREMENT_CORNERS matrix above only perturbs
  // bust/backLength/shoulder -- none of which the trousers block reads.
  // hip/waist/rise are what actually drive its geometry, so they get their
  // own dedicated sweep here (both the seam graph and full containment).
  const TROUSER_CORNERS: [string, Partial<Measurements>][] = [
    [
      "min",
      {
        hip: MEASUREMENT_RANGES.hip.min,
        waist: MEASUREMENT_RANGES.waist.min,
        rise: MEASUREMENT_RANGES.rise.min,
      },
    ],
    [
      "max",
      {
        hip: MEASUREMENT_RANGES.hip.max,
        waist: MEASUREMENT_RANGES.waist.max,
        rise: MEASUREMENT_RANGES.rise.max,
      },
    ],
    // waist very close to hip (near-zero dart suppression) and waist far
    // below hip (large dart suppression) -- the two edges of the dart-sizing
    // formula in lib/draft/trousers.ts.
    ["waist near hip", { hip: 100, waist: 96, rise: 28 }],
    ["waist far below hip", { hip: 150, waist: 55, rise: 36 }],
    // no chart-provided rise at all -- exercises the hip-derived fallback.
    ["no rise (fallback)", { hip: 100, waist: 74, rise: undefined }],
  ];

  describe("#128: trousers at the hip/waist/rise corners", () => {
    for (const [cornerName, corner] of TROUSER_CORNERS) {
      it(`${cornerName}: seam graph closes and geometry stays contained`, () => {
        const spec = {
          type: "trousers" as const,
          gender: "female" as const,
          measurementOverrides: {},
          style: {},
        };
        const m: Measurements = { ...SIZE_TABLE.M, ...corner };
        const conflicts = seamCheck(
          measureSeamGraph(DEFAULT_ENGINE_ID, spec, m, t),
        );
        expect(conflicts, JSON.stringify(conflicts)).toEqual([]);
        const pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t);
        assertPositiveGeometry(pieces);
        assertDecorationsContained(pieces);
      });
    }
  });
});

// bust-dart-shaping feature: a real cup delta re-angles/widens the front
// dart (lib/draft/body.ts's bodice()). These matrices reuse the SAME
// MEASUREMENT_CORNERS-style pattern already established above, but as a
// LOCAL corner list (not added to the shared DECORATION_CASES/fixtures.ts,
// which export/model.test.ts and other files also consume) -- surgical to
// this feature, exercised across every existing DECORATION_CASES spec.
const BUST_APEX_CORNERS: [string, Partial<Measurements>][] = [
  // A real, non-zero delta on every gender's own M base (female 92-80=12cm,
  // male 100-80=20cm -- both comfortably positive).
  ["real cup delta", { highBust: 80 }],
  [
    "real cup delta + boundary bustSpan/bustPointHeight max",
    {
      highBust: 80,
      bustSpan: MEASUREMENT_RANGES.bustSpan.max,
      bustPointHeight: MEASUREMENT_RANGES.bustPointHeight.max,
    },
  ],
  [
    "real cup delta + boundary bustSpan/bustPointHeight min",
    {
      highBust: 80,
      bustSpan: MEASUREMENT_RANGES.bustSpan.min,
      bustPointHeight: MEASUREMENT_RANGES.bustPointHeight.min,
    },
  ],
];

describe("drafted decorations stay inside their own piece, with a real bust-apex delta (bust-dart-shaping)", () => {
  for (const [name, spec] of DECORATION_CASES) {
    for (const [cornerName, corner] of BUST_APEX_CORNERS) {
      it(`${name} @ ${cornerName}: grainline, dart and notches never leave the outline`, () => {
        const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
        const m = { ...base, ...corner };
        assertDecorationsContained(
          draftPiecesCm(DEFAULT_ENGINE_ID, spec, m, t),
        );
      });
    }
  }
});

describe("seam graph (#134), with a real bust-apex delta (bust-dart-shaping)", () => {
  it("BDART-07: reports zero divergences at the bust-apex corners too", () => {
    for (const [name, spec] of DECORATION_CASES) {
      for (const [cornerName, corner] of BUST_APEX_CORNERS) {
        const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
        const m = { ...base, ...corner };
        const conflicts = seamCheck(
          measureSeamGraph(DEFAULT_ENGINE_ID, spec, m, t),
        );
        expect(
          conflicts,
          `${name} @ ${cornerName}: ${JSON.stringify(conflicts)}`,
        ).toEqual([]);
      }
    }
  });

  // Minimal Pattern for buildAssemblyOrder -- the same fakePattern shape
  // lib/draft/assembly.test.ts/easeReport.test.ts each already duplicate
  // locally: only spec/sizeTable/baseSize/pieces.length are ever read.
  function fakePattern(spec: GarmentSpec, baseSize = "M"): Pattern {
    const table = spec.gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE;
    return {
      id: "p1",
      name: "Teste",
      version: 1,
      baseSize,
      unit: "cm",
      sizes: ["PP", "P", "M", "G", "GG"],
      sizesApplied: [],
      sizesPending: [],
      sizeTable: { [baseSize]: table[baseSize] },
      pieces: [
        {
          id: "x",
          name: "x",
          qty: 1,
          outline: { kind: "polygon", points: "0,0" },
          label: { x: 0, y: 0 },
          detailRows: [],
        },
      ],
      spec,
    };
  }

  it("BDART-09: the seam graph's pair count/keys and buildAssemblyOrder's step counts are unchanged by a real bust-apex delta", () => {
    const spec: GarmentSpec = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "round", sleeve: "short", darts: true },
    };
    const specWithDelta: GarmentSpec = {
      ...spec,
      measurementOverrides: {
        highBust: 80,
        bustSpan: 22,
        bustPointHeight: 24,
      },
    };
    const base = SIZE_TABLE.M;

    const graphNoDelta = measureSeamGraph(DEFAULT_ENGINE_ID, spec, base, t);
    const graphWithDelta = measureSeamGraph(
      DEFAULT_ENGINE_ID,
      specWithDelta,
      base,
      t,
    );
    expect(graphWithDelta.length).toBe(graphNoDelta.length);
    expect(graphWithDelta.map((m) => m.key).sort()).toEqual(
      graphNoDelta.map((m) => m.key).sort(),
    );

    const orderNoDelta = buildAssemblyOrder(fakePattern(spec), t)!;
    const orderWithDelta = buildAssemblyOrder(fakePattern(specWithDelta), t)!;
    expect(orderWithDelta.steps.length).toBe(orderNoDelta.steps.length);

    const dartSteps = (steps: typeof orderNoDelta.steps) =>
      steps
        .filter((s) => s.kind === "dart")
        .map((s) => `${s.pieceId}:${s.count}`)
        .sort();
    const seamStepKeys = (steps: typeof orderNoDelta.steps) =>
      steps
        .filter((s) => s.kind === "seam")
        .map((s) => s.key)
        .sort();
    const hemSteps = (steps: typeof orderNoDelta.steps) =>
      steps
        .filter((s) => s.kind === "hem")
        .map((s) => s.pieceId)
        .sort();

    expect(dartSteps(orderWithDelta.steps)).toEqual(
      dartSteps(orderNoDelta.steps),
    );
    expect(seamStepKeys(orderWithDelta.steps)).toEqual(
      seamStepKeys(orderNoDelta.steps),
    );
    expect(hemSteps(orderWithDelta.steps)).toEqual(
      hemSteps(orderNoDelta.steps),
    );
    expect(orderWithDelta.hasConflict).toBe(orderNoDelta.hasConflict);
  });
});
