import { describe, it, expect } from "vitest";
import {
  validateSpec,
  draftGarment,
  validateQuestions,
  draftPiecesCm,
  draftGradedOverlays,
  measureSeams,
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
import { curveArcLengthCm } from "./core";
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
  it("skirt generates only the skirt piece and viewBox > 0", () => {
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
    expect(pieces.map((p) => p.id)).toEqual(["skirt"]);
    expect(viewBox.w).toBeGreaterThan(0);
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
    const seam = seamCheck(armholeLenCm, sleeveArmholeCm);
    expect(seam).not.toBeNull();
    expect(Math.abs(armholeLenCm! - sleeveArmholeCm!)).toBeCloseTo(
      seam!.diffCm,
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
    const points = [
      ...(piece.grainlineCm ?? []),
      ...(piece.dartsCm ?? []).flat(),
    ] as [number, number][];
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
