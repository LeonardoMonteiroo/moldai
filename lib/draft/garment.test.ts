import { describe, it, expect } from "vitest";
import {
  validateSpec,
  draftGarment,
  validateQuestions,
  draftPiecesCm,
  draftGradedOverlays,
  measureSeams,
  measureSeamGraph,
  seamCheck,
  STYLE_LIMITS,
} from "./garment";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  MEASUREMENT_RANGES,
  type Measurements,
} from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { curveArcLengthCm, bbox } from "./core";
import { DECORATION_CASES } from "./fixtures";

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
});

describe("draftGarment", () => {
  it("blouse generates front, back, and sleeve", () => {
    const { pieces } = draftGarment(
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
  it("tshirt generates front/back/sleeve, no dart, round neckline", () => {
    const { pieces } = draftGarment(
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
    expect(ids).toEqual(["body-back", "body-front", "sleeve"]);
    const front = pieces.find((p) => p.id === "body-front")!;
    expect(front.darts).toBeUndefined();
    expect(front.detailRows.some((r) => r.value === "neckline.round")).toBe(
      true,
    );
  });
  it("skirt generates the skirt panel plus its default waistband, and viewBox > 0 (#131)", () => {
    const { pieces, viewBox } = draftGarment(
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
  const CASES: [string, Parameters<typeof draftPiecesCm>[0], number][] = [
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
      const pieces = draftPiecesCm(spec, m, t);
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
  it("returns pieces in cm (front/back/sleeve) for tshirt", () => {
    const pcs = draftPiecesCm(
      {
        type: "tshirt",
        gender: "male",
        measurementOverrides: {},
        style: {},
      },
      SIZE_TABLE_MALE.M,
      t,
    );
    expect(pcs.map((p) => p.id)).toEqual(["body-front", "body-back", "sleeve"]);
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
      spec,
      SIZE_TABLE.M,
      t,
    );
    // The body's armhole is the deepened one; the cap is still sized from the base.
    expect(armholeLenCm!).toBeGreaterThan(sleeveArmholeCm!);
    const graph = measureSeamGraph(spec, SIZE_TABLE.M, t);
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
    const drafted = draftGarment(spec, SIZE_TABLE.M, t);
    expect(measureSeams(spec, SIZE_TABLE.M, t)).toEqual({
      armholeLenCm: drafted.armholeLenCm,
      sleeveArmholeCm: drafted.sleeveArmholeCm,
    });
  });
  it("reports no seams for a garment without an armhole", () => {
    const { armholeLenCm, sleeveArmholeCm } = measureSeams(
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
    const { pieces } = draftGarment(spec, SIZE_TABLE.M, t);
    expect(
      draftGradedOverlays(spec, pieces, SIZE_TABLE.M, SIZE_TABLE, [], t),
    ).toEqual([]);
  });

  it("returns one overlay per piece per applied size, keyed to the base piece's own id", () => {
    const { pieces } = draftGarment(spec, SIZE_TABLE.M, t);
    const overlays = draftGradedOverlays(
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
    const { pieces } = draftGarment(spec, SIZE_TABLE.M, t);
    const [overlay] = draftGradedOverlays(
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
    const { pieces } = draftGarment(spec, SIZE_TABLE.M, t);
    const front = pieces.find((p) => p.id === "body-front")!;
    const overlays = draftGradedOverlays(
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
    const { pieces } = draftGarment(spec, SIZE_TABLE.M, t);
    expect(
      draftGradedOverlays(
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
      assertDecorationsContained(draftPiecesCm(spec, m, t));
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
describe("#132: drafting with no extended measurement keys is byte-identical to reconstructing today's formula explicitly", () => {
  for (const [name, spec] of DECORATION_CASES) {
    it(name, () => {
      const male = spec.gender === "male";
      const base = male ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const withoutExtended: Measurements = { ...base };

      const withFormula: Measurements = {
        ...base,
        neckGirth: (base.bust * 6) / 14,
        highBust: base.bust,
        shoulderSlope: male ? 4.5 : 4.0,
        bicep: base.bust * 0.3,
      };

      const a = draftPiecesCm(spec, withoutExtended, t);
      const b = draftPiecesCm(spec, withFormula, t);
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
        const pieces = draftPiecesCm(spec, m, t);
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
      spec,
      { ...SIZE_TABLE.M, ...PERSONAS[0][1] },
      t,
    );
    const fuller = draftPiecesCm(
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
        assertDecorationsContained(draftPiecesCm(spec, m, t));
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
    assertDecorationsContained(draftPiecesCm(spec, m, t));
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
      const pieces = draftPiecesCm(spec, m, t);
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
    const spec: Parameters<typeof draftPiecesCm>[0] = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", armholeDeepenCm: 3 },
    };
    const pieces = draftPiecesCm(spec, SIZE_TABLE.M, t);
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
    const spec: Parameters<typeof draftPiecesCm>[0] = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", armholeDeepenCm: 3, sleeveRefit: true },
    };
    const pieces = draftPiecesCm(spec, SIZE_TABLE.M, t);
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
      const pieces = draftPiecesCm(spec, m, t);
      const withFold = pieces.filter((p) => p.foldEdge);
      expect(withFold.length).toBeGreaterThan(0);
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
});

describe("drafted outlines have no retraced edge (#79)", () => {
  for (const [name, spec] of DECORATION_CASES) {
    it(`${name}: no three consecutive same-y vertices reverse direction`, () => {
      const m = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      for (const piece of draftPiecesCm(spec, m, t)) {
        expect(
          hasRetracedEdge(piece.outlineCm as [number, number][]),
          `${piece.id} outline retraces an edge`,
        ).toBe(false);
      }
    });
  }

  it("a dress bodice's hem width equals the skirt panel's own waist width", () => {
    const spec: Parameters<typeof draftPiecesCm>[0] = {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", darts: true, skirt: "straight" },
    };
    const pieces = draftPiecesCm(spec, SIZE_TABLE.M, t);
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
      const graph = measureSeamGraph(spec, base, t);
      const conflicts = seamCheck(graph);
      expect(conflicts, `${name}: ${JSON.stringify(conflicts)}`).toEqual([]);
    }
  });

  it("reports zero divergences at the measurement-range corners too", () => {
    for (const [name, spec] of DECORATION_CASES) {
      for (const [cornerName, corner] of MEASUREMENT_CORNERS) {
        const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
        const m = { ...base, ...corner };
        const conflicts = seamCheck(measureSeamGraph(spec, m, t));
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
        const conflicts = seamCheck(measureSeamGraph(spec, table[size], t));
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
    const conflicts = seamCheck(measureSeamGraph(spec, SIZE_TABLE.M, t));
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
    const conflicts = seamCheck(measureSeamGraph(spec, SIZE_TABLE.M, t));
    expect(conflicts).toEqual([]);
  });

  // A real, previously-undetected gap this issue's own generalisation
  // surfaces rather than fixes (see the PR description / CLAUDE.md): a
  // dress's bodice hem is hip-derived (skirtWaistHalfCm), but a
  // circle/gore/half-circle skirt's own waist arc is drafted straight from
  // the actual waist measurement -- two different measurements of the same
  // body. For SIZE_TABLE.M (waist 66, hip 92) these genuinely disagree, so
  // this is NOT a "should be zero" assertion like the ones above -- it
  // documents that the graph now catches what it previously could not, with
  // no automatic fix offered for it.
  it("#134 finding: a dress with a circle skirt reports a REAL, unfixable waist-join divergence", () => {
    const spec = {
      type: "dress" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "none" as const, darts: true, skirt: "circle" as const },
    };
    const conflicts = seamCheck(measureSeamGraph(spec, SIZE_TABLE.M, t));
    const waistJoins = conflicts.filter((c) => c.key.startsWith("waist-join"));
    expect(waistJoins.length).toBeGreaterThan(0);
    for (const c of waistJoins) {
      expect(c.fixable).toBe(false);
      expect(c.diffCm).toBeGreaterThan(1);
    }
  });

  it("a straight/a-line dress skirt has no waist-join divergence (equal by construction, #79)", () => {
    const spec = {
      type: "dress" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: {
        sleeve: "none" as const,
        darts: true,
        skirt: "straight" as const,
      },
    };
    const conflicts = seamCheck(measureSeamGraph(spec, SIZE_TABLE.M, t));
    expect(conflicts.filter((c) => c.key.startsWith("waist-join"))).toEqual([]);
  });

  it("the full graph includes the equal-by-construction pairs too, not only the divergent ones", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const },
    };
    const graph = measureSeamGraph(spec, SIZE_TABLE.M, t);
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
    const graph = measureSeamGraph(spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "collar-neckline");
    expect(pair).toBeDefined();
    expect(pair!.fixable).toBe(false);
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  it("#130: the cuff's own seam matches the sleeve's measured hem edge (plus wrist ease) within 0.3cm", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "long" as const, cuff: "straight" as const },
    };
    const graph = measureSeamGraph(spec, SIZE_TABLE.M, t);
    const pair = graph.find((m) => m.key === "cuff-hem");
    expect(pair).toBeDefined();
    expect(pair!.fixable).toBe(false);
    expect(pair!.diffCm).toBeLessThan(0.3);
  });

  it("no cuff is drafted for a short sleeve even when style.cuff is set (cuff only applies to sleeve: long)", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const, cuff: "straight" as const },
    };
    const pieces = draftPiecesCm(spec, SIZE_TABLE.M, t);
    expect(pieces.map((p) => p.id)).not.toContain("cuff");
    expect(pieces.map((p) => p.id)).not.toContain("placket");
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
      const graph = measureSeamGraph(spec, SIZE_TABLE.M, t);
      const pair = graph.find((m) => m.key === "waistband-waist");
      expect(pair, silhouette).toBeDefined();
      expect(pair!.fixable, silhouette).toBe(false);
      expect(pair!.diffCm, silhouette).toBeLessThan(0.3);
    }
  });

  it("#131: a dress's skirt panel gets no waistband -- it joins the bodice at the natural waist instead", () => {
    const spec = {
      type: "dress" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "none" as const, darts: true, skirt: "a-line" as const },
    };
    const graph = measureSeamGraph(spec, SIZE_TABLE.M, t);
    expect(graph.find((m) => m.key === "waistband-waist")).toBeUndefined();
    const pieces = draftPiecesCm(spec, SIZE_TABLE.M, t);
    expect(pieces.map((p) => p.id)).not.toContain("waistband");
  });
});
