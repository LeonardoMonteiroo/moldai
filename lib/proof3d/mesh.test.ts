import { describe, it, expect } from "vitest";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { buildProofMesh, flattenOutline, RING_SAMPLES } from "./mesh";
import { TSHIRT_BASE_EASE_CM } from "@/lib/draft/ease";
import { DECORATION_CASES } from "@/lib/draft/fixtures";

function pattern(
  spec: GarmentSpec,
  baseMeasurements = SIZE_TABLE.M,
  engine?: string,
): Pattern {
  return {
    id: "p1",
    name: "Blusa",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["M"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: baseMeasurements },
    pieces: [],
    spec,
    engine,
  };
}

// A smaller matrix than lib/draft/fixtures.ts's DECORATION_CASES -- the
// invariants below don't vary with neckline, only with garment type/knit/
// silhouette, which these four already span.
const CASES: [string, GarmentSpec, Parameters<typeof pattern>[1]][] = [
  [
    "blouse woven round short (fitted, darted)",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "round", sleeve: "short", darts: true },
    },
    SIZE_TABLE.M,
  ],
  [
    "tshirt male (knit)",
    { type: "tshirt", gender: "male", measurementOverrides: {}, style: {} },
    SIZE_TABLE_MALE.M,
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
    SIZE_TABLE.M,
  ],
  [
    "skirt circle",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "circle" },
    },
    SIZE_TABLE.M,
  ],
  [
    "skirt straight",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "straight" },
    },
    SIZE_TABLE.M,
  ],
];

describe("buildProofMesh", () => {
  it("throws for a pattern with no spec, mirroring lib/export/model.ts's buildExportModel", () => {
    const blank = pattern(
      { type: "blouse", gender: "female", measurementOverrides: {}, style: {} },
      SIZE_TABLE.M,
    );
    blank.spec = undefined;
    expect(() => buildProofMesh(blank, t)).toThrow(
      "buildProofMesh: pattern has no spec",
    );
  });

  it.each(CASES)(
    "every ring's sampled perimeter equals its girthCm within 0.05cm — %s",
    (_name, spec, base) => {
      const mesh = buildProofMesh(pattern(spec, base), t);
      const shells = [mesh.form, ...mesh.garment];
      for (const shell of shells) {
        for (const ring of shell.rings) {
          expect(ring.points).toHaveLength(RING_SAMPLES);
          let perim = 0;
          for (let i = 0; i < ring.points.length; i++) {
            const [x1, z1] = ring.points[i];
            const [x2, z2] = ring.points[(i + 1) % ring.points.length];
            perim += Math.hypot(x2 - x1, z2 - z1);
          }
          expect(Math.abs(perim - ring.girthCm)).toBeLessThan(0.05);
        }
      }
    },
  );

  it.each(CASES)(
    "no NaN/Infinity anywhere in the mesh — %s",
    (_name, spec, base) => {
      const mesh = buildProofMesh(pattern(spec, base), t);
      const shells = [mesh.form, ...mesh.garment];
      for (const shell of shells) {
        expect(Number.isFinite(shell.centerXCm)).toBe(true);
        for (const ring of shell.rings) {
          expect(Number.isFinite(ring.yCm)).toBe(true);
          expect(Number.isFinite(ring.girthCm)).toBe(true);
          for (const [x, z] of ring.points) {
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(z)).toBe(true);
          }
        }
      }
      for (const row of mesh.fit) {
        expect(Number.isFinite(row.garmentCm)).toBe(true);
        expect(Number.isFinite(row.bodyCm)).toBe(true);
        expect(Number.isFinite(row.easeCm)).toBe(true);
      }
    },
  );

  it("every fit row's garment girth is >= the resolved body girth, i.e. easeCm >= 0", () => {
    for (const [, spec, base] of CASES) {
      const mesh = buildProofMesh(pattern(spec, base), t);
      for (const row of mesh.fit) {
        expect(row.easeCm).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });

  // tshirt-fit-calibration: a knit garment's default (no explicit stretch)
  // ease is now TSHIRT_BASE_EASE_CM, not 0 -- see lib/draft/ease.ts.
  it("woven blouse bust ease is 8cm (FIT_EASE_CM.fitted.bust) and tshirt bust ease is TSHIRT_BASE_EASE_CM", () => {
    const blouseMesh = buildProofMesh(pattern(CASES[0][1], CASES[0][2]), t);
    const bustBlouse = blouseMesh.fit.find((r) => r.key === "bust");
    expect(bustBlouse?.easeCm).toBeCloseTo(8, 5);

    const tshirtMesh = buildProofMesh(pattern(CASES[1][1], CASES[1][2]), t);
    const bustTshirt = tshirtMesh.fit.find((r) => r.key === "bust");
    expect(bustTshirt?.easeCm).toBeCloseTo(TSHIRT_BASE_EASE_CM, 5);
  });

  it("a fitted (darted) blouse emits a waist row; an unfitted one does not", () => {
    const fitted = buildProofMesh(pattern(CASES[0][1], CASES[0][2]), t);
    expect(fitted.fit.some((r) => r.key === "waist")).toBe(true);

    const unfitted = buildProofMesh(
      pattern(
        {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: { neckline: "straight", sleeve: "none", darts: false },
        },
        SIZE_TABLE.M,
      ),
      t,
    );
    expect(unfitted.fit.some((r) => r.key === "waist")).toBe(false);
  });

  it("a skirt-only (straight) mesh has no body shell, emits a hip row (never bust), and its first skirt ring sits at the form's own waist height (m.backLength)", () => {
    const mesh = buildProofMesh(pattern(CASES[4][1], CASES[4][2]), t);
    expect(mesh.garment.some((s) => s.id === "body")).toBe(false);
    expect(mesh.garment.some((s) => s.id === "skirt")).toBe(true);
    expect(mesh.fit.some((r) => r.key === "bust")).toBe(false);
    expect(mesh.fit.some((r) => r.key === "hip")).toBe(true);

    const skirtShell = mesh.garment.find((s) => s.id === "skirt")!;
    expect(skirtShell.rings[0].yCm).toBeCloseTo(SIZE_TABLE.M.backLength, 5);
  });

  it("a radial (circle) skirt fits the waist exactly by construction, so it emits no hip fit row", () => {
    const mesh = buildProofMesh(pattern(CASES[3][1], CASES[3][2]), t);
    expect(mesh.garment.some((s) => s.id === "body")).toBe(false);
    expect(mesh.fit).toHaveLength(0);
    const skirtShell = mesh.garment.find((s) => s.id === "skirt")!;
    expect(skirtShell.rings[0].girthCm).toBeCloseTo(SIZE_TABLE.M.waist, 5);
  });

  it("a dress's skirt rings begin exactly where the bodice ends (m.backLength)", () => {
    const mesh = buildProofMesh(pattern(CASES[2][1], CASES[2][2]), t);
    const skirtShell = mesh.garment.find((s) => s.id === "skirt")!;
    expect(skirtShell.rings[0].yCm).toBeCloseTo(SIZE_TABLE.M.backLength, 5);
  });

  // #177: a dress's straight/a-line skirt panel no longer reads the hip
  // measurement (it reads dressWaistHalfCm(waist, ...), same as the bodice
  // hem it's sewn to) -- so a hip fit row here would compare a waist-derived
  // width against the body's hip, which the drafted geometry doesn't
  // actually claim. The "waist" row already surfaces the natural-waist fit,
  // and now equals the skirt panel's own waist width by construction (the
  // #177 fix itself).
  it("a dress's straight/a-line skirt panel is waist-derived (#177): no hip fit row, and its waist row matches the skirt panel's own waist girth", () => {
    const mesh = buildProofMesh(pattern(CASES[2][1], CASES[2][2]), t);
    expect(mesh.fit.some((r) => r.key === "hip")).toBe(false);
    const waistRow = mesh.fit.find((r) => r.key === "waist");
    expect(waistRow).toBeDefined();

    const skirtShell = mesh.garment.find((s) => s.id === "skirt")!;
    expect(skirtShell.rings[0].girthCm).toBeCloseTo(waistRow!.garmentCm, 1);
  });

  it("a blouse/tshirt/dress body shell exists, and its bust ring girth strictly exceeds the form's at the same height for a woven garment", () => {
    const mesh = buildProofMesh(pattern(CASES[0][1], CASES[0][2]), t);
    const bodyShell = mesh.garment.find((s) => s.id === "body")!;
    expect(bodyShell).toBeDefined();
    const bustRing = bodyShell.rings[0];
    expect(bustRing.girthCm).toBeGreaterThan(SIZE_TABLE.M.bust);
  });

  it("#223: a front-closure blouse's bust/waist mesh girth matches the equivalent whole-front blouse", () => {
    const base = buildProofMesh(pattern(CASES[0][1], CASES[0][2]), t);
    const closure = buildProofMesh(
      pattern(
        {
          ...CASES[0][1],
          style: { ...CASES[0][1].style, frontClosure: "buttonStand" },
        },
        CASES[0][2],
      ),
      t,
    );
    const baseBust = base.fit.find((r) => r.key === "bust")!;
    const closureBust = closure.fit.find((r) => r.key === "bust")!;
    expect(closureBust.easeCm).toBeCloseTo(baseBust.easeCm, 5);

    const baseWaist = base.fit.find((r) => r.key === "waist")!;
    const closureWaist = closure.fit.find((r) => r.key === "waist")!;
    expect(closureWaist.easeCm).toBeCloseTo(baseWaist.easeCm, 5);
  });
});

// Regression for a review finding: scanHalfWidthAtY/widestVertexInRange used
// to read a piece's raw outlineCm control polygon directly, so a scan
// landing inside a curvedSpan measured a chord across the curve rather than
// the real rendered boundary. flattenOutline is the fix -- proven here
// against a synthetic curved outline where the true curve visibly bulges
// past both of the span's own control-point vertices (which is exactly the
// case none of DECORATION_CASES exercises today, since bust/bicep land on
// real vertices and every waist/hip/hem scan lands on a straight edge).
describe("flattenOutline", () => {
  it("is a no-op when the outline has no curved spans", () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(flattenOutline(square, [])).toEqual(square);
  });

  it("densifies a curved span into a polyline that deviates from the straight chord between its endpoints (the true curve, not the control polygon)", () => {
    // A genuinely non-collinear armhole-like curve, span [0,2] (edges 0->1
    // and 1->2). Before this fix, scanHalfWidthAtY/widestVertexInRange read
    // outlineCm directly -- for a piece whose curved span crosses the
    // scanned height, that measured the straight edges 0->1->2 as if the
    // boundary really were two straight lines through those 3 points,
    // instead of the Catmull-Rom curve outlinePath/outlineSegments
    // actually render.
    const outline: [number, number][] = [
      [0, 0], // 0
      [3, 6], // 1
      [0, 12], // 2
      [-10, 12], // 3
      [-10, 0], // 4
    ];
    const flat = flattenOutline(outline, [[0, 2]]);
    expect(flat.length).toBeGreaterThan(outline.length);

    // Perpendicular distance from the midpoint of edge 0->1's straight
    // chord to the closest sample the curve actually passes through --
    // zero would mean flattening degenerated back to the straight edge.
    const [x0, y0] = outline[0];
    const [x1, y1] = outline[1];
    const chordMidX = (x0 + x1) / 2;
    const chordMidY = (y0 + y1) / 2;
    const closest = Math.min(
      ...flat.map(([x, y]) => Math.hypot(x - chordMidX, y - chordMidY)),
    );
    // The curve's own midpoint sample lands at roughly (1.7, 2.6) against
    // the chord's (1.5, 3) -- a real, non-trivial deviation.
    expect(closest).toBeGreaterThan(0.01);
  });

  it("leaves a straight (non-curved) edge exactly as drafted", () => {
    const outline: [number, number][] = [
      [0, 0],
      [3, 6],
      [0, 12],
      [-10, 12],
      [-10, 0],
    ];
    // Same shape, but the [0,2] span is NOT declared curved here -- edges
    // 3->4 and 4->0 were never curved in either case, and stay identical.
    const flatCurved = flattenOutline(outline, [[0, 2]]);
    const flatStraight = flattenOutline(outline, []);
    expect(flatStraight).toEqual(outline);
    expect(flatCurved).not.toEqual(flatStraight);
  });
});

// #254: trousers declares a real placementCm (lib/draft/trousers.ts) instead
// of matching nothing (the pre-#254 gap Proof3DTab.notSupportedForTrousers
// used to name) -- both DECORATION_CASES trousers rows produce a non-empty
// ProofMesh (two leg shells, no body/skirt/sleeve).
describe("buildProofMesh -- trousers (#254)", () => {
  const trouserCases = DECORATION_CASES.filter(
    ([, spec]) => spec.type === "trousers",
  );

  it("has at least the two DECORATION_CASES trousers rows", () => {
    expect(trouserCases.length).toBeGreaterThanOrEqual(2);
  });

  it.each(trouserCases)(
    "produces two non-empty leg shells and no body/skirt/sleeve shell — %s",
    (_name, spec) => {
      const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const mesh = buildProofMesh(pattern(spec, base), t);
      const legShells = mesh.garment.filter((s) => s.id === "trousers");
      expect(legShells).toHaveLength(2);
      for (const shell of legShells) {
        expect(shell.rings.length).toBeGreaterThanOrEqual(2);
        for (const ring of shell.rings) {
          expect(ring.girthCm).toBeGreaterThan(0);
        }
      }
      // The two legs sit on opposite sides of the centre line.
      expect(legShells[0].centerXCm).toBeCloseTo(-legShells[1].centerXCm, 5);
      expect(mesh.garment.some((s) => s.id === "body")).toBe(false);
      expect(mesh.garment.some((s) => s.id === "skirt")).toBe(false);
      expect(mesh.garment.some((s) => s.id === "sleeve")).toBe(false);
    },
  );

  it.each(trouserCases)(
    "no NaN/Infinity anywhere in a trousers mesh, and every ring's sampled perimeter matches girthCm — %s",
    (_name, spec) => {
      const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const mesh = buildProofMesh(pattern(spec, base), t);
      const shells = [mesh.form, ...mesh.garment];
      for (const shell of shells) {
        expect(Number.isFinite(shell.centerXCm)).toBe(true);
        for (const ring of shell.rings) {
          expect(Number.isFinite(ring.yCm)).toBe(true);
          expect(Number.isFinite(ring.girthCm)).toBe(true);
          let perim = 0;
          for (let i = 0; i < ring.points.length; i++) {
            const [x1, z1] = ring.points[i];
            const [x2, z2] = ring.points[(i + 1) % ring.points.length];
            perim += Math.hypot(x2 - x1, z2 - z1);
            expect(Number.isFinite(x1)).toBe(true);
            expect(Number.isFinite(z1)).toBe(true);
          }
          expect(Math.abs(perim - ring.girthCm)).toBeLessThan(0.05);
        }
      }
      for (const row of mesh.fit) {
        expect(Number.isFinite(row.garmentCm)).toBe(true);
        expect(Number.isFinite(row.bodyCm)).toBe(true);
        expect(Number.isFinite(row.easeCm)).toBe(true);
      }
    },
  );

  it("emits a hip fit row (no bodice to read waist/bust from)", () => {
    const mesh = buildProofMesh(pattern(trouserCases[0][1], SIZE_TABLE.M), t);
    expect(mesh.fit).toHaveLength(1);
    expect(mesh.fit[0].key).toBe("hip");
  });
});

// #254 (code-review finding): findByRole reads placementCm.role, which only
// the moldai drafters set at first -- the freesewing engine's own design
// wrappers (lib/draft/engine/freesewing/designs/*.ts) happen to reuse the
// EXACT SAME piece ids ("body-front"/"body-back"/"sleeve"/"skirt"/
// "trouser-front"/"trouser-back") moldai's own drafters do, which is
// precisely what made the OLD literal-id findPiece lookup work for a
// freesewing-drafted pattern too, by coincidence rather than by declaration.
// Switching to role-only matching without also updating those wrappers would
// have silently regressed every freesewing-drafted tshirt/blouse/skirt/
// trousers preview back to a bare, garment-less mannequin -- exactly the
// "silently empty" failure #128/#254 exist to prevent. This suite proves the
// freesewing engine's own pieces now declare the same roles.
describe("buildProofMesh -- freesewing engine (#254 code-review finding)", () => {
  const engine = "freesewing";

  it("tshirt: a real body+sleeve shell, not an empty mannequin", () => {
    const mesh = buildProofMesh(
      pattern(
        { type: "tshirt", gender: "male", measurementOverrides: {}, style: {} },
        SIZE_TABLE_MALE.M,
        engine,
      ),
      t,
    );
    expect(mesh.garment.some((s) => s.id === "body")).toBe(true);
    expect(mesh.garment.some((s) => s.id === "sleeve")).toBe(true);
    expect(mesh.fit.some((r) => r.key === "bust")).toBe(true);
  });

  it("blouse: a real body+sleeve shell, not an empty mannequin", () => {
    const mesh = buildProofMesh(
      pattern(
        {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: { neckline: "round", sleeve: "long" },
        },
        SIZE_TABLE.M,
        engine,
      ),
      t,
    );
    expect(mesh.garment.some((s) => s.id === "body")).toBe(true);
    expect(mesh.garment.some((s) => s.id === "sleeve")).toBe(true);
  });

  it("skirt: a real skirt shell, not an empty mannequin", () => {
    const mesh = buildProofMesh(
      pattern(
        {
          type: "skirt",
          gender: "female",
          measurementOverrides: {},
          style: {},
        },
        SIZE_TABLE.M,
        engine,
      ),
      t,
    );
    expect(mesh.garment.some((s) => s.id === "skirt")).toBe(true);
  });

  it("trousers: two real leg shells, not an empty mannequin", () => {
    const mesh = buildProofMesh(
      pattern(
        {
          type: "trousers",
          gender: "female",
          measurementOverrides: {},
          style: {},
        },
        SIZE_TABLE.M,
        engine,
      ),
      t,
    );
    const legShells = mesh.garment.filter((s) => s.id === "trousers");
    expect(legShells).toHaveLength(2);
    for (const shell of legShells) {
      for (const ring of shell.rings) {
        expect(Number.isFinite(ring.girthCm)).toBe(true);
        expect(ring.girthCm).toBeGreaterThan(0);
      }
    }
  });
});
