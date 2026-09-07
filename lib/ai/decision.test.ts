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

  // #138: assemblyOrder is a structured signal for the route (so it can tag
  // the persisted ChatMessage for the catalog-sourced disclaimer) -- it
  // must survive resolveDecision only for explain, and only when the model
  // actually set it true.
  it("carries assemblyOrder through for an explain answer that set it", () => {
    const d = resolveDecision(
      {
        decision: "explain",
        assistantMessage: "1. Pences. 2. Ombro. ...",
        assemblyOrder: true,
      },
      false,
    );
    expect(d.decision).toBe("explain");
    expect(d.assemblyOrder).toBe(true);
  });

  it("omits assemblyOrder for an ordinary explain answer", () => {
    const d = resolveDecision(
      { decision: "explain", assistantMessage: "Pence é uma dobra costurada." },
      false,
    );
    expect(d.assemblyOrder).toBeUndefined();
  });

  it("never carries assemblyOrder through for apply, even if the model set it", () => {
    const d = resolveDecision(
      {
        decision: "apply",
        assistantMessage: "ok",
        spec: SPEC,
        assemblyOrder: true,
      },
      false,
    );
    expect(d.decision).toBe("apply");
    expect(d.assemblyOrder).toBeUndefined();
  });

  it("throws on explain with a blank message instead of posting an empty bubble", () => {
    expect(() =>
      resolveDecision({ decision: "explain", assistantMessage: "   " }, false),
    ).toThrow(/explain/);
  });

  // #99: a truncated tool_use payload (e.g. hitting max_tokens) can arrive
  // with `decision` missing/undefined. Before this fix, neither throw guard
  // above tested for that, so it fell through to validateSpec(undefined),
  // fabricating a default blouse the route then silently applied over
  // whatever the user actually had, and charged for it.
  it("throws on a missing decision instead of falling through to a fabricated default", () => {
    expect(() =>
      resolveDecision(
        { assistantMessage: "x" } as unknown as Parameters<
          typeof resolveDecision
        >[0],
        false,
      ),
    ).toThrow(/decision/);
  });

  it("throws on an unrecognized decision value instead of passing it through", () => {
    expect(() =>
      resolveDecision(
        {
          decision: "banana" as unknown as "apply",
          assistantMessage: "x",
        },
        false,
      ),
    ).toThrow(/decision/);
  });

  // #53: RawToolInput types assistantMessage as `string`, but that is only
  // ever asserted at the SDK boundary, never checked -- a non-string value
  // used to pass straight through on decline/apply (only explain's own
  // blank-message guard happened to catch it, via a *different*, locally
  // computed variable this return statement didn't actually use).
  it("coerces a non-string assistantMessage instead of passing it through on decline", () => {
    const d = resolveDecision(
      {
        decision: "decline",
        assistantMessage: 12345 as unknown as string,
      },
      false,
    );
    expect(d.assistantMessage).toBe("");
  });

  it("coerces a non-string assistantMessage instead of passing it through on ask", () => {
    const d = resolveDecision(
      {
        decision: "ask",
        assistantMessage: 12345 as unknown as string,
        questions: [{ label: "Neckline", options: ["a", "b"] }],
      },
      false,
    );
    expect(d.assistantMessage).toBe("");
  });

  // #258: the model's own part-by-part read of an attached image -- carried
  // through for every decision (an image can arrive alongside ask/decline
  // too, not just apply), and never fatal when absent (no image on the
  // turn, or an image turn the model simply skipped it on).
  describe("garmentReading", () => {
    it("carries garmentReading through on apply", () => {
      const d = resolveDecision(
        {
          decision: "apply",
          assistantMessage: "ok",
          spec: SPEC,
          garmentReading: "Gola V, manga curta.",
        },
        false,
      );
      expect(d.garmentReading).toBe("Gola V, manga curta.");
    });

    it("carries garmentReading through on ask", () => {
      const d = resolveDecision(
        {
          decision: "ask",
          assistantMessage: "Tell me:",
          questions: [{ label: "Neckline", options: ["round", "V"] }],
          garmentReading: "Vestido sem manga.",
        },
        false,
      );
      expect(d.decision).toBe("ask");
      expect(d.garmentReading).toBe("Vestido sem manga.");
    });

    it("carries garmentReading through on decline", () => {
      const d = resolveDecision(
        {
          decision: "decline",
          declineReason: "pants",
          assistantMessage: "no",
          garmentReading: "Calça jeans.",
        },
        false,
      );
      expect(d.garmentReading).toBe("Calça jeans.");
    });

    it("omits garmentReading entirely when the model didn't set it -- never fatal", () => {
      const d = resolveDecision(
        { decision: "apply", assistantMessage: "ok", spec: SPEC },
        false,
      );
      expect(d.garmentReading).toBeUndefined();
    });

    it("coerces a non-string garmentReading instead of passing it through", () => {
      const d = resolveDecision(
        {
          decision: "apply",
          assistantMessage: "ok",
          spec: SPEC,
          garmentReading: 12345 as unknown as string,
        },
        false,
      );
      expect(d.garmentReading).toBeUndefined();
    });

    it("treats a blank/whitespace-only garmentReading as absent", () => {
      const d = resolveDecision(
        {
          decision: "apply",
          assistantMessage: "ok",
          spec: SPEC,
          garmentReading: "   ",
        },
        false,
      );
      expect(d.garmentReading).toBeUndefined();
    });
  });

  // #250: describeSpecAdjustments runs here, the one place both the raw
  // tool payload and validateSpec's own return value exist.
  describe("adjustments", () => {
    it("reports a field validateSpec had to substitute a default for", () => {
      const d = resolveDecision(
        {
          decision: "apply",
          assistantMessage: "ok",
          spec: { ...SPEC, style: { collar: "peterPan" } },
        },
        false,
      );
      expect(d.spec.style.collar).toBe("none");
      expect(d.adjustments).toEqual([
        {
          kind: "substituted",
          field: "collar",
          requested: "peterPan",
          used: "none",
        },
      ]);
    });

    it("omits adjustments entirely for a clean spec", () => {
      const d = resolveDecision(
        { decision: "apply", assistantMessage: "ok", spec: SPEC },
        false,
      );
      expect(d.adjustments).toBeUndefined();
    });

    it("reports adjustments on ask too, ahead of any answer", () => {
      const d = resolveDecision(
        {
          decision: "ask",
          assistantMessage: "Tell me:",
          questions: [{ label: "Neckline", options: ["round", "V"] }],
          spec: { ...SPEC, style: { cuff: "gnorf" } },
        },
        false,
      );
      expect(d.decision).toBe("ask");
      expect(d.adjustments).toEqual([
        {
          kind: "substituted",
          field: "cuff",
          requested: "gnorf",
          used: "none",
        },
      ]);
    });
  });
});
