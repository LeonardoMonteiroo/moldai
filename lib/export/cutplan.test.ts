import { describe, it, expect } from "vitest";
import { planCutLayout } from "./cutplan";
import { buildExportModel } from "./model";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";

function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE_MALE.M },
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
    spec: {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: { seamAllowanceCm: 1 },
    },
  };
}

// #89: a half-circle panel's flat width grows with (waist/π + length), not
// with waist alone -- it genuinely exceeds the shipped fabric-width presets
// at ordinary measurements, unlike a body/sleeve piece.
function halfCircleSkirtPattern(): Pattern {
  return {
    id: "p2",
    name: "Saia Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE.M },
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
    spec: {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "half-circle", seamAllowanceCm: 1 },
    },
  };
}

describe("planCutLayout", () => {
  it("expands the pieces by their cut quantity", () => {
    const pat = fakePattern();
    const qtySum = buildExportModel(pat, t).pieces.reduce(
      (s, p) => s + p.qty,
      0,
    );
    const plan = planCutLayout(pat, 150, t);
    expect(plan.instances.length).toBe(qtySum);
    expect(qtySum).toBeGreaterThanOrEqual(2); // t-shirt = front/back/sleeve(s)
  });

  it("all copies fit within the fabric width, no overflow", () => {
    const plan = planCutLayout(fakePattern(), 150, t);
    expect(plan.overflow).toBe(false);
    for (const it of plan.instances) {
      expect(it.originCm.x).toBeGreaterThanOrEqual(0);
      expect(it.originCm.x + it.widthCm).toBeLessThanOrEqual(
        plan.fabricWidthCm + 1e-6,
      );
    }
  });

  it("no copy overlaps another (disjoint rectangles)", () => {
    const { instances } = planCutLayout(fakePattern(), 150, t);
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        const a = instances[i];
        const b = instances[j];
        const disjoint =
          a.originCm.x + a.widthCm <= b.originCm.x + 1e-6 ||
          b.originCm.x + b.widthCm <= a.originCm.x + 1e-6 ||
          a.originCm.y + a.heightCm <= b.originCm.y + 1e-6 ||
          b.originCm.y + b.heightCm <= a.originCm.y + 1e-6;
        expect(disjoint).toBe(true);
      }
    }
  });

  // #123: `outlineBBox`/`shiftOutline` re-zero the cut line to its own bbox
  // before packing -- without that, GAP_CM (3cm, tighter than
  // buildExportModel's own 8cm) is measured between *nominal* cursor
  // positions rather than the actual drawn shapes, and a mitred convex
  // corner's growth (observed up to ~4-5cm per side at the max allowance,
  // against the real drafting matrix) can close that gap entirely.
  it("no copy overlaps another at the maximum seam allowance either", () => {
    const pat = fakePattern();
    pat.spec!.style = { seamAllowanceCm: 4 }; // STYLE_LIMITS.seamAllowanceCm.max
    const { instances } = planCutLayout(pat, 150, t);
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        const a = instances[i];
        const b = instances[j];
        const disjoint =
          a.originCm.x + a.widthCm <= b.originCm.x + 1e-6 ||
          b.originCm.x + b.widthCm <= a.originCm.x + 1e-6 ||
          a.originCm.y + a.heightCm <= b.originCm.y + 1e-6 ||
          b.originCm.y + b.heightCm <= a.originCm.y + 1e-6;
        expect(disjoint).toBe(true);
      }
    }
  });

  it("length and usage are coherent; efficiency is in (0,1]", () => {
    const plan = planCutLayout(fakePattern(), 150, t);
    expect(plan.lengthCm).toBeGreaterThan(0);
    expect(plan.efficiency).toBeGreaterThan(0);
    expect(plan.efficiency).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("a narrower fabric consumes length >= a wider fabric", () => {
    const narrow = planCutLayout(fakePattern(), 140, t).lengthCm;
    const wide = planCutLayout(fakePattern(), 160, t).lengthCm;
    expect(narrow).toBeGreaterThanOrEqual(wide - 1e-6);
  });

  // #123: nests the cut line (with seam allowance), not the net line -- a
  // larger allowance has to consume more fabric, not the same amount as a
  // pattern with none.
  it("a pattern with a larger seam allowance consumes more fabric length", () => {
    const noAllowance = fakePattern();
    noAllowance.spec!.style = { seamAllowanceCm: 0 };
    const withAllowance = fakePattern();
    withAllowance.spec!.style = { seamAllowanceCm: 4 }; // STYLE_LIMITS max
    const a = planCutLayout(noAllowance, 150, t);
    const b = planCutLayout(withAllowance, 150, t);
    expect(b.lengthCm).toBeGreaterThan(a.lengthCm);
    expect(b.usedAreaCm2).toBeGreaterThan(a.usedAreaCm2);
  });

  // #89: efficiency's contract is (0,1], but nothing stopped a piece wider
  // than the usable fabric from being packed (and counted in usedAreaCm2)
  // anyway -- a half-circle skirt on the shipped 140cm preset genuinely
  // overflows, and used to report efficiency > 1 (up to 1.218 measured).
  it("a half-circle skirt overflows the 140cm preset, and efficiency stays honest", () => {
    const plan = planCutLayout(halfCircleSkirtPattern(), 140, t);
    expect(plan.overflow).toBe(true);
    expect(plan.efficiency).toBeGreaterThan(0);
    expect(plan.efficiency).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("a deliberately narrow fabric width overflows a normal piece, and efficiency stays honest", () => {
    const plan = planCutLayout(fakePattern(), 10, t);
    expect(plan.overflow).toBe(true);
    expect(plan.efficiency).toBeGreaterThan(0);
    expect(plan.efficiency).toBeLessThanOrEqual(1 + 1e-9);
  });
});
