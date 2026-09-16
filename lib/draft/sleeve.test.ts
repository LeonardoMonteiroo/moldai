import { describe, it, expect } from "vitest";
import { SIZE_TABLE } from "@/lib/measurements";
import { draftSleeve, SLEEVE_PLACKET_OPENING_CM } from "./sleeve";
import { curveArcLengthCm, bbox } from "./core";
import type { BlockOpts } from "./body";
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

  // #124: notches by convention.
  describe("notches", () => {
    it("emits a single pitch notch, a double pitch notch, and a cap-apex notch", () => {
      const sleeve = draftSleeve(M, { sleeve: "short" }, 39.3, t)!;
      const types = sleeve.notches!.map((n) => n.type);
      expect(types).toEqual(["single", "double", "single"]);
    });

    it("the single notch sits nearer the left underarm, the double nearer the right", () => {
      const sleeve = draftSleeve(M, { sleeve: "short" }, 39.3, t)!;
      const [single, double] = sleeve.notches!;
      const [ua0] = sleeve.outlineCm; // left underarm, index 0
      const ua4 = sleeve.outlineCm[4]; // right underarm
      const dist = (a: [number, number], b: [number, number]) =>
        Math.hypot(a[0] - b[0], a[1] - b[1]);
      expect(dist(single.outerCm, ua0)).toBeLessThan(dist(single.outerCm, ua4));
      expect(dist(double.outerCm, ua4)).toBeLessThan(dist(double.outerCm, ua0));
    });

    // #253: sleeve.ts no longer re-clamps pitchNotchCm against its own cap
    // arc -- it's used verbatim (already pre-derived upstream, off the
    // mated pair's own combined total). A caller passing a farther distance
    // still places the notch farther, which is all this test asserts.
    it("respects the pitchNotchCm passed in", () => {
      const near = draftSleeve(M, { sleeve: "short" }, 39.3, t, undefined, 2)!;
      const far = draftSleeve(M, { sleeve: "short" }, 39.3, t, undefined, 8)!;
      const [ua0] = near.outlineCm;
      const dist = (a: [number, number], b: [number, number]) =>
        Math.hypot(a[0] - b[0], a[1] - b[1]);
      expect(dist(near.notches![0].outerCm, ua0)).toBeLessThan(
        dist(far.notches![0].outerCm, ua0),
      );
    });
  });

  // #132/#269: m.bicep drives the sleeve width directly. Promoted to CORE
  // (#269 -- a FreeSewing design requires it outright), so M (SIZE_TABLE.M)
  // always carries a real value now and the bust-proportion fallback this
  // used to have was removed from sleeve.ts entirely.
  describe("#132: bicep override", () => {
    const sleeveOpts: BlockOpts = {
      gender: "female",
      knit: false,
      lengthCm: 0,
      wearingEaseCm: 8, // unused by this drafter -- see sleeve.ts's own WEARING_EASE_CM
    };

    it("uses m.bicep directly instead of the bust-derived proportion when present", () => {
      const narrow = draftSleeve(
        { ...M, bicep: 20 },
        { sleeve: "short" },
        39.3,
        t,
        sleeveOpts,
      )!;
      const wide = draftSleeve(
        { ...M, bicep: 40 },
        { sleeve: "short" },
        39.3,
        t,
        sleeveOpts,
      )!;
      expect(bbox(wide.outlineCm).w).toBeGreaterThan(bbox(narrow.outlineCm).w);
    });
  });

  // #344: the sleeve's own placket opening -- a cut line (internalsCm),
  // never boundary geometry, cut only when hasPlacketOpening(style) holds
  // (the SAME predicate garment.ts uses to gate the cuff+placket branch).
  // The predicate's own truth table lives with the predicate, in
  // lib/draft/engine/capability.test.ts -- this block covers what the SLEEVE
  // does with it.
  describe("#344: placket opening", () => {
    it("cuts no opening for a short sleeve, or a long sleeve with no straight cuff", () => {
      const short = draftSleeve(
        M,
        { sleeve: "short", cuff: "straight" },
        39.3,
        t,
      )!;
      expect(short.internalsCm).toBeUndefined();
      expect(short.cutEdges).toBeUndefined();
      const noCuff = draftSleeve(M, { sleeve: "long" }, 39.3, t)!;
      expect(noCuff.internalsCm).toBeUndefined();
      expect(noCuff.cutEdges).toBeUndefined();
    });

    it("cuts a real opening, exactly SLEEVE_PLACKET_OPENING_CM long, for a long sleeve with a straight cuff", () => {
      const sleeve = draftSleeve(
        M,
        { sleeve: "long", cuff: "straight" },
        39.3,
        t,
      )!;
      expect(sleeve.cutEdges?.placketOpening).toBeDefined();
      const { internalIdx, range } = sleeve.cutEdges!.placketOpening;
      const entry = sleeve.internalsCm![internalIdx];
      expect(entry.kind).toBe("styleLine");
      const openingLenCm = curveArcLengthCm(
        (entry as { ptsCm: [number, number][] }).ptsCm,
        [],
        range[0],
        range[1],
      );
      expect(openingLenCm).toBeCloseTo(SLEEVE_PLACKET_OPENING_CM, 5);
    });

    it("the opening's own two points both sit on/inside the drafted outline, on the back half of the hem", () => {
      const sleeve = draftSleeve(
        M,
        { sleeve: "long", cuff: "straight" },
        39.3,
        t,
      )!;
      const { internalIdx } = sleeve.cutEdges!.placketOpening;
      const entry = sleeve.internalsCm![internalIdx] as {
        ptsCm: [number, number][];
      };
      const [bottom, top] = entry.ptsCm;
      const b = bbox(sleeve.outlineCm);
      // both endpoints fall within the outline's own bounding box, and the
      // bottom point sits exactly on the hem's own y (index 5/6).
      for (const [x, y] of [bottom, top]) {
        expect(x).toBeGreaterThanOrEqual(b.minX);
        expect(x).toBeLessThanOrEqual(b.maxX);
        expect(y).toBeGreaterThanOrEqual(b.minY);
        expect(y).toBeLessThanOrEqual(b.maxY);
      }
      expect(bottom[1]).toBeCloseTo(b.maxY, 5); // on the hem
      expect(top[1]).toBeLessThan(bottom[1]); // runs upward from the hem
      // strictly on the back half (left of the sleeve's own vertical centre)
      const [, , , , , hemRight, hemLeft] = sleeve.outlineCm;
      expect(bottom[0]).toBeGreaterThan(hemLeft[0]);
      expect(bottom[0]).toBeLessThan(hemRight[0]);
    });

    it("carries the rows.sleevePlacket detail row only when the opening is cut", () => {
      const withOpening = draftSleeve(
        M,
        { sleeve: "long", cuff: "straight" },
        39.3,
        t,
      )!;
      expect(
        withOpening.detailRows.some((r) => r.label === "rows.sleevePlacket"),
      ).toBe(true);
      const withoutOpening = draftSleeve(M, { sleeve: "long" }, 39.3, t)!;
      expect(
        withoutOpening.detailRows.some((r) => r.label === "rows.sleevePlacket"),
      ).toBe(false);
    });
  });
});
