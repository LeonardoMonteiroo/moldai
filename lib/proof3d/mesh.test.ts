import { describe, it, expect } from "vitest";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { buildProofMesh, flattenOutline, RING_SAMPLES } from "./mesh";

function pattern(spec: GarmentSpec, baseMeasurements = SIZE_TABLE.M): Pattern {
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

  it("woven blouse bust ease is 8cm (FIT_EASE_CM.fitted.bust) and tshirt bust ease is 0cm (STRETCH_EASE_PCT.none)", () => {
    const blouseMesh = buildProofMesh(pattern(CASES[0][1], CASES[0][2]), t);
    const bustBlouse = blouseMesh.fit.find((r) => r.key === "bust");
    expect(bustBlouse?.easeCm).toBeCloseTo(8, 5);

    const tshirtMesh = buildProofMesh(pattern(CASES[1][1], CASES[1][2]), t);
    const bustTshirt = tshirtMesh.fit.find((r) => r.key === "bust");
    expect(bustTshirt?.easeCm).toBeCloseTo(0, 5);
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

  it("a blouse/tshirt/dress body shell exists, and its bust ring girth strictly exceeds the form's at the same height for a woven garment", () => {
    const mesh = buildProofMesh(pattern(CASES[0][1], CASES[0][2]), t);
    const bodyShell = mesh.garment.find((s) => s.id === "body")!;
    expect(bodyShell).toBeDefined();
    const bustRing = bodyShell.rings[0];
    expect(bustRing.girthCm).toBeGreaterThan(SIZE_TABLE.M.bust);
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
