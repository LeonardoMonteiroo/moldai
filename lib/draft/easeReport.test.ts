import { describe, it, expect } from "vitest";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { wearingEaseCm } from "./ease";
import { DECORATION_CASES } from "./fixtures";
import { buildEaseReport, GIRTHS } from "./easeReport";

// Minimal Pattern for buildEaseReport -- it only reads spec/sizeTable/
// baseSize/pieces.length (the AC's own "works for a pattern drafted before
// the feature existed" requirement: no new blob key, so a stub with just
// these four fields is a legitimate fixture, not a shortcut).
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
    // buildEaseReport only checks pieces.length -- a single stub entry is
    // enough to signal "already drafted" without needing the real Piece
    // shape this module never reads.
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

const blouseSpec: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: { neckline: "round", sleeve: "short", darts: true },
};

describe("buildEaseReport", () => {
  it("returns null for a blank pattern (no spec, no pieces)", () => {
    const p = fakePattern(blouseSpec);
    p.spec = undefined;
    p.pieces = [];
    expect(buildEaseReport(p, t)).toBeNull();
  });

  it("returns null when the pattern's sizeTable has no row for its own baseSize", () => {
    const p = fakePattern(blouseSpec);
    p.sizeTable = {};
    expect(buildEaseReport(p, t)).toBeNull();
  });

  // The acceptance criterion's own assertion: the finished bust girth of a
  // female-M blouse equals 4x halfChest (lib/draft/body.ts's own quarter-
  // chest width, front === back by construction) within 0.2cm. halfChest
  // isn't exported, so it's rebuilt here from the one formula body.ts's own
  // comments document (bust/4 + wearingEaseCm/4) -- the same number
  // wearingEaseCm already independently verifies against FIT_EASE_CM.
  it("female-M blouse: finished bust girth equals 4 x halfChest within 0.2cm", () => {
    const report = buildEaseReport(fakePattern(blouseSpec), t);
    const bust = SIZE_TABLE.M.bust;
    const ease = wearingEaseCm(blouseSpec.style, false, bust);
    const halfChest = bust / 4 + ease / 4;
    const bustEntry = report!.girths.find((g) => g.girth === "bust")!;
    expect(Math.abs(bustEntry.finishedCm - 4 * halfChest)).toBeLessThan(0.2);
  });

  it("reports a positive bust ease near the fitted default (~8cm) for the default fitted blouse", () => {
    const report = buildEaseReport(fakePattern(blouseSpec), t);
    const bustEntry = report!.girths.find((g) => g.girth === "bust")!;
    expect(bustEntry.bodyCm).toBe(SIZE_TABLE.M.bust);
    expect(bustEntry.diffCm).toBeCloseTo(8, 0);
    expect(bustEntry.fitClass).toBe("fitted");
  });

  it("reports negative ease for a stretchy knit, not an error", () => {
    const spec: GarmentSpec = {
      type: "tshirt",
      gender: "female",
      measurementOverrides: {},
      style: { stretch: "high" },
    };
    const report = buildEaseReport(fakePattern(spec), t);
    const bustEntry = report!.girths.find((g) => g.girth === "bust")!;
    expect(bustEntry.diffCm).toBeLessThan(0);
    expect(bustEntry.fitClass).toBe("close");
  });

  it("reports cap ease from the same seam graph seamCheck reads, absent for a sleeveless spec", () => {
    const withSleeve = buildEaseReport(fakePattern(blouseSpec), t)!;
    expect(withSleeve.cap).toBeDefined();
    expect(withSleeve.cap!.capArcCm).toBeGreaterThan(0);
    expect(withSleeve.cap!.easeCm).toBeCloseTo(
      withSleeve.cap!.capArcCm - withSleeve.cap!.armholeArcCm,
      5,
    );

    const sleeveless: GarmentSpec = {
      ...blouseSpec,
      style: { ...blouseSpec.style, sleeve: "none" },
    };
    const withoutSleeve = buildEaseReport(fakePattern(sleeveless), t)!;
    expect(withoutSleeve.cap).toBeUndefined();
  });

  it("trousers: no bust panel -- reported as unavailable, never a misleading zero", () => {
    const spec: GarmentSpec = {
      type: "trousers",
      gender: "female",
      measurementOverrides: {},
      style: {},
    };
    const report = buildEaseReport(fakePattern(spec), t)!;
    expect(report.girths.some((g) => g.girth === "bust")).toBe(false);
    expect(report.unavailable).toContainEqual({
      girth: "bust",
      reason: "noPanel",
    });
  });

  // trouserPanel's own waist dart is sized to remove exactly
  // (hipQuarterCm - waistQuarterRawCm) from the flat panel -- so the
  // FINISHED waist should read back at (approximately) the body's own
  // waist measurement, while hip (pre-dart, the panel's undarted seat
  // width) is measurably wider, carrying the trousers' own wearing ease.
  it("trousers: waist reads back near the body's own waist, hip is wider (pre-dart)", () => {
    const spec: GarmentSpec = {
      type: "trousers",
      gender: "female",
      measurementOverrides: {},
      style: {},
    };
    const report = buildEaseReport(fakePattern(spec), t)!;
    const waist = report.girths.find((g) => g.girth === "waist")!;
    const hip = report.girths.find((g) => g.girth === "hip")!;
    expect(waist.finishedCm).toBeCloseTo(SIZE_TABLE.M.waist, 0);
    expect(hip.finishedCm).toBeGreaterThan(waist.finishedCm);
    expect(hip.bodyCm).toBe(SIZE_TABLE.M.hip);
  });

  it("skirt: bust unavailable, waist from the real waist seam, hip from a height scan for a straight silhouette", () => {
    const spec: GarmentSpec = {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "straight" },
    };
    const report = buildEaseReport(fakePattern(spec), t)!;
    expect(report.unavailable).toContainEqual({
      girth: "bust",
      reason: "noPanel",
    });
    const waist = report.girths.find((g) => g.girth === "waist")!;
    const hip = report.girths.find((g) => g.girth === "hip")!;
    expect(waist.finishedCm).toBeGreaterThan(0);
    expect(hip.finishedCm).toBeGreaterThan(0);
  });

  it("skirt: hip is unavailable (unsupportedSilhouette) for a circle skirt, but waist is still measured", () => {
    const spec: GarmentSpec = {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "circle" },
    };
    const report = buildEaseReport(fakePattern(spec), t)!;
    expect(report.unavailable).toContainEqual({
      girth: "hip",
      reason: "unsupportedSilhouette",
    });
    expect(report.girths.some((g) => g.girth === "hip")).toBe(false);
    expect(report.girths.some((g) => g.girth === "waist")).toBe(true);
  });

  it("dress: bust/waist come from the bodice, hip from the skirt panel", () => {
    const spec: GarmentSpec = {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        skirt: "a-line",
      },
    };
    const report = buildEaseReport(fakePattern(spec), t)!;
    expect(report.girths.map((g) => g.girth).sort()).toEqual([
      "bust",
      "hip",
      "waist",
    ]);
    expect(report.unavailable).toHaveLength(0);
  });

  // Every case in the shared drafting matrix must produce a report where
  // every girth is EITHER measured OR explicitly marked unavailable, never
  // both and never neither -- the report's own completeness invariant.
  it("every girth is accounted for (measured xor unavailable) across the full drafting matrix", () => {
    for (const [label, spec] of DECORATION_CASES) {
      const report = buildEaseReport(fakePattern(spec), t);
      expect(report, label).not.toBeNull();
      const measured = new Set(report!.girths.map((g) => g.girth));
      const skipped = new Set(report!.unavailable.map((u) => u.girth));
      for (const girth of GIRTHS) {
        const inMeasured = measured.has(girth);
        const inSkipped = skipped.has(girth);
        expect(inMeasured !== inSkipped, `${label}: ${girth}`).toBe(true);
      }
      // Every finished/body/diff number is a real, finite value -- no NaN
      // or Infinity leaking out of a mis-scanned height.
      for (const g of report!.girths) {
        expect(Number.isFinite(g.finishedCm), `${label}: ${g.girth}`).toBe(
          true,
        );
        expect(Number.isFinite(g.bodyCm), `${label}: ${g.girth}`).toBe(true);
        expect(Number.isFinite(g.diffCm), `${label}: ${g.girth}`).toBe(true);
        expect(Number.isFinite(g.diffPct), `${label}: ${g.girth}`).toBe(true);
      }
    }
  });

  it("#223: a front-closure blouse reports the same bust/waist/hip ease as the equivalent whole-front blouse", () => {
    const withoutClosure = buildEaseReport(fakePattern(blouseSpec), t)!;
    const withClosure = buildEaseReport(
      fakePattern({
        ...blouseSpec,
        style: { ...blouseSpec.style, frontClosure: "buttonStand" },
      }),
      t,
    )!;
    expect(withoutClosure).not.toBeNull();
    expect(withClosure).not.toBeNull();
    expect(withClosure.girths.map((g) => g.finishedCm)).toEqual(
      withoutClosure.girths.map((g) => g.finishedCm),
    );
  });
});
