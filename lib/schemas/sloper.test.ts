import { describe, it, expect } from "vitest";
import { SloperDataSchema } from "./sloper";
import { sloperFromPattern } from "@/lib/slopers/convert";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";

function draftedPattern() {
  const state = seedPatternState(t);
  applyGarmentSpec(
    state,
    { type: "blouse", gender: "female", measurementOverrides: {}, style: {} },
    t,
  );
  return state.pattern;
}

describe("SloperDataSchema", () => {
  it("accepts a real sloper snapshot from a drafted pattern", () => {
    const sloper = sloperFromPattern(draftedPattern(), "Base blusa");
    expect(SloperDataSchema.safeParse(sloper).success).toBe(true);
  });

  it("round-trips through JSON.stringify/parse", () => {
    const sloper = JSON.parse(
      JSON.stringify(sloperFromPattern(draftedPattern(), "Base blusa")),
    );
    expect(SloperDataSchema.safeParse(sloper).success).toBe(true);
  });

  // Same failure mode as PatternStateSchema's baseSize/sizeTable refine --
  // patternFromSloper resolves baseSize against sizeTable identically.
  it("rejects a baseSize that isn't a key of sizeTable", () => {
    const sloper = sloperFromPattern(draftedPattern(), "Base blusa");
    delete sloper.sizeTable[sloper.baseSize];
    expect(SloperDataSchema.safeParse(sloper).success).toBe(false);
  });

  it("tolerates an absent sizeChartName", () => {
    const sloper = sloperFromPattern(draftedPattern(), "Base blusa");
    expect("sizeChartName" in sloper).toBe(false);
    expect(SloperDataSchema.safeParse(sloper).success).toBe(true);
  });
});
