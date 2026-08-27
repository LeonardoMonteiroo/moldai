import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSystem, COST_DESCRIPTIONS } from "./prompt";
import type { PatternState } from "@/lib/types";
import { STYLE_LIMITS, COLLARS, CUFFS, WAISTBANDS } from "@/lib/draft/garment";
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

  it("quotes the app's real credit costs, as human-readable descriptions", () => {
    const s = buildSystem(state(0), false);
    for (const [label, cost] of COST_DESCRIPTIONS) {
      expect(s).toContain(`${label}: ${cost} credit`);
    }
  });

  it("never renders a raw COSTS enum key (e.g. 'cuttingPlan') for the model to quote verbatim", () => {
    // #108: the model once echoed the raw camelCase key "cuttingPlan" back
    // into a pt-BR answer instead of a translatable description. Guard
    // against any COSTS key shape (not just the ones that existed then)
    // leaking through unlabeled.
    const s = buildSystem(state(0), false);
    for (const key of Object.keys(COSTS)) {
      expect(s).not.toContain(`- ${key}:`);
    }
  });

  it("every cost quoted in the prompt corresponds to a real debit site", () => {
    // #108: COSTS.generate and COSTS.cuttingPlan were quoted here and in
    // /settings?section=plan but never debited anywhere — this is the
    // structural guard the display-only-constant class of bug needs: prove
    // each COST_DESCRIPTIONS entry's number is the one an actual route
    // debits (or, for the free action, that its route truly never debits).
    const read = (relPath: string) =>
      readFileSync(join(process.cwd(), relPath), "utf-8");

    const generateRoute = read("app/api/patterns/[id]/generate/route.ts");
    expect(generateRoute).toContain("COSTS.adjust");

    const graduateRoute = read("app/api/patterns/[id]/graduate/route.ts");
    expect(graduateRoute).toContain("COSTS.graduate");

    const resolveRoute = read(
      "app/api/patterns/[id]/conflict/resolve/route.ts",
    );
    expect(resolveRoute).not.toContain("debitWallet");
    expect(resolveRoute).not.toContain("withPatternAndWallet");

    // Exactly the three actions verified above — catches a new,
    // unverified entry being added to the prompt without extending this
    // test to check its route too.
    expect(COST_DESCRIPTIONS).toHaveLength(3);
    expect(COST_DESCRIPTIONS.map(([, cost]) => cost)).toEqual([
      COSTS.adjust,
      COSTS.graduate,
      COSTS.correction,
    ]);
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

  // #125: the AI's only lever for "looser"/"more fitted" must be the fit
  // class, not measurementOverrides -- inflating the recorded body
  // measurements to fake ease corrupts the frozen sizeTable snapshot.
  it("instructs the model to express fit via the fit class, never via measurementOverrides", () => {
    const s = buildSystem(state(0), false);
    expect(s).toContain("fit (woven garments");
    expect(s).toContain("never by inflating measurementOverrides");
    expect(s).toContain("stretch (knit garments");
  });

  // #129/#130/#131: the sub-piece catalogs render from the same exported
  // constants the schema/validator use, and the model is told not to
  // silently substitute an unsupported shape.
  it("quotes the collar/cuff/waistband catalogs and tells the model not to silently substitute", () => {
    const s = buildSystem(state(0), false);
    for (const v of COLLARS) expect(s).toContain(v);
    for (const v of CUFFS) expect(s).toContain(v);
    for (const v of WAISTBANDS) expect(s).toContain(v);
    expect(s).toContain("don't silently substitute");
  });
});
