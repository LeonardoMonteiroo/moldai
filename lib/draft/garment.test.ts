import { describe, it, expect } from "vitest";
import {
  validateSpec,
  draftGarment,
  validateQuestions,
  draftPiecesCm,
  STYLE_LIMITS,
} from "./garment";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";

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
    expect(front.dart).toBeUndefined();
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
  it("without an armhole adjustment, body and sleeve match by construction (no conflict)", () => {
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
    expect(Math.abs(armholeLenCm! - sleeveArmholeCm!)).toBeLessThan(1e-6);
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
    expect(Math.abs(armholeLenCm! - sleeveArmholeCm!)).toBeLessThan(1e-6);
  });
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

const DECORATION_CASES: [string, Parameters<typeof draftPiecesCm>[0]][] = [
  [
    "blouse round short",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "round", sleeve: "short", darts: true },
    },
  ],
  [
    "blouse deep V long",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "V",
        necklineDepthCm: STYLE_LIMITS.necklineDepthCm.max,
        sleeve: "long",
        darts: true,
      },
    },
  ],
  [
    "blouse straight sleeveless",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "straight", sleeve: "none", darts: false },
    },
  ],
  [
    "tshirt male",
    { type: "tshirt", gender: "male", measurementOverrides: {}, style: {} },
  ],
  [
    "dress a-line",
    {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        skirt: "a-line",
      },
    },
  ],
  [
    "skirt circle",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "circle" },
    },
  ],
  [
    "skirt straight",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "straight" },
    },
  ],
];

describe("drafted decorations stay inside their own piece", () => {
  for (const [name, spec] of DECORATION_CASES) {
    it(`${name}: grainline and dart never leave the outline`, () => {
      const m = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const pieces = draftPiecesCm(spec, m, t);
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) {
        const points = [
          ...(piece.grainlineCm ?? []),
          ...(piece.dartCm ?? []),
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
    });
  }
});
