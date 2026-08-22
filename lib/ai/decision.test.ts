import { describe, it, expect } from "vitest";
import { resolveDecision } from "./decision";

const SPEC = {
  type: "tshirt",
  gender: "male",
  measurementOverrides: {},
  style: {},
};

describe("resolveDecision", () => {
  it("keeps ask with validated questions", () => {
    const d = resolveDecision(
      {
        decision: "ask",
        assistantMessage: "Tell me:",
        questions: [{ label: "Neckline", options: ["round", "V"] }],
      },
      false,
    );
    expect(d.decision).toBe("ask");
    expect(d.questions).toHaveLength(1);
    expect(d.questions![0].id).toBe("q0");
    expect(d.spec).toBeDefined();
  });

  it("degrades ask without usable questions to apply when a spec came along", () => {
    const d = resolveDecision(
      { decision: "ask", assistantMessage: "x", questions: [], spec: SPEC },
      false,
    );
    expect(d.decision).toBe("apply");
    expect(d.spec.type).toBe("tshirt");
  });

  it("forces apply when answering, even if the model asks again", () => {
    const d = resolveDecision(
      {
        decision: "ask",
        assistantMessage: "x",
        questions: [{ label: "Neckline", options: ["a", "b"] }],
        spec: SPEC,
      },
      true,
    );
    expect(d.decision).toBe("apply");
    expect(d.questions).toBeUndefined();
  });

  it("throws on apply without a spec object instead of fabricating a default", () => {
    expect(() =>
      resolveDecision({ decision: "apply", assistantMessage: "done" }, false),
    ).toThrow(/spec/);
  });

  it("throws on apply with an array spec (not a spec object)", () => {
    expect(() =>
      resolveDecision(
        { decision: "apply", assistantMessage: "done", spec: [] },
        false,
      ),
    ).toThrow(/spec/);
  });

  it("passes decline through without requiring a spec", () => {
    const d = resolveDecision(
      { decision: "decline", declineReason: "pants", assistantMessage: "no" },
      false,
    );
    expect(d.decision).toBe("decline");
    expect(d.declineReason).toBe("pants");
  });

  it("passes explain through without requiring a spec", () => {
    const d = resolveDecision(
      { decision: "explain", assistantMessage: "Pence é uma dobra costurada." },
      false,
    );
    expect(d.decision).toBe("explain");
    expect(d.assistantMessage).toBe("Pence é uma dobra costurada.");
  });

  it("keeps explain even when the user is answering clarifying questions", () => {
    const d = resolveDecision(
      { decision: "explain", assistantMessage: "Cava é onde a manga encaixa." },
      true,
    );
    expect(d.decision).toBe("explain");
  });

  it("throws on explain with a blank message instead of posting an empty bubble", () => {
    expect(() =>
      resolveDecision({ decision: "explain", assistantMessage: "   " }, false),
    ).toThrow(/explain/);
  });
});
