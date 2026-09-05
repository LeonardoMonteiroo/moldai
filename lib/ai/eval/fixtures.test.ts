import { describe, it, expect } from "vitest";
import { GENERATION_CASES, EDITING_CASES } from "./fixtures";

// #252: fixtures.ts is a plain data literal (its own doc comment: "a fixture
// stays a plain, diffable data literal") -- these are structural invariants
// on that data, not behavioral tests of a function, mirroring how
// combinations.test.ts checks combinations.ts's own generated data.

describe("GENERATION_CASES", () => {
  it("has a unique id per case", () => {
    const ids = GENERATION_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every case a non-empty pt-BR prompt", () => {
    for (const c of GENERATION_CASES) {
      expect(typeof c.prompt).toBe("string");
      expect(c.prompt.length).toBeGreaterThan(0);
    }
  });

  it("only asserts expectedType/expectedStyle when expectedDecision is apply", () => {
    for (const c of GENERATION_CASES) {
      if (c.expectedDecision === "apply") {
        expect(c.expectedType).toBeDefined();
      } else {
        expect(c.expectedType).toBeUndefined();
        expect(c.expectedStyle).toBeUndefined();
      }
    }
  });

  it("covers at least one case per non-apply decision", () => {
    const decisions = new Set(GENERATION_CASES.map((c) => c.expectedDecision));
    expect(decisions.has("ask")).toBe(true);
    expect(decisions.has("decline")).toBe(true);
    expect(decisions.has("explain")).toBe(true);
  });

  it("covers every apply case's type with at least one case", () => {
    const applyTypes = new Set(
      GENERATION_CASES.filter((c) => c.expectedDecision === "apply").map(
        (c) => c.expectedType,
      ),
    );
    expect(applyTypes.size).toBeGreaterThan(0);
    for (const type of applyTypes) expect(type).toBeTruthy();
  });
});

describe("EDITING_CASES", () => {
  it("has a unique id per case", () => {
    const ids = EDITING_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every case a non-empty pt-BR instruction", () => {
    for (const c of EDITING_CASES) {
      expect(typeof c.instruction).toBe("string");
      expect(c.instruction.length).toBeGreaterThan(0);
    }
  });

  it("never lists the same field as both changed and unchanged", () => {
    for (const c of EDITING_CASES) {
      const changed = new Set(c.expectedChanged);
      for (const field of c.expectedUnchanged) {
        expect(changed.has(field)).toBe(false);
      }
    }
  });

  it("names at least one field expected to change", () => {
    for (const c of EDITING_CASES) {
      expect(c.expectedChanged.length).toBeGreaterThan(0);
    }
  });

  it("always includes type and gender among the unchanged fields", () => {
    for (const c of EDITING_CASES) {
      expect(c.expectedUnchanged).toContain("type");
      expect(c.expectedUnchanged).toContain("gender");
    }
  });
});
