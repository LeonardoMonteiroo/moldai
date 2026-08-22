import { describe, it, expect } from "vitest";
import {
  seedPatternState,
  applyGarmentSpec,
  applySizes,
} from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec, PatternState } from "@/lib/types";
import { sloperFromPattern, patternFromSloper } from "./convert";

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: { neckline: "V", necklineDepthCm: 12, sleeve: "long", darts: true },
};

const TSHIRT: GarmentSpec = {
  type: "tshirt",
  gender: "male",
  measurementOverrides: { bust: 104 },
  style: {},
};

const SKIRT: GarmentSpec = {
  type: "skirt",
  gender: "female",
  measurementOverrides: {},
  style: { skirt: "a-line", skirtLengthCm: 60 },
};

function drafted(spec: GarmentSpec): PatternState {
  const state = seedPatternState(t);
  applyGarmentSpec(state, spec, t);
  return state;
}

describe("sloperFromPattern / patternFromSloper", () => {
  it.each([
    ["blouse", BLOUSE],
    ["tshirt", TSHIRT],
    ["skirt", SKIRT],
  ])("round-trips %s geometry exactly", (_label, spec) => {
    const original = drafted(spec);
    const sloper = sloperFromPattern(original.pattern, "base");
    const next = patternFromSloper(sloper, t);

    expect(next.pattern.pieces).toEqual(original.pattern.pieces);
    expect(next.pattern.viewBox).toEqual(original.pattern.viewBox);
    expect(next.pattern.baseMeasurements).toEqual(
      original.pattern.baseMeasurements,
    );
  });

  it("carries the snapshot and the name, and starts at version 1", () => {
    const original = drafted(BLOUSE);
    const sloper = sloperFromPattern(original.pattern, "base corpo reto");
    const next = patternFromSloper(sloper, t);

    expect(next.pattern.name).toBe("base corpo reto");
    expect(next.pattern.version).toBe(1);
    expect(next.pattern.sizes).toEqual(original.pattern.sizes);
    expect(next.pattern.baseSize).toBe(original.pattern.baseSize);
    expect(next.pattern.sizeTable).toEqual(original.pattern.sizeTable);
  });

  it("keeps a refitted sleeve — an internal style flag worth saving", () => {
    const original = drafted({
      ...BLOUSE,
      style: { ...BLOUSE.style, armholeDeepenCm: 3, sleeveRefit: true },
    });
    const sloper = sloperFromPattern(original.pattern, "base manga refeita");

    expect(sloper.spec.style.sleeveRefit).toBe(true);
    expect(patternFromSloper(sloper, t).pattern.pieces).toEqual(
      original.pattern.pieces,
    );
  });

  it("resets grading — a base is a base size, not a graded set", () => {
    const original = drafted(BLOUSE);
    applySizes(original, [original.pattern.sizes[0]]);
    expect(original.pattern.sizesApplied).not.toHaveLength(0);

    const next = patternFromSloper(
      sloperFromPattern(original.pattern, "base"),
      t,
    );
    expect(next.pattern.sizesApplied).toEqual([]);
    expect(next.pattern.sizesPending).toEqual(next.pattern.sizes);
  });

  it("preserves sizeChartName when present and omits it when absent", () => {
    const withChart = drafted(BLOUSE);
    withChart.pattern = {
      ...withChart.pattern,
      sizeChartName: "Grade da casa",
    };
    expect(sloperFromPattern(withChart.pattern, "b").sizeChartName).toBe(
      "Grade da casa",
    );

    const without = drafted(BLOUSE);
    without.pattern = { ...without.pattern, sizeChartName: undefined };
    const sloper = sloperFromPattern(without.pattern, "b");
    expect("sizeChartName" in sloper).toBe(false);
    expect(patternFromSloper(sloper, t).pattern.sizeChartName).toBeUndefined();
  });

  it("opens the chat with one ai turn naming the base", () => {
    const sloper = sloperFromPattern(drafted(BLOUSE).pattern, "base blusa");
    const next = patternFromSloper(sloper, t);

    expect(next.chat).toHaveLength(1);
    expect(next.chat[0].author).toBe("ai");
    expect(next.chat[0].text).toBe("chat.fromSloper");
  });

  it("throws rather than fabricating a spec for an undrafted pattern", () => {
    const blank = seedPatternState(t);
    blank.pattern = { ...blank.pattern, spec: undefined };
    expect(() => sloperFromPattern(blank.pattern, "base")).toThrow();
  });
});
