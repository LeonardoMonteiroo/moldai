import { describe, it, expect } from "vitest";
import { buildSystem } from "./prompt";
import type { PatternState } from "@/lib/types";
import { STYLE_LIMITS } from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import { COSTS } from "@/lib/types";
import { EXPORT_FORMATS } from "@/lib/export/formats";

function state(pieces: number, spec?: object): PatternState {
  return {
    pattern: {
      pieces: Array.from({ length: pieces }, (_, i) => ({ id: `p${i}` })),
      spec,
      sizeTable: { M: { bust: 88 } },
    },
    chat: [],
    conflict: null,
  } as unknown as PatternState;
}

describe("buildSystem", () => {
  it("quotes the validator's real bounds", () => {
    const s = buildSystem(state(0), false);
    const a = STYLE_LIMITS.armholeDeepenCm;
    expect(s).toContain(`armholeDeepenCm: ${a.min}–${a.max} cm`);
    const b = MEASUREMENT_RANGES.bust;
    expect(s).toContain(`bust: ${b.min}–${b.max} cm`);
  });

  it("tells the model to clamp out-of-range values and say so", () => {
    expect(buildSystem(state(0), false)).toContain("# Out-of-range values");
  });

  it("blank pattern gets the from-scratch/underspecified rule", () => {
    const s = buildSystem(state(0), false);
    expect(s).toContain("BLANK pattern");
    expect(s).not.toContain("already applied");
  });

  it("existing spec gets the full-updated-spec rule and embeds the spec JSON", () => {
    const s = buildSystem(state(3, { type: "tshirt" }), false);
    expect(s).toContain("already applied");
    expect(s).not.toContain("BLANK pattern");
    expect(s).toContain('"type":"tshirt"');
  });

  it("answering adds the never-ask-again override", () => {
    expect(buildSystem(state(0), true)).toContain(
      "Do NOT use decision=ask again",
    );
    expect(buildSystem(state(0), false)).not.toContain(
      "Do NOT use decision=ask again",
    );
  });

  it("embeds the size table", () => {
    expect(buildSystem(state(0), false)).toContain('"bust":88');
  });

  it("quotes the app's real credit costs", () => {
    const s = buildSystem(state(0), false);
    for (const [action, cost] of Object.entries(COSTS)) {
      expect(s).toContain(`${action}: ${cost} credit`);
    }
  });

  it("lists every export format the app can actually write", () => {
    const s = buildSystem(state(0), false);
    for (const format of EXPORT_FORMATS) {
      expect(s).toContain(format);
    }
  });

  it("carries the knowledge sections and the explain policy", () => {
    const s = buildSystem(state(0), false);
    expect(s).toContain("# Modeling knowledge");
    expect(s).toContain("# Product facts");
    expect(s).toContain("- explain:");
  });

  it("blank pattern answers a question instead of clarifying it", () => {
    const s = buildSystem(state(0), false);
    expect(s).toContain("BLANK pattern");
    expect(s).toContain("a question still gets decision=explain");
  });
});
