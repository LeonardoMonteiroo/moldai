import { describe, it, expect } from "vitest";
import {
  FIT_CLASSES,
  STRETCH_CLASSES,
  FIT_EASE_CM,
  STRETCH_EASE_PCT,
  TSHIRT_BASE_EASE_PCT,
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
  it("none is exactly 0% -- no reduction off the knit base ease", () => {
    expect(STRETCH_EASE_PCT.none).toBe(0);
  });
  // #282: was 55.9, solved backwards from a contested benchmark dimension.
  // 18 converges from two named sources instead -- the ~15-20cm hand-drafting
  // "loose tee" band, and FreeSewing's Teagan holding 18.0% flat at published
  // defaults on the same ~100cm-chest body (see ease.ts's own comment).
  it("TSHIRT_BASE_EASE_PCT is exactly 18 -- hand-drafting range + Teagan's 18.0%", () => {
    expect(TSHIRT_BASE_EASE_PCT).toBe(18);
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

// #282: TSHIRT_BASE_EASE_PCT's own literal value pinned so a future
// recalibration has to be a deliberate edit, never a silent drift -- sourced
// from FreeSewing's Teagan design at published defaults, which holds ease
// flat at 18.0% of bust across all four graded sizes (see
// docs/reference/freesewing-spike/README.md § "The real finding").
describe("TSHIRT_BASE_EASE_PCT", () => {
  it("is exactly 18 -- FreeSewing Teagan's flat relaxed-tee ease ratio", () => {
    expect(TSHIRT_BASE_EASE_PCT).toBe(18);
  });
});

describe("wearingEaseCm", () => {
  it("defaults to the fitted band for a woven garment with no fit set", () => {
    expect(wearingEaseCm({}, false, 92)).toBe(8);
  });
  it("defaults to the positive tshirt base ease for a knit garment with no stretch set", () => {
    expect(wearingEaseCm({}, true, 92)).toBeCloseTo(
      (92 * TSHIRT_BASE_EASE_PCT) / 100,
      5,
    );
  });
  it("resolves each fit class to its table's bust value for a woven garment", () => {
    for (const fit of FIT_CLASSES) {
      expect(wearingEaseCm({ fit }, false, 92)).toBe(FIT_EASE_CM[fit].bust);
    }
  });
  it("a stretchy knit reduces relative to the base ease, scaled by the body bust", () => {
    expect(wearingEaseCm({ stretch: "high" }, true, 100)).toBeCloseTo(
      (100 * (TSHIRT_BASE_EASE_PCT - 12)) / 100,
      5,
    );
  });
  it("a woven garment never reads style.stretch, and a knit never reads style.fit", () => {
    expect(wearingEaseCm({ fit: "loose", stretch: "none" }, true, 100)).toBe(
      18,
    );
    expect(wearingEaseCm({ fit: "fitted", stretch: "high" }, false, 100)).toBe(
      8,
    );
  });
  // #282: the property a flat-cm constant could not hold -- the reference
  // (FreeSewing Teagan) grades at a CONSTANT ease percentage while the
  // absolute cm figure grows with the body, across the same four graded
  // sizes the spike measured (P/M/G/GG at body chest 96/100/104/108).
  it("grades the same ease percentage across sizes while the absolute cm figure grows with the body", () => {
    const bodyChests = [96, 100, 104, 108];
    const expectedCm = [17.28, 18.0, 18.72, 19.44];
    for (let i = 0; i < bodyChests.length; i++) {
      const eased = wearingEaseCm({}, true, bodyChests[i]);
      expect(eased).toBeCloseTo(expectedCm[i], 2);
      expect((eased / bodyChests[i]) * 100).toBeCloseTo(
        TSHIRT_BASE_EASE_PCT,
        5,
      );
    }
  });
  // #282: a real bound, not a restatement of the constant -- the default
  // knit ease at a 100cm bust must land inside the ~15-20cm relaxed-tee
  // range cited in ease.ts's own comment, the range the old 55.9cm constant
  // was triple the size of.
  it("the default knit ease at a 100cm bust lands inside the 15-20cm relaxed-tee range", () => {
    const eased = wearingEaseCm({}, true, 100);
    expect(eased).toBeGreaterThanOrEqual(15);
    expect(eased).toBeLessThanOrEqual(20);
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
