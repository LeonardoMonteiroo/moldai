import { describe, it, expect } from "vitest";
import {
  FIT_CLASSES,
  STRETCH_CLASSES,
  FIT_EASE_CM,
  STRETCH_EASE_PCT,
  wearingEaseCm,
  classifyGirthFit,
} from "./ease";

// #125: pins the two values that must never drift, per the
// #101/MAX_PATTERNS_LISTED lesson -- a constant a default silently depends on
// gets its own literal-value test, not just an indirect one via whatever
// currently imports it.
describe("FIT_EASE_CM / STRETCH_EASE_PCT defaults", () => {
  it("fitted.bust is exactly 8 -- today's hardcoded +2 cm/quarter (×4) reproduced bit-for-bit", () => {
    expect(FIT_EASE_CM.fitted.bust).toBe(8);
  });
  it("none is exactly 0% -- today's knit default (wearingEase = 0) reproduced bit-for-bit", () => {
    expect(STRETCH_EASE_PCT.none).toBe(0);
  });
  it("bust ease increases monotonically close < fitted < semiFitted < loose", () => {
    const order = FIT_CLASSES.map((c) => FIT_EASE_CM[c].bust);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });
  it("stretch percentage increases monotonically none < low < medium < high", () => {
    const order = STRETCH_CLASSES.map((c) => STRETCH_EASE_PCT[c]);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });
});

describe("wearingEaseCm", () => {
  it("defaults to the fitted band for a woven garment with no fit set", () => {
    expect(wearingEaseCm({}, false, 92)).toBe(8);
  });
  it("defaults to no negative ease for a knit garment with no stretch set", () => {
    expect(wearingEaseCm({}, true, 92)).toBe(0);
  });
  it("resolves each fit class to its table's bust value for a woven garment", () => {
    for (const fit of FIT_CLASSES) {
      expect(wearingEaseCm({ fit }, false, 92)).toBe(FIT_EASE_CM[fit].bust);
    }
  });
  it("is negative for a stretchy knit, scaled by the body bust", () => {
    expect(wearingEaseCm({ stretch: "high" }, true, 100)).toBeCloseTo(-12, 5);
  });
  it("a woven garment never reads style.stretch, and a knit never reads style.fit", () => {
    expect(wearingEaseCm({ fit: "loose", stretch: "none" }, true, 100)).toBe(0);
    expect(wearingEaseCm({ fit: "fitted", stretch: "high" }, false, 100)).toBe(
      8,
    );
  });
});

// #137: classifyGirthFit is the drafted-ease report's own fit classifier --
// it must reuse FIT_EASE_CM's own numbers (never a second, competing scale)
// and every one of its band CENTRES (the table's own representative
// figures) must classify back to the class that centre belongs to.
describe("classifyGirthFit", () => {
  it("classifies each class's own FIT_EASE_CM.bust figure back to that class", () => {
    for (const fit of FIT_CLASSES) {
      expect(classifyGirthFit("bust", FIT_EASE_CM[fit].bust)).toBe(fit);
    }
  });
  it("classifies each class's own FIT_EASE_CM.waist/hip figure back to that class too", () => {
    for (const fit of FIT_CLASSES) {
      expect(classifyGirthFit("waist", FIT_EASE_CM[fit].waist)).toBe(fit);
      expect(classifyGirthFit("hip", FIT_EASE_CM[fit].hip)).toBe(fit);
    }
  });
  it("negative ease (a knit's own convention) classifies as close, not an error", () => {
    expect(classifyGirthFit("bust", -12)).toBe("close");
  });
  it("classifies right at the fitted/semiFitted midpoint as fitted (<=), one step over as semiFitted", () => {
    const mid = (FIT_EASE_CM.fitted.bust + FIT_EASE_CM.semiFitted.bust) / 2;
    expect(classifyGirthFit("bust", mid)).toBe("fitted");
    expect(classifyGirthFit("bust", mid + 0.1)).toBe("semiFitted");
  });
  it("an ease far beyond loose's own figure still classifies as loose, not out of range", () => {
    expect(classifyGirthFit("bust", 100)).toBe("loose");
  });
});
