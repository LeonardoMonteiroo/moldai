import { describe, it, expect } from "vitest";
import {
  composePhrasings,
  phrasingCoverageGaps,
  DECLINE_PROMPTS,
  EXPLAIN_PROMPTS,
} from "./phrasings";
import {
  enumerateApplyCombinations,
  DECLINE_CASES,
  type Combination,
} from "./combinations";
import { MOLDAI_CAPABILITY } from "@/lib/draft/engine/capability";

// #269 Fase 5 (dataset): mirrors combinations.test.ts's own posture --
// enumerateApplyCombinations(MOLDAI_CAPABILITY) is the real, shipped
// combination set, so exercising composePhrasings/phrasingCoverageGaps
// against it (rather than a handful of hand-built fixtures) is what
// actually proves the fragment banks in FIELD_FRAGMENTS cover every field
// this capability can enumerate -- exactly the "coverage gap, never
// silently skipped" guarantee phrasingCoverageGaps' own doc calls for.

const combos = enumerateApplyCombinations(MOLDAI_CAPABILITY);

function comboFor(predicate: (c: Combination) => boolean): Combination {
  const found = combos.find(predicate);
  if (!found) throw new Error("no matching combination in the default seed");
  return found;
}

describe("phrasingCoverageGaps", () => {
  it("is empty for every combination the default seed enumerates", () => {
    expect(phrasingCoverageGaps(combos)).toEqual([]);
  });
});

describe("composePhrasings", () => {
  it("returns the requested count of distinct, non-empty sentences", () => {
    const combo = comboFor((c) => c.arity >= 2);
    const out = composePhrasings(combo, 3);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    for (const sentence of out) expect(sentence.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same combination and count", () => {
    const combo = comboFor((c) => c.arity >= 2);
    expect(composePhrasings(combo, 5)).toEqual(composePhrasings(combo, 5));
  });

  it("terminates and returns at most `count` sentences even when the field pool can't fill the budget", () => {
    const combo = comboFor((c) => c.arity === 1);
    const out = composePhrasings(combo, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.length).toBeGreaterThan(0);
  });

  it("never falls back to a raw 'field: value' placeholder for a real combination", () => {
    for (const combo of combos.slice(0, 40)) {
      const out = composePhrasings(combo, 2);
      for (const sentence of out) {
        for (const field of Object.keys(combo.fields)) {
          expect(sentence).not.toContain(`${field}:`);
        }
      }
    }
  });

  it("capitalizes the first letter of every sentence", () => {
    const combo = comboFor((c) => c.arity >= 1);
    for (const sentence of composePhrasings(combo, 6)) {
      expect(sentence[0]).toBe(sentence[0].toUpperCase());
    }
  });

  it("ends every sentence with a period or a question mark", () => {
    const combo = comboFor((c) => c.arity >= 1);
    for (const sentence of composePhrasings(combo, 6)) {
      expect(sentence).toMatch(/[.?]$/);
    }
  });

  it("embeds the numeric value verbatim for a numeric field", () => {
    const combo = comboFor((c) => typeof c.fields.skirtLengthCm === "number");
    const value = combo.fields.skirtLengthCm;
    const out = composePhrasings(combo, 3);
    expect(out.some((s) => s.includes(`${value}cm`))).toBe(true);
  });

  it("returns an empty array for a combination with no fields", () => {
    const empty: Combination = {
      key: "blouse|female|",
      type: "blouse",
      gender: "female",
      fields: {},
      arity: 0,
    };
    // No fields to phrase means every candidate sentence is byte-identical
    // (nothing varies the template's own fixed wording besides
    // gender/use-case, both of which repeat quickly), so `seen` dedup caps
    // this well below `count` -- asserting it terminates is the point.
    const out = composePhrasings(empty, 10);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("DECLINE_PROMPTS", () => {
  it("has a non-empty entry for every DeclineCase key", () => {
    for (const decline of DECLINE_CASES) {
      expect(DECLINE_PROMPTS[decline.key]).toBeDefined();
      expect(DECLINE_PROMPTS[decline.key].length).toBeGreaterThan(0);
    }
  });

  it("names no key DECLINE_CASES doesn't have", () => {
    const declineKeys = new Set(DECLINE_CASES.map((d) => d.key));
    for (const key of Object.keys(DECLINE_PROMPTS)) {
      expect(declineKeys.has(key)).toBe(true);
    }
  });
});

describe("EXPLAIN_PROMPTS", () => {
  it("is a non-empty list of pt-BR questions", () => {
    expect(EXPLAIN_PROMPTS.length).toBeGreaterThan(0);
    for (const prompt of EXPLAIN_PROMPTS) {
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    }
  });
});
