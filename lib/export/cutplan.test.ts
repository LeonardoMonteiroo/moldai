import { describe, it, expect } from "vitest";
import {
  planCutLayout,
  packShelf,
  packSkyline,
  clampOriginCm,
  overlappingInstanceIds,
  cutInstancesFromModel,
  layoutLengthCm,
  FABRIC_WIDTHS_CM,
  type CutInstance,
} from "./cutplan";
import { buildExportModel } from "./model";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { DECORATION_CASES } from "@/lib/draft/fixtures";
import type { GarmentSpec } from "@/lib/types";
import { t } from "@/lib/i18n/test-translate";

function patternFromSpec(spec: GarmentSpec): Pattern {
  const isFemale = spec.gender === "female";
  return {
    id: "p-spec",
    name: "Fixture",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: isFemale ? SIZE_TABLE.M : SIZE_TABLE_MALE.M },
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

// #8 AC: "strictly better on at least one real garment" -- measured across
// the full DECORATION_CASES x FABRIC_WIDTHS_CM grid against this codebase's
// current drafters, the male t-shirt at 160cm is where skyline's advantage
// is largest (two body panels + two sleeves, shelf stacks the sleeves under
// the bodies; skyline tucks one sleeve into the gap beside them instead):
// shelf 117.65cm -> skyline 80.81cm, a ~31% reduction.
function tshirtMalePattern(): Pattern {
  return patternFromSpec({
    type: "tshirt",
    gender: "male",
    measurementOverrides: {},
    style: {},
  });
}

function rawInstancesFor(model: ReturnType<typeof buildExportModel>) {
  return cutInstancesFromModel(model);
}

function layoutLenOf(placed: CutInstance[]) {
  return layoutLengthCm(placed);
}

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

  // #8: mode defaults to "auto" -- the best of packShelf and packSkyline.
  // Never worse than the shelf-only length, for every garment fixture x
  // every FABRIC_WIDTHS_CM preset.
  it("auto mode is never worse than shelf-only, across the drafting matrix", () => {
    for (const [, spec] of DECORATION_CASES) {
      const pat = patternFromSpec(spec);
      for (const w of FABRIC_WIDTHS_CM) {
        const model = buildExportModel(pat, t);
        const raw = rawInstancesFor(model);
        const shelfLen = layoutLenOf(packShelf(raw, w).placed);
        const autoLen = planCutLayout(pat, w, t, { mode: "auto" }).lengthCm;
        expect(autoLen).toBeLessThanOrEqual(shelfLen + 1e-6);
      }
    }
  });

  it("auto mode is strictly smaller than shelf-only for a real garment (male t-shirt at 160cm)", () => {
    const pat = tshirtMalePattern();
    const model = buildExportModel(pat, t);
    const raw = rawInstancesFor(model);
    const shelfLen = layoutLenOf(packShelf(raw, 160).placed);
    const autoLen = planCutLayout(pat, 160, t, { mode: "auto" }).lengthCm;
    expect(autoLen).toBeLessThan(shelfLen - 1e-6);
    // a meaningful improvement, not a rounding artifact -- measured ~31%
    expect(autoLen).toBeLessThan(shelfLen * 0.85);
  });

  it("width-monotonicity also holds for auto mode", () => {
    const narrow = planCutLayout(fakePattern(), 140, t, {
      mode: "auto",
    }).lengthCm;
    const wide = planCutLayout(fakePattern(), 160, t, {
      mode: "auto",
    }).lengthCm;
    expect(narrow).toBeGreaterThanOrEqual(wide - 1e-6);
  });

  describe("manual mode", () => {
    it("an unknown id in placements is ignored; a missing instance keeps its auto origin", () => {
      const pat = fakePattern();
      const auto = planCutLayout(pat, 150, t, { mode: "auto" });
      const firstId = auto.instances[0].id;
      const manual = planCutLayout(pat, 150, t, {
        mode: "manual",
        placements: {
          "not-a-real-id": { x: 5, y: 5 },
          [firstId]: { x: 1, y: 1 },
        },
      });
      const movedInstance = manual.instances.find((i) => i.id === firstId)!;
      expect(movedInstance.originCm).toEqual({ x: 1, y: 1 });
      const untouched = manual.instances.filter((i) => i.id !== firstId);
      const autoUntouched = auto.instances.filter((i) => i.id !== firstId);
      expect(untouched.map((i) => i.originCm)).toEqual(
        autoUntouched.map((i) => i.originCm),
      );
    });

    it("a manual placement is clamped inside the fabric width", () => {
      const pat = fakePattern();
      const auto = planCutLayout(pat, 150, t, { mode: "auto" });
      const firstId = auto.instances[0].id;
      const manual = planCutLayout(pat, 150, t, {
        mode: "manual",
        placements: { [firstId]: { x: 10000, y: -50 } },
      });
      const moved = manual.instances.find((i) => i.id === firstId)!;
      expect(moved.originCm.x).toBeLessThanOrEqual(150 - moved.widthCm + 1e-9);
      expect(moved.originCm.y).toBeGreaterThanOrEqual(0);
    });

    it("overlapping manual placements are reported, not corrected", () => {
      const pat = fakePattern();
      const auto = planCutLayout(pat, 150, t, { mode: "auto" });
      if (auto.instances.length < 2) return; // guard, t-shirt always has >=2
      const [a, b] = auto.instances;
      const manual = planCutLayout(pat, 150, t, {
        mode: "manual",
        placements: { [a.id]: { x: 5, y: 5 }, [b.id]: { x: 5, y: 5 } },
      });
      expect(manual.overlaps).toContain(a.id);
      expect(manual.overlaps).toContain(b.id);
    });

    it("auto mode never reports an overlap", () => {
      const plan = planCutLayout(fakePattern(), 150, t, { mode: "auto" });
      expect(plan.overlaps).toEqual([]);
    });
  });
});

describe("packSkyline", () => {
  function rect(id: string, w: number, h: number): CutInstance {
    return {
      id,
      name: id,
      outline: { start: { x: 0, y: 0 }, segs: [] },
      widthCm: w,
      heightCm: h,
      originCm: { x: 0, y: 0 },
    };
  }

  it("packs synthetic rectangles with no overlap and no out-of-width placement", () => {
    const instances = [
      rect("a", 40, 60),
      rect("b", 40, 20),
      rect("c", 30, 50),
      rect("d", 60, 10),
      rect("e", 10, 10),
    ];
    const { placed } = packSkyline(instances, 150);
    for (const it of placed) {
      expect(it.originCm.x).toBeGreaterThanOrEqual(0);
      expect(it.originCm.x + it.widthCm).toBeLessThanOrEqual(150 + 1e-6);
    }
    expect(overlappingInstanceIds(placed)).toEqual([]);
  });

  it("is deterministic across two calls on the same input", () => {
    const instances = [
      rect("a", 40, 60),
      rect("b", 40, 20),
      rect("c", 30, 50),
      rect("d", 60, 10),
    ];
    const first = packSkyline(instances, 150).placed;
    const second = packSkyline(instances, 150).placed;
    expect(first.map((i) => i.originCm)).toEqual(second.map((i) => i.originCm));
  });

  it("raises overflow for a copy wider than the fabric", () => {
    const instances = [rect("a", 200, 10)];
    const { overflow } = packSkyline(instances, 150);
    expect(overflow).toBe(true);
  });
});

describe("clampOriginCm", () => {
  it("pins x at 0 and at fabricWidthCm - widthCm", () => {
    const size = { widthCm: 20, heightCm: 10 };
    expect(clampOriginCm({ x: -5, y: 3 }, size, 150)).toEqual({ x: 0, y: 3 });
    expect(clampOriginCm({ x: 1000, y: 3 }, size, 150)).toEqual({
      x: 130,
      y: 3,
    });
  });

  it("pins y at 0 and clamps a too-wide piece's x to 0 rather than going negative", () => {
    const size = { widthCm: 200, heightCm: 10 };
    expect(clampOriginCm({ x: 50, y: -20 }, size, 150)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("overlappingInstanceIds", () => {
  function at(id: string, x: number, y: number, w = 10, h = 10): CutInstance {
    return {
      id,
      name: id,
      outline: { start: { x: 0, y: 0 }, segs: [] },
      widthCm: w,
      heightCm: h,
      originCm: { x, y },
    };
  }

  it("returns both ids of a deliberately overlapped pair, [] for a disjoint layout", () => {
    expect(overlappingInstanceIds([at("a", 0, 0), at("b", 5, 5)])).toEqual([
      "a",
      "b",
    ]);
    expect(overlappingInstanceIds([at("a", 0, 0), at("b", 20, 0)])).toEqual([]);
  });
});
