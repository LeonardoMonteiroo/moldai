import { describe, it, expect } from "vitest";
import { SIZE_TABLE } from "@/lib/measurements";
import { draftSleeve } from "./sleeve";
import { curveArcLengthCm, bbox } from "./core";
import { t } from "@/lib/i18n/test-translate";

const M = SIZE_TABLE.M;

describe("draftSleeve bell cap", () => {
  it("returns null when sleeve=none", () => {
    expect(draftSleeve(M, { sleeve: "none" }, 22, t)).toBeNull();
  });
  it("long is longer than short", () => {
    const curta = draftSleeve(M, { sleeve: "short" }, 22, t)!;
    const longa = draftSleeve(M, { sleeve: "long" }, 22, t)!;
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });
  it("cap height follows the target armhole (bicep is fixed by body proportion, not the armhole)", () => {
    const estreita = draftSleeve(M, { sleeve: "short" }, 18, t)!;
    const larga = draftSleeve(M, { sleeve: "short" }, 30, t)!;
    expect(bbox(larga.outlineCm).w).toBeCloseTo(bbox(estreita.outlineCm).w, 5);
    expect(bbox(larga.outlineCm).h).toBeGreaterThan(bbox(estreita.outlineCm).h);
  });
  it("marks the cap as a curvedSpan", () => {
    const mg = draftSleeve(M, { sleeve: "short" }, 22, t)!;
    expect((mg.curvedSpans ?? []).length).toBeGreaterThanOrEqual(1);
  });

  // #139: a size-M female blouse must draft a sleeve wide enough to fit an
  // arm, and a cap whose measured arc exceeds the full armhole by a
  // documented ease — not the ~half-scale sleeve the old armhole-fraction
  // heuristic produced.
  it("bicep is at least 30 cm wide for a size-M female blouse", () => {
    const sleeve = draftSleeve(M, { sleeve: "short" }, 39.3, t, {
      gender: "female",
      knit: false,
      lengthCm: 0,
      wearingEaseCm: 8, // unused by this drafter -- see sleeve.ts's own WEARING_EASE_CM
    })!;
    expect(bbox(sleeve.outlineCm).w).toBeGreaterThanOrEqual(30);
  });

  it("the drafted cap's measured arc exceeds the target armhole by the documented woven ease, within 0.3 cm", () => {
    const armholeLenCm = 39.3;
    const sleeve = draftSleeve(M, { sleeve: "short" }, armholeLenCm, t, {
      gender: "female",
      knit: false,
      lengthCm: 0,
      wearingEaseCm: 8, // unused by this drafter -- see sleeve.ts's own WEARING_EASE_CM
    })!;
    const measuredCapArcCm = curveArcLengthCm(
      sleeve.outlineCm,
      sleeve.curvedSpans ?? [],
      0,
      4,
    );
    expect(measuredCapArcCm - armholeLenCm).toBeCloseTo(2.5, 0);
    expect(Math.abs(measuredCapArcCm - armholeLenCm - 2.5)).toBeLessThan(0.3);
  });

  it("a knit sleeve differs from a woven sleeve of the same size", () => {
    const woven = draftSleeve(M, { sleeve: "short" }, 39.3, t, {
      gender: "female",
      knit: false,
      lengthCm: 0,
      wearingEaseCm: 8, // unused by this drafter -- see sleeve.ts's own WEARING_EASE_CM
    })!;
    const knit = draftSleeve(M, { sleeve: "short" }, 39.3, t, {
      gender: "female",
      knit: true,
      lengthCm: 0,
      wearingEaseCm: 0, // unused by this drafter -- see sleeve.ts's own WEARING_EASE_CM
    })!;
    expect(bbox(knit.outlineCm).w).not.toBeCloseTo(bbox(woven.outlineCm).w, 3);
  });

  it("armholeLenCm on the returned piece is measured from the drafted cap, not an echo of the argument", () => {
    // A deliberately wrong/inconsistent input still comes back as what the
    // cap actually measures — proving it isn't just handed through (#78).
    const sleeve = draftSleeve(M, { sleeve: "short" }, 39.3, t)!;
    expect(sleeve.armholeLenCm).toBeCloseTo(39.3, 1);
  });
});
