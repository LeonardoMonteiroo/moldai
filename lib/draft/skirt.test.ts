import { describe, it, expect } from "vitest";
import { SIZE_TABLE } from "@/lib/measurements";
import { curveArcLengthCm } from "./core";
import {
  draftSkirt,
  dressWaistHalfCm,
  PLEAT_INTAKE_PER_SIDE_CM,
} from "./skirt";
import { bbox } from "./core";
import { t } from "@/lib/i18n/test-translate";
import type { InternalCm } from "./core";

const M = SIZE_TABLE.M;

describe("draftSkirt", () => {
  it("straight generates a trapezoid (6 vertices: 4 corners + 2 fold-edge midpoints) and viewBox > 0", () => {
    const s = draftSkirt(M, { skirt: "straight" }, t);
    expect(s.outlineCm.length).toBe(6);
    expect(bbox(s.outlineCm).w).toBeGreaterThan(0);
  });
  it("radial (circle) marks the waist and hem as curvedSpans", () => {
    const s = draftSkirt(M, { skirt: "circle" }, t);
    expect((s.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("circle: radius is waist/2π, cut into 2 panels (each a half-circle)", () => {
    const dp = draftSkirt(M, { skirt: "circle", skirtLengthCm: 60 }, t);
    // metadata exposed in the detail rows: waist radius
    const raioRow = dp.detailRows.find((r) => r.label === "rows.waistRadius");
    expect(raioRow).toBeTruthy();
    const raio = parseFloat(raioRow!.value.replace(",", "."));
    expect(raio).toBeCloseTo(74 / (2 * Math.PI), 0);
    expect(dp.qty).toBe(2);
  });

  // #77: `denom` (the radius formula's divisor) and each panel's angular
  // sweep were previously computed from the same value, so the assembled
  // waist opening had nothing to do with the panel count and never matched
  // the actual waist measurement. This single invariant -- the polyline
  // length of the waist edge (indices [0, steps], the same span
  // `curvedSpans`' waistSpan marks) summed across every panel -- is the
  // guard: it holds regardless of how panels/radius are computed
  // internally, as long as the assembled skirt actually fits the waist it
  // was drafted for. A 12-segment polyline chord-approximates the true arc
  // slightly short, so the tolerance below is not exact equality.
  it.each([
    ["circle", 2],
    ["gore", 2],
    ["half-circle", 1],
  ] as const)(
    "%s: the assembled waist opening across all %i panel(s) equals the waist measurement",
    (skirt, expectedPanels) => {
      const dp = draftSkirt(M, { skirt, skirtLengthCm: 60 }, t);
      expect(dp.qty).toBe(expectedPanels);
      const steps = 12; // waistSpan is [0, steps] in draftSkirt
      let panelArcLength = 0;
      for (let i = 0; i < steps; i++) {
        const [x0, y0] = dp.outlineCm[i];
        const [x1, y1] = dp.outlineCm[i + 1];
        panelArcLength += Math.hypot(x1 - x0, y1 - y0);
      }
      const waistOpening = panelArcLength * (dp.qty ?? expectedPanels);
      expect(waistOpening).toBeCloseTo(M.waist, 0);
    },
  );
  it("godet has a wider hem than straight", () => {
    const reta = draftSkirt(M, { skirt: "straight", skirtLengthCm: 60 }, t);
    const gode = draftSkirt(M, { skirt: "gore", skirtLengthCm: 60 }, t);
    expect(bbox(gode.outlineCm).w).toBeGreaterThan(bbox(reta.outlineCm).w);
  });
  it("length respects skirtLengthCm", () => {
    const curta = draftSkirt(M, { skirt: "straight", skirtLengthCm: 40 }, t);
    const longa = draftSkirt(M, { skirt: "straight", skirtLengthCm: 90 }, t);
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });

  // #80: seamAllowanceCm used to be added straight into the waist panel's
  // half-width (m.hip/4 + ease), so a user asking for a wider seam allowance
  // silently widened the finished waist opening -- while CLAUDE.md states
  // exported geometry is the net sewing line, seam allowance annotated but
  // never offset into it. The straight/A-line trapezoid is the only branch
  // that ever read `ease`; the radial silhouettes never did.
  it("seamAllowanceCm changes only the annotation, never the drafted outline", () => {
    const s0 = draftSkirt(M, { skirt: "straight", seamAllowanceCm: 0 }, t);
    const s4 = draftSkirt(M, { skirt: "straight", seamAllowanceCm: 4 }, t);
    expect(s4.outlineCm).toEqual(s0.outlineCm);
    const row = (dp: typeof s0) =>
      dp.detailRows.find((r) => r.label === "rows.seamAllowance")?.value;
    expect(row(s0)).not.toBe(row(s4)); // the annotation itself still differs
  });
});

// #124: notches by convention.
describe("notches (#124)", () => {
  it.each(["straight", "a-line", "circle", "gore", "half-circle"] as const)(
    "%s: gets only a single hem-fold notch when not a dress waist",
    (skirt) => {
      const dp = draftSkirt(M, { skirt }, t);
      expect(dp.notches).toHaveLength(1);
      expect(dp.notches![0].type).toBe("single");
    },
  );

  it.each(["straight", "a-line", "circle", "gore", "half-circle"] as const)(
    "%s: a dress waist adds two double waist-join notches at the outer corners",
    (skirt) => {
      const dp = draftSkirt(M, { skirt }, t, true);
      expect(dp.notches).toHaveLength(3);
      const types = dp.notches!.map((n) => n.type);
      expect(types).toEqual(["single", "double", "double"]);
    },
  );

  it("straight: the waist-join notches sit on the waist edge, the hem-fold on the hem edge", () => {
    const dp = draftSkirt(M, { skirt: "straight" }, t, true);
    const [hemFold, waistL, waistR] = dp.notches!;
    const b = bbox(dp.outlineCm);
    expect(hemFold.outerCm[1]).toBeCloseTo(b.maxY, 5);
    expect(waistL.outerCm[1]).toBeCloseTo(b.minY, 5);
    expect(waistR.outerCm[1]).toBeCloseTo(b.minY, 5);
    expect(waistL.outerCm[0]).not.toBeCloseTo(waistR.outerCm[0], 1);
  });
});

// #177/#185: dressWaistHalfCm is the ONE derivation the dress bodice hem
// (body.ts, via garment.ts) and every dress-mode skirt panel's own waist
// sizing (below) both read -- silhouette-independent, waistCm/4.
describe("dressWaistHalfCm (#177)", () => {
  it("is silhouette-independent: waistCm / 4, with no added ease", () => {
    expect(dressWaistHalfCm(74)).toBeCloseTo(18.5, 5);
    expect(dressWaistHalfCm(100)).toBeCloseTo(25, 5);
  });

  it.each(["straight", "a-line", "circle", "gore", "half-circle"] as const)(
    "%s: a dress-mode skirt panel's own drafted waist width matches dressWaistHalfCm(waist) * 2",
    (skirt) => {
      const dp = draftSkirt(M, { skirt }, t, true);
      const expectedWidthCm = dressWaistHalfCm(M.waist) * 2;
      if (skirt === "straight" || skirt === "a-line") {
        // straight-edge waist, indices [0, 2] -- see draftSkirt's own outline comment.
        const [wL] = dp.outlineCm[0];
        const [wR] = dp.outlineCm[2];
        expect(wR - wL).toBeCloseTo(expectedWidthCm, 1);
      } else if (skirt === "half-circle") {
        // #185: a single undivided panel -- its own waistFront/waistBack
        // halves must each equal dressWaistHalfCm(waist), and TOGETHER
        // equal the panel's one full waist arc (the actual waist).
        const [frontEdge, backEdge] = [
          dp.seamEdges!.waistFront,
          dp.seamEdges!.waistBack,
        ];
        const frontLen = curveArcLengthCm(
          dp.outlineCm,
          dp.curvedSpans ?? [],
          ...frontEdge,
        );
        const backLen = curveArcLengthCm(
          dp.outlineCm,
          dp.curvedSpans ?? [],
          ...backEdge,
        );
        expect(frontLen).toBeCloseTo(expectedWidthCm, 1);
        expect(backLen).toBeCloseTo(expectedWidthCm, 1);
        expect(frontLen + backLen).toBeCloseTo(M.waist, 1);
      } else {
        // circle/gore: panels=2, each cut copy is a whole panel matching
        // dressWaistHalfCm(waist) * 2 on its own single `waist` edge.
        const arc = curveArcLengthCm(
          dp.outlineCm,
          dp.curvedSpans ?? [],
          ...dp.seamEdges!.waist,
        );
        expect(arc).toBeCloseTo(expectedWidthCm, 1);
      }
    },
  );
});

// #244: the reserved InternalCm "pleat" variant's first real emitter.
describe("pleats (#244)", () => {
  function waistWidth(dp: ReturnType<typeof draftSkirt>): number {
    return curveArcLengthCm(dp.outlineCm, dp.curvedSpans ?? [], 0, 2);
  }
  function hemWidth(dp: ReturnType<typeof draftSkirt>): number {
    return curveArcLengthCm(dp.outlineCm, dp.curvedSpans ?? [], 3, 5);
  }

  it.each(["box", "inverted-box"] as const)(
    "%s widens both the waist and hem edges by exactly 2x the per-side intake, on a straight skirt",
    (pleats) => {
      const plain = draftSkirt(M, { skirt: "straight" }, t);
      const pleated = draftSkirt(M, { skirt: "straight", pleats }, t);
      expect(waistWidth(pleated) - waistWidth(plain)).toBeCloseTo(
        2 * PLEAT_INTAKE_PER_SIDE_CM,
        5,
      );
      expect(hemWidth(pleated) - hemWidth(plain)).toBeCloseTo(
        2 * PLEAT_INTAKE_PER_SIDE_CM,
        5,
      );
    },
  );

  it("style.pleats: 'none' (or unset) drafts byte-identical geometry to no pleats at all", () => {
    const unset = draftSkirt(M, { skirt: "straight" }, t);
    const none = draftSkirt(M, { skirt: "straight", pleats: "none" }, t);
    expect(none.outlineCm).toEqual(unset.outlineCm);
    expect(none.internalsCm).toBeUndefined();
    expect(unset.internalsCm).toBeUndefined();
  });

  it("a dress-mode panel never reads pleats -- the waist edge stays dressWaistHalfCm(waist)*2 wide regardless", () => {
    const withoutPleats = draftSkirt(M, { skirt: "straight" }, t, true);
    const withPleats = draftSkirt(
      M,
      { skirt: "straight", pleats: "box" },
      t,
      true,
    );
    expect(withPleats.outlineCm).toEqual(withoutPleats.outlineCm);
    expect(withPleats.internalsCm).toBeUndefined();
  });

  it("emits real 'pleat' and 'foldLine' internals, two of each (one pair per side)", () => {
    const dp = draftSkirt(M, { skirt: "straight", pleats: "box" }, t);
    const kinds = (dp.internalsCm ?? []).map((e) => e.kind);
    expect(kinds).toEqual(["foldLine", "pleat", "foldLine", "pleat"]);
  });

  it("box vs inverted-box: the fold line sits at a genuinely different position for the same side (fold direction is expressible)", () => {
    const box = draftSkirt(M, { skirt: "straight", pleats: "box" }, t);
    const inv = draftSkirt(M, { skirt: "straight", pleats: "inverted-box" }, t);
    const isFoldLine = (
      e: InternalCm,
    ): e is Extract<InternalCm, { kind: "foldLine" }> => e.kind === "foldLine";
    const boxFold = box.internalsCm!.find(isFoldLine)!;
    const invFold = inv.internalsCm!.find(isFoldLine)!;
    expect(boxFold.aCm[0]).not.toBeCloseTo(invFold.aCm[0], 3);
  });

  it("the waistPanel detail row reflects the REAL (pleat-widened) waist width, not the pre-pleat one", () => {
    const plain = draftSkirt(M, { skirt: "straight" }, t);
    const pleated = draftSkirt(M, { skirt: "straight", pleats: "box" }, t);
    const row = (dp: typeof plain) =>
      parseFloat(
        dp.detailRows
          .find((r) => r.label === "rows.waistPanel")!
          .value.replace(",", ".")
          .replace(" cm", ""),
      );
    expect(row(pleated) - row(plain)).toBeCloseTo(
      2 * PLEAT_INTAKE_PER_SIDE_CM,
      1,
    );
  });

  it("adds a pleats detail row naming the pleat type, only when pleated", () => {
    const plain = draftSkirt(M, { skirt: "straight" }, t);
    const pleated = draftSkirt(
      M,
      { skirt: "straight", pleats: "inverted-box" },
      t,
    );
    expect(
      plain.detailRows.find((r) => r.label === "rows.pleats"),
    ).toBeUndefined();
    const row = pleated.detailRows.find((r) => r.label === "rows.pleats");
    expect(row?.value).toBe("pleatType.inverted-box");
  });

  it("every pleat internal point stays inside the widened panel's own outline", () => {
    const dp = draftSkirt(M, { skirt: "a-line", pleats: "inverted-box" }, t);
    const b = bbox(dp.outlineCm);
    for (const entry of dp.internalsCm ?? []) {
      const pts: [number, number][] =
        entry.kind === "foldLine"
          ? [entry.aCm, entry.bCm]
          : entry.kind === "pleat"
            ? (entry.ptsCm as [number, number][])
            : [];
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(b.minX);
        expect(x).toBeLessThanOrEqual(b.maxX);
        expect(y).toBeGreaterThanOrEqual(b.minY);
        expect(y).toBeLessThanOrEqual(b.maxY);
      }
    }
  });

  it.each(["circle", "gore", "half-circle"] as const)(
    "%s (radial): pleats is simply unread -- outline unchanged with pleats set",
    (skirt) => {
      const plain = draftSkirt(M, { skirt }, t);
      const withPleats = draftSkirt(M, { skirt, pleats: "box" }, t);
      expect(withPleats.outlineCm).toEqual(plain.outlineCm);
    },
  );
});
