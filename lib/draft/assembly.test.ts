import { describe, it, expect } from "vitest";
import type { GarmentSpec, Pattern, SkirtSilhouette } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { DECORATION_CASES } from "./fixtures";
import { measureSeamGraph } from "./engine/facade";
import { DEFAULT_ENGINE_ID } from "./engine/capability";
import {
  buildAssemblyOrder,
  PHASE_BY_KEY,
  type AssemblyStep,
  type AssemblySeamStep,
} from "./assembly";

// Minimal Pattern for buildAssemblyOrder -- the same fakePattern shape
// lib/draft/easeReport.test.ts uses: only spec/sizeTable/baseSize/
// pieces.length are ever read.
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

const seamSteps = (steps: AssemblyStep[]) =>
  steps.filter((s): s is AssemblySeamStep => s.kind === "seam");

describe("buildAssemblyOrder", () => {
  it("returns null for a blank pattern (no spec, no pieces)", () => {
    const p = fakePattern({
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    });
    p.spec = undefined;
    p.pieces = [];
    expect(buildAssemblyOrder(p, t)).toBeNull();
  });

  it("returns null when the pattern's sizeTable has no row for its own baseSize", () => {
    const p = fakePattern({
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    });
    p.sizeTable = {};
    expect(buildAssemblyOrder(p, t)).toBeNull();
  });

  // The AC's own invariant: every mated pair the seam graph declares appears
  // exactly once among the seam steps, and no key appears that the graph
  // doesn't have -- across the FULL drafting matrix (every garment/style
  // combination, now including trousers and dress/radial cases).
  it("contains each mated pair exactly once, and no pair that does not exist, for every DECORATION_CASES entry", () => {
    for (const [name, spec] of DECORATION_CASES) {
      const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      const p = fakePattern(spec);
      const graph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, base, t);
      const order = buildAssemblyOrder(p, t);
      expect(order, name).not.toBeNull();
      const steps = seamSteps(order!.steps);
      const stepKeys = steps.map((s) => s.key).sort();
      const graphKeys = graph.map((m) => m.key).sort();
      expect(stepKeys, name).toEqual(graphKeys);
      // No duplicates.
      expect(new Set(stepKeys).size, name).toBe(stepKeys.length);
    }
  });

  // Every key any DECORATION_CASES spec's own seam graph actually produces
  // must have a real phase -- never silently fall through to "other". A
  // future new pair (a new archetype, a new sub-piece) that forgets to
  // extend PHASE_BY_KEY would otherwise sew last with no signal at all.
  it("has a real phase for every pair key the drafting matrix produces (no silent 'other')", () => {
    const seen = new Set<string>();
    for (const [, spec] of DECORATION_CASES) {
      const base = spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
      for (const m of measureSeamGraph(DEFAULT_ENGINE_ID, spec, base, t))
        seen.add(m.key);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const key of seen) {
      expect(PHASE_BY_KEY[key], key).toBeDefined();
    }
  });

  it("darts (when any) come before every seam and hem step", () => {
    for (const [name, spec] of DECORATION_CASES) {
      const p = fakePattern(spec);
      const order = buildAssemblyOrder(p, t)!;
      const dartIdxs = order.steps
        .map((s, i) => (s.kind === "dart" ? i : -1))
        .filter((i) => i >= 0);
      const otherIdxs = order.steps
        .map((s, i) => (s.kind !== "dart" ? i : -1))
        .filter((i) => i >= 0);
      if (dartIdxs.length === 0 || otherIdxs.length === 0) continue;
      expect(Math.max(...dartIdxs), name).toBeLessThan(Math.min(...otherIdxs));
    }
  });

  it("a blouse with darts orders: darts, shoulder, sleeve (cap + underarm), side, then hems", () => {
    const spec: GarmentSpec = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "round", sleeve: "short", darts: true },
    };
    const p = fakePattern(spec);
    const order = buildAssemblyOrder(p, t)!;
    const kinds = order.steps.map((s) => (s.kind === "seam" ? s.key : s.kind));
    expect(kinds).toEqual([
      "dart", // body-front
      "dart", // body-back
      "shoulder",
      "armhole-cap",
      "sleeve-underarm",
      "side",
      "hem", // body-front
      "hem", // body-back
      "hem", // sleeve
    ]);
  });

  // #244: a standalone skirt's own pleat gets a real "pleat" step, ordered
  // before its waistband seam and its own hem -- the same "shapes the piece
  // before any seam" priority a dart already gets.
  it.each(["box", "inverted-box"] as const)(
    "a standalone %s-pleated skirt gets a 'pleat' step naming the skirt piece, before its waistband seam and hem",
    (pleats) => {
      const spec: GarmentSpec = {
        type: "skirt",
        gender: "female",
        measurementOverrides: {},
        style: { skirt: "straight", pleats },
      };
      const p = fakePattern(spec);
      const order = buildAssemblyOrder(p, t)!;
      const kinds = order.steps.map((s) =>
        s.kind === "seam" ? s.key : s.kind,
      );
      expect(kinds).toEqual(["pleat", "waistband-waist", "hem"]);
      const pleatStep = order.steps[0] as Extract<
        AssemblyStep,
        { kind: "pleat" }
      >;
      expect(pleatStep.pieceId).toBe("skirt");
      expect(pleatStep.count).toBe(2); // one per side (#244)
      // #319/#320: the waistband step's own gatherRatio is what tells a
      // consumer (lib/ai/prompt.ts) this is a fold-and-match step, not a
      // mismatch -- and it must reflect the pleat's real take-up, not 1.
      const waistbandStep = seamSteps(order.steps).find(
        (s) => s.key === "waistband-waist",
      )!;
      expect(waistbandStep.gatherRatio).toBeLessThan(1);
    },
  );

  it("a dress's bodice hem is NOT a free hem step -- it is consumed by the waist-join pair", () => {
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
    const p = fakePattern(spec);
    const order = buildAssemblyOrder(p, t)!;
    const hemPieceIds = order.steps
      .filter((s) => s.kind === "hem")
      .map((s) => s.pieceId);
    expect(hemPieceIds).not.toContain("body-front");
    expect(hemPieceIds).not.toContain("body-back");
    const seamKeys = seamSteps(order.steps).map((s) => s.key);
    expect(seamKeys).toContain("waist-join-front");
    expect(seamKeys).toContain("waist-join-back");
  });

  it("a cuffed sleeve's hem is NOT a free hem step -- it is consumed by the cuff-hem pair", () => {
    const spec: GarmentSpec = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "long",
        darts: true,
        cuff: "straight",
      },
    };
    const p = fakePattern(spec);
    const order = buildAssemblyOrder(p, t)!;
    const hemPieceIds = order.steps
      .filter((s) => s.kind === "hem")
      .map((s) => s.pieceId);
    expect(hemPieceIds).not.toContain("sleeve");
    const seamKeys = seamSteps(order.steps).map((s) => s.key);
    expect(seamKeys).toContain("cuff-hem");
  });

  it("trousers always dart both panels, and order: darts, rise (self-pairs), inseam/outseam, waistband, then hems (#188)", () => {
    const spec: GarmentSpec = {
      type: "trousers",
      gender: "female",
      measurementOverrides: {},
      style: {},
    };
    const p = fakePattern(spec);
    const order = buildAssemblyOrder(p, t)!;
    const kinds = order.steps.map((s) => (s.kind === "seam" ? s.key : s.kind));
    expect(kinds).toEqual([
      "dart",
      "dart",
      "trouser-front-rise",
      "trouser-back-rise",
      "trouser-inseam",
      "trouser-outseam",
      "trouser-waistband-waist",
      "hem",
      "hem",
    ]);
    // #188: each leg's own hem is a free finishing edge -- the waistband
    // pair claims `waist`, never `hem` -- so both panels report a real
    // "hem" step, in drafting order (front, then back).
    const hemSteps = order.steps.filter(
      (s): s is Extract<AssemblyStep, { kind: "hem" }> => s.kind === "hem",
    );
    expect(hemSteps.map((s) => s.pieceId)).toEqual([
      "trouser-front",
      "trouser-back",
    ]);
    for (const s of hemSteps) expect(s.lengthCm).toBeGreaterThan(0);

    // #319: the waistband step carries the take-up ratio the panels'
    // own dart declares -- a consumer phrasing this step (lib/ai/prompt.ts)
    // reads it to say "fold the dart first, then the two match" rather
    // than describing a mismatch.
    const waistbandStep = seamSteps(order.steps).find(
      (s) => s.key === "trouser-waistband-waist",
    )!;
    expect(waistbandStep.gatherRatio).toBeLessThan(1);
  });

  it("a standalone skirt with waistband explicitly 'none' still hems its own bottom edge (#188) -- only the waistband pair is absent", () => {
    const spec: GarmentSpec = {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "straight", waistband: "none" },
    };
    const p = fakePattern(spec);
    const order = buildAssemblyOrder(p, t)!;
    // No darts, no waistband, no other mated pair -- but the skirt panel's
    // own bottom hem is a free finishing edge regardless, so the order is
    // one real hem step, not the empty array this exact spec derived before
    // seamEdges.hem existed for skirt panels.
    expect(order.steps).toHaveLength(1);
    const [step] = order.steps as [Extract<AssemblyStep, { kind: "hem" }>];
    expect(step.kind).toBe("hem");
    expect(step.pieceId).toBe("skirt");
    expect(step.lengthCm).toBeGreaterThan(0);
    expect(order.hasConflict).toBe(false);
  });

  it("a skirt panel hems its own bottom edge across every silhouette, standalone and as a dress's skirt panel (#188)", () => {
    const silhouettes: SkirtSilhouette[] = [
      "straight",
      "a-line",
      "circle",
      "gore",
      "half-circle",
    ];
    for (const skirt of silhouettes) {
      for (const type of ["skirt", "dress"] as const) {
        const spec: GarmentSpec = {
          type,
          gender: "female",
          measurementOverrides: {},
          style:
            type === "dress"
              ? { neckline: "round", sleeve: "short", darts: true, skirt }
              : { skirt },
        };
        const p = fakePattern(spec);
        const order = buildAssemblyOrder(p, t)!;
        const skirtHem = order.steps.find(
          (s): s is Extract<AssemblyStep, { kind: "hem" }> =>
            s.kind === "hem" && s.pieceId === "skirt",
        );
        expect(skirtHem, `${type} ${skirt}`).toBeDefined();
        expect(skirtHem!.lengthCm, `${type} ${skirt}`).toBeGreaterThan(0);
        // For a dress, the BODICE's own hem stays consumed by the waist
        // join (unaffected by #188) -- only the skirt panel's own bottom
        // gets a free "hem" step.
        if (type === "dress") {
          const hemPieceIds = order.steps
            .filter((s) => s.kind === "hem")
            .map((s) => s.pieceId);
          expect(hemPieceIds, `${type} ${skirt}`).not.toContain("body-front");
          expect(hemPieceIds, `${type} ${skirt}`).not.toContain("body-back");
        }
      }
    }
  });

  it("hasConflict is false across the whole matrix (every DECORATION_CASES entry closes as designed)", () => {
    for (const [name, spec] of DECORATION_CASES) {
      const p = fakePattern(spec);
      const order = buildAssemblyOrder(p, t)!;
      expect(order.hasConflict, name).toBe(false);
      for (const s of seamSteps(order.steps)) {
        expect(s.diverges, `${name}: ${s.key}`).toBe(false);
      }
    }
  });

  it("hasConflict is true, and only the armhole-cap step diverges, when armholeDeepenCm is applied without a refit", () => {
    const spec: GarmentSpec = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", armholeDeepenCm: 3 },
    };
    const p = fakePattern(spec);
    const order = buildAssemblyOrder(p, t)!;
    expect(order.hasConflict).toBe(true);
    const steps = seamSteps(order.steps);
    const armholeCap = steps.find((s) => s.key === "armhole-cap")!;
    expect(armholeCap.diverges).toBe(true);
    expect(armholeCap.diffCm).toBeGreaterThan(1);
    for (const s of steps.filter((s) => s.key !== "armhole-cap")) {
      expect(s.diverges, s.key).toBe(false);
    }
  });

  it("cites the intended ease and the two measured lengths for the armhole/cap seam", () => {
    const spec: GarmentSpec = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short" },
    };
    const p = fakePattern(spec);
    const order = buildAssemblyOrder(p, t)!;
    const cap = seamSteps(order.steps).find((s) => s.key === "armhole-cap")!;
    expect(cap.easeCm).toBeGreaterThan(0); // CAP_EASE_CM.woven
    expect(cap.aLenCm).toBeGreaterThan(0);
    expect(cap.bLenCm).toBeGreaterThan(0);
    // fakePattern's stub `pieces` list has no id matching the real drafted
    // pieces -- see pieceDisplayName's own fallback below for what happens
    // when a real one does.
    expect(cap.aPieceId).toBe("body-front");
    expect(cap.bPieceId).toBe("sleeve");
  });

  it("resolves each step's piece name from the pattern's OWN persisted piece list, not a fresh redraft", () => {
    const spec: GarmentSpec = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short" },
    };
    const p = fakePattern(spec);
    // A real pattern's `pieces` carries the draft-time-resolved display
    // names (CLAUDE.md's "locale snapshot" precedent) -- buildAssemblyOrder
    // must read THOSE, matched by id, not invent its own via a second
    // resolution.
    p.pieces = [
      {
        id: "body-front",
        name: "Frente",
        qty: 1,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
      {
        id: "body-back",
        name: "Costas",
        qty: 1,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
      {
        id: "sleeve",
        name: "Manga",
        qty: 2,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
    ];
    const order = buildAssemblyOrder(p, t)!;
    const cap = seamSteps(order.steps).find((s) => s.key === "armhole-cap")!;
    expect(cap.aPieceName).toBe("Frente");
    expect(cap.bPieceName).toBe("Manga");
    const shoulder = seamSteps(order.steps).find((s) => s.key === "shoulder")!;
    expect(shoulder.aPieceName).toBe("Frente");
    expect(shoulder.bPieceName).toBe("Costas");
  });

  it("falls back to the bare pieceId when the pattern's own piece list has no matching id, rather than crashing or inventing one", () => {
    const spec: GarmentSpec = {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short" },
    };
    const p = fakePattern(spec); // stub pieces: [{id: "x", ...}]
    const order = buildAssemblyOrder(p, t)!;
    const cap = seamSteps(order.steps).find((s) => s.key === "armhole-cap")!;
    expect(cap.aPieceName).toBe("body-front");
    expect(cap.bPieceName).toBe("sleeve");
  });
});
