import { describe, it, expect } from "vitest";
import { SIZE_TABLE } from "@/lib/measurements";
import { draftSkirt } from "./skirt";
import { bbox } from "./core";
import { t } from "@/lib/i18n/test-translate";

const M = SIZE_TABLE.M;

describe("draftSkirt", () => {
  it("straight generates a trapezoid with 4 vertices and viewBox > 0", () => {
    const s = draftSkirt(M, { skirt: "straight" }, t);
    expect(s.outlineCm.length).toBe(4);
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
