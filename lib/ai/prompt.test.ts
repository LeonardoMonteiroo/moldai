import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSystem,
  buildDynamicSection,
  STATIC_SECTIONS,
  COST_DESCRIPTIONS,
} from "./prompt";
import type { GarmentSpec, PatternState } from "@/lib/types";
import {
  STYLE_LIMITS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
} from "@/lib/draft/garment";
import { MEASUREMENT_RANGES, SIZE_TABLE } from "@/lib/measurements";
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
    const s = buildSystem(state(0), { answering: false });
    const a = STYLE_LIMITS.armholeDeepenCm;
    expect(s).toContain(`armholeDeepenCm: ${a.min}–${a.max} cm`);
    const b = MEASUREMENT_RANGES.bust;
    expect(s).toContain(`bust: ${b.min}–${b.max} cm`);
  });

  it("tells the model to clamp out-of-range values and say so", () => {
    expect(buildSystem(state(0), { answering: false })).toContain(
      "# Out-of-range values",
    );
  });

  it("blank pattern gets the from-scratch/underspecified rule", () => {
    const s = buildSystem(state(0), { answering: false });
    expect(s).toContain("BLANK pattern");
    expect(s).not.toContain("already applied");
  });

  it("omits the import-reconstruction section when importContext is not given", () => {
    expect(buildSystem(state(0), { answering: false })).not.toContain(
      "Imported pattern reconstruction",
    );
  });

  it("adds an import-reconstruction section that embeds importContext verbatim", () => {
    const ctx = "Detected 2 piece(s) on the file's own cut-line layer(s).";
    const s = buildSystem(state(0), { answering: false, importContext: ctx });
    expect(s).toContain("Imported pattern reconstruction");
    expect(s).toContain(ctx);
  });

  it("tells the model to trust measured data over its own visual read", () => {
    const s = buildSystem(state(0), {
      answering: false,
      importContext: "some context",
    });
    expect(s).toMatch(/trust/i);
  });

  it("existing spec gets the full-updated-spec rule and embeds the spec JSON", () => {
    const s = buildSystem(state(3, { type: "tshirt" }), { answering: false });
    expect(s).toContain("already applied");
    expect(s).not.toContain("BLANK pattern");
    expect(s).toContain('"type":"tshirt"');
  });

  it("answering adds the never-ask-again override", () => {
    expect(buildSystem(state(0), { answering: true })).toContain(
      "Do NOT use decision=ask again",
    );
    expect(buildSystem(state(0), { answering: false })).not.toContain(
      "Do NOT use decision=ask again",
    );
  });

  it("embeds the size table", () => {
    expect(buildSystem(state(0), { answering: false })).toContain('"bust":88');
  });

  it("quotes the app's real credit costs, as human-readable descriptions", () => {
    const s = buildSystem(state(0), { answering: false });
    for (const [label, cost] of COST_DESCRIPTIONS) {
      expect(s).toContain(`${label}: ${cost} credit`);
    }
  });

  it("never renders a raw COSTS enum key (e.g. 'cuttingPlan') for the model to quote verbatim", () => {
    // #108: the model once echoed the raw camelCase key "cuttingPlan" back
    // into a pt-BR answer instead of a translatable description. Guard
    // against any COSTS key shape (not just the ones that existed then)
    // leaking through unlabeled.
    const s = buildSystem(state(0), { answering: false });
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
    const s = buildSystem(state(0), { answering: false });
    for (const format of EXPORT_FORMATS) {
      expect(s).toContain(format);
    }
  });

  it("carries the knowledge sections and the explain policy", () => {
    const s = buildSystem(state(0), { answering: false });
    expect(s).toContain("# Modeling knowledge");
    expect(s).toContain("# Product facts");
    expect(s).toContain("- explain:");
  });

  it("blank pattern answers a question instead of clarifying it", () => {
    const s = buildSystem(state(0), { answering: false });
    expect(s).toContain("BLANK pattern");
    expect(s).toContain("a question still gets decision=explain");
  });

  // #125: the AI's only lever for "looser"/"more fitted" must be the fit
  // class, not measurementOverrides -- inflating the recorded body
  // measurements to fake ease corrupts the frozen sizeTable snapshot.
  it("instructs the model to express fit via the fit class, never via measurementOverrides", () => {
    const s = buildSystem(state(0), { answering: false });
    expect(s).toContain("fit (woven garments");
    expect(s).toContain("never by inflating measurementOverrides");
    expect(s).toContain("stretch (knit garments");
  });

  // #129/#130/#131: the sub-piece catalogs render from the same exported
  // constants the schema/validator use, and the model is told not to
  // silently substitute an unsupported shape.
  it("quotes the collar/cuff/waistband/frontClosure catalogs and tells the model not to silently substitute", () => {
    const s = buildSystem(state(0), { answering: false });
    for (const v of COLLARS) expect(s).toContain(v);
    for (const v of CUFFS) expect(s).toContain(v);
    for (const v of WAISTBANDS) expect(s).toContain(v);
    for (const v of FRONT_CLOSURES) expect(s).toContain(v);
    expect(s).toContain("don't silently substitute");
  });

  // #138: the sewing-order feature. The instruction section is always
  // present (it doesn't depend on a draft existing); the actual "Assembly
  // order" JSON only appears once buildAssemblyOrder can derive one (a
  // real spec/pieces/sizeTable/baseSize) -- state(0)'s own fixture never
  // sets baseSize (see the top-of-file `state()` helper), matching how
  // this file never asserts on the ease-report JSON's presence either.
  it("carries the assembly/sewing-order instruction and never-invent-a-step rule", () => {
    const s = buildSystem(state(0), { answering: false });
    expect(s).toContain("# Assembly / sewing order");
    expect(s).toContain("assemblyOrder=true");
    expect(s).toContain("Never invent, skip, reorder, or merge a step");
    expect(s).not.toContain('"steps":');
  });

  it("embeds the derived Assembly order JSON once a real spec/pieces/sizeTable/baseSize exist", () => {
    const withPieces: PatternState = {
      pattern: {
        id: "p1",
        name: "Molde",
        version: 1,
        baseSize: "M",
        unit: "cm",
        sizes: ["PP", "P", "M", "G", "GG"],
        sizesApplied: [],
        sizesPending: [],
        sizeTable: { M: SIZE_TABLE.M },
        pieces: [
          {
            id: "body-front",
            name: "Frente",
            qty: 1,
            outline: { kind: "polygon", points: "0,0" },
            label: { x: 0, y: 0 },
            detailRows: [],
          },
        ],
        spec: {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: { sleeve: "short", darts: true },
        },
      },
      chat: [],
      conflict: null,
    };
    const s = buildSystem(withPieces, { answering: false });
    expect(s).toContain("Assembly order (structured");
    expect(s).toContain('"steps":');
    expect(s).toContain('"hasConflict":false');
    expect(s).toContain('"key":"shoulder"');
    expect(s).toContain('"key":"armhole-cap"');
  });
});

// The form's explicit choices reach the model as an instruction, so its own
// reply text stays coherent and it does not ask about an answered field.
// The structural guarantee is the merge the route applies afterwards; this
// section is what keeps the model's prose from contradicting it.
describe("buildSystem: the fields-already-decided section", () => {
  const HEADING = "# Fields already decided by the user";
  const formSpec: GarmentSpec = {
    type: "blouse",
    gender: "male",
    measurementOverrides: {},
    style: { collar: "band", sleeve: "long" },
  };

  it("omits the section entirely when no formSpec is given", () => {
    const s = buildSystem(state(0), { answering: false });
    expect(s).not.toContain(HEADING);
  });

  // "byte-identical to the pre-change output for the same state", proven
  // structurally rather than against a stored file: the whole prompt is
  // still exactly the two parts joined, and adding a formSpec only appends.
  it("keeps buildSystem as STATIC_SECTIONS plus the dynamic section, unchanged", () => {
    const opts = { answering: false };
    expect(buildSystem(state(0), opts)).toBe(
      `${STATIC_SECTIONS}\n\n${buildDynamicSection(state(0), opts)}`,
    );
  });

  it("appends the section without touching a byte of what came before", () => {
    const withoutForm = buildSystem(state(0), { answering: false });
    const withForm = buildSystem(state(0), { answering: false, formSpec });
    expect(withForm.startsWith(withoutForm)).toBe(true);
    const added = withForm.slice(withoutForm.length);
    expect(added.startsWith(`\n\n${HEADING}\n\n`)).toBe(true);
    expect(added.endsWith(`\n\n${JSON.stringify(formSpec)}`)).toBe(true);
  });

  it("emits the section exactly once", () => {
    const s = buildSystem(state(0), { answering: false, formSpec });
    expect(s.split(HEADING)).toHaveLength(2);
  });

  it("embeds the form spec as JSON verbatim", () => {
    const s = buildSystem(state(0), { answering: false, formSpec });
    expect(s).toContain(JSON.stringify(formSpec));
  });

  // The blank-pattern rule tells the model to `ask` whenever a from-scratch
  // request carries little more than a garment type -- exactly what a
  // minimally-filled form sends. The section has to read as the LATER
  // instruction, so assert the ordering, not just that both are present.
  it("comes after the blank-pattern ask instruction it overrides", () => {
    const s = buildSystem(state(0), { answering: false, formSpec });
    const blankRule = s.indexOf("use decision=ask before drafting");
    const section = s.indexOf(HEADING);
    expect(blankRule).toBeGreaterThan(-1);
    expect(section).toBeGreaterThan(blankRule);
  });

  it("overrides that rule in words, preferring apply over ask", () => {
    const s = buildSystem(state(0), { answering: false, formSpec });
    expect(s).toContain("NOT underspecified");
    expect(s).toContain("prefer apply over ask");
  });

  it("tells the model not to ask about, and not to contradict, a listed field", () => {
    const s = buildSystem(state(0), { answering: false, formSpec });
    expect(s).toContain("do NOT ask about it");
    expect(s).toContain("do NOT contradict it in assistantMessage");
  });

  // The section is per-call data, so it must live in the dynamic block --
  // STATIC_SECTIONS carries the Anthropic cache breakpoint and only stays a
  // cache hit while it is byte-identical across every user and request.
  it("lives in the dynamic block, leaving STATIC_SECTIONS untouched", () => {
    expect(STATIC_SECTIONS).not.toContain(HEADING);
    expect(STATIC_SECTIONS).not.toContain("prefer apply over ask");
    const dynamic = buildDynamicSection(state(0), {
      answering: false,
      formSpec,
    });
    expect(dynamic).toContain(HEADING);
  });
});
