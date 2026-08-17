import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftSkirt } from "./skirt";
import { bbox } from "./core";
import { t } from "@/lib/i18n/test-translate";

const M = resolveMeasurements("M", {});

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
  it("circle: waist arc ~ waist/4 (a quarter-piece) with radius waist/2π", () => {
    const dp = draftSkirt(M, { skirt: "circle", skirtLengthCm: 60 }, t);
    // metadata exposed in the detail rows: waist radius
    const raioRow = dp.detailRows.find((r) => r.label === "rows.waistRadius");
    expect(raioRow).toBeTruthy();
    const raio = parseFloat(raioRow!.value.replace(",", "."));
    expect(raio).toBeCloseTo(74 / (2 * Math.PI), 0);
  });
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
});
