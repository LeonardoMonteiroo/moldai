import { describe, it, expect } from "vitest";
import {
  seedPatternState,
  addMessage,
  bumpVersion,
  setConflict,
  applyGarmentSpec,
  refitSleeve,
  getSpec,
  applySizes,
  seedPatternSizeSnapshot,
} from "./state";
import { t } from "@/lib/i18n/test-translate";
import type { SizeChartData } from "@/lib/types";
import { DEFAULT_ENGINE_ID } from "@/lib/draft/engine/capability";
import { SIZE_TABLE } from "@/lib/measurements";

describe("seedPatternState", () => {
  it("takes the new-pattern name from the translator", () => {
    const echo = (key: string) => key;
    const s = seedPatternState(echo);
    expect(s.pattern.name).toBe("newPatternName");
  });
  it("blank pattern: no pieces, empty chat, version 0, no conflict", () => {
    const s = seedPatternState(t);
    expect(s.pattern.pieces).toHaveLength(0);
    expect(s.chat).toHaveLength(0);
    expect(s.pattern.version).toBe(0);
    expect(s.conflict).toBeNull();
  });
  it("each call returns an independent state (no aliasing)", () => {
    const a = seedPatternState(t);
    const b = seedPatternState(t);
    a.pattern.version = 9;
    expect(b.pattern.version).toBe(0);
  });
});

describe("version and chat", () => {
  it("bumpVersion increments the version", () => {
    const s = seedPatternState(t);
    bumpVersion(s);
    expect(s.pattern.version).toBe(1);
    // updatedAt is never part of the persisted blob — it's composed onto the
    // wire from the row's own column (lib/api/compose.ts), not set here.
    // (Pattern has no updatedAt field at all now, so `toHaveProperty` is the
    // form that still type-checks; the invariant asserted is unchanged.)
    expect(s.pattern).not.toHaveProperty("updatedAt");
  });
  it("addMessage appends to the chat", () => {
    const s = seedPatternState(t);
    addMessage(s, { id: "m1", author: "user", text: "oi", createdAt: 1 });
    expect(s.chat).toHaveLength(1);
    expect(s.chat[0].id).toBe("m1");
  });
});

describe("applyGarmentSpec / conflict / refit / engine freeze", () => {
  // #267: absent-means-default is the entire no-migration guarantee for the
  // engine freeze -- a legacy pattern with no `engine` key must draft
  // byte-identical pieces to one explicitly frozen to "moldai".
  it("drafts identically whether pattern.engine is absent or explicitly moldai", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const },
    };
    const absent = seedPatternState(t);
    delete absent.pattern.engine;
    applyGarmentSpec(absent, spec, t);

    const explicit = seedPatternState(t);
    explicit.pattern.engine = "moldai";
    applyGarmentSpec(explicit, spec, t);

    expect(absent.pattern.pieces).toEqual(explicit.pattern.pieces);
  });

  // #267: applyGarmentSpec never writes pattern.engine -- it only reads the
  // already-frozen choice (seedPatternSizeSnapshot is the one and only
  // writer), so repeated regeneration can never drift it.
  it("never changes an already-frozen pattern.engine, across repeated regenerations", () => {
    const s = seedPatternState(t);
    s.pattern.engine = "moldai";
    applyGarmentSpec(
      s,
      { type: "blouse", measurementOverrides: {}, style: {} },
      t,
    );
    applyGarmentSpec(
      s,
      { type: "dress", measurementOverrides: {}, style: {} },
      t,
    );
    expect(s.pattern.engine).toBe("moldai");
  });

  it("drafts a skirt and stores it on the pattern", () => {
    const s = seedPatternState(t);
    applyGarmentSpec(
      s,
      {
        type: "skirt",
        measurementOverrides: {},
        style: { skirt: "circle" },
      },
      t,
    );
    // #131: a skirt also drafts its default waistband now.
    expect(s.pattern.pieces.length).toBe(2);
    expect(s.pattern.pieces[0].id).toBe("skirt");
    expect(s.pattern.pieces[1].id).toBe("waistband");
    expect(s.pattern.viewBox!.w).toBeGreaterThan(0);
  });
  it("armholeDeepenCm attaches a conflict; no adjustment means no conflict", () => {
    const s = seedPatternState(t);
    applyGarmentSpec(
      s,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short" },
      },
      t,
    );
    expect(s.conflict).toBeNull();
    applyGarmentSpec(
      s,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", armholeDeepenCm: 2 },
      },
      t,
    );
    expect(s.conflict).not.toBeNull();
    expect(s.conflict!.diffCm).toBeGreaterThan(1);
    expect(s.conflict!.pieceBId).toBe("sleeve");
    expect(s.conflict!.suggestion).toBe("conflict.suggestion");
  });
  it("EditorState with pieces survives a JSON round-trip (JSONB persistence)", () => {
    const s = seedPatternState(t);
    applyGarmentSpec(
      s,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short" },
      },
      t,
    );
    const round = JSON.parse(JSON.stringify(s)) as typeof s;
    expect(round.pattern.pieces.map((p) => p.id).sort()).toEqual(
      s.pattern.pieces.map((p) => p.id).sort(),
    );
    expect(round.pattern.viewBox).toEqual(s.pattern.viewBox);
    expect(round).toEqual(s); // no field lost (no Date/undefined/NaN/Map/Set)
  });
  // #241: a pair whose gap closes at the base size can still miss tolerance
  // only at a graded size (Islam et al., Tekstilec 63(3):166-184 -- a
  // diagonal seam's length isn't a linear function of independent X/Y
  // grading increments). armholeDeepenCm=0.55 with SIZE_TABLE.M as the base
  // row measures 1.0cm on the armhole/cap pair (not > SEAM_TOLERANCE_CM,
  // so no conflict); the exact same spec against a much broader shoulder
  // measures 1.1cm (over tolerance) -- empirically found via
  // measureSeamGraph, not derived from a closed-form formula.
  it("a spec that closes at the base size still surfaces a conflict once a graded size diverges", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const, armholeDeepenCm: 0.55 },
    };

    // Control: with ONLY the base row in sizeTable, this spec closes clean.
    const baseOnly = seedPatternState(t);
    baseOnly.pattern.baseSize = "M";
    baseOnly.pattern.sizeTable = { M: SIZE_TABLE.M };
    applyGarmentSpec(baseOnly, spec, t);
    expect(baseOnly.conflict).toBeNull();

    // Same spec, same base row -- but sizeTable also carries a graded size
    // whose broader shoulder measurement pushes the SAME pair over tolerance.
    const s = seedPatternState(t);
    s.pattern.baseSize = "M";
    s.pattern.sizeTable = {
      M: SIZE_TABLE.M,
      "GG-extremo": { ...SIZE_TABLE.M, shoulder: 26 },
    };
    applyGarmentSpec(s, spec, t);

    expect(s.conflict).not.toBeNull();
    const entry = s.conflict!.entries?.find((e) => e.key === "armhole-cap");
    expect(entry).toBeDefined();
    expect(entry!.sizes).toEqual(["GG-extremo"]);
    // The base-size behaviour (apply-with-warning, tone: conflict) is
    // unchanged -- the pattern still drafted and the conflict still uses
    // the same "Corrigir manga" chrome, since armhole-cap is fixable.
    expect(s.pattern.pieces.length).toBeGreaterThan(0);
    expect(s.conflict!.suggestion).toBe("conflict.suggestion");
    // The single divergence is size-only (invisible at base), so it gets
    // its own title/description catalog keys naming the sizes -- never the
    // legacy armhole/cap copy, which would describe the (non-diverging)
    // base numbers.
    expect(s.conflict!.title).toBe("conflict.titleForSizeOnly");
    expect(s.conflict!.description).toBe("conflict.descriptionSizeOnly");
  });

  // #241: entry.sizes reads in the chart's own declared small-to-large
  // order, not alphabetically -- "PP" before "GG" even though "GG" sorts
  // first lexicographically.
  it("names multiple affected sizes in the chart's declared order, not alphabetically", () => {
    const spec = {
      type: "blouse" as const,
      gender: "female" as const,
      measurementOverrides: {},
      style: { sleeve: "short" as const, armholeDeepenCm: 0.55 },
    };
    const s = seedPatternState(t);
    s.pattern.baseSize = "M";
    s.pattern.sizes = ["PP", "P", "M", "G", "GG"];
    s.pattern.sizeTable = {
      M: SIZE_TABLE.M,
      GG: { ...SIZE_TABLE.M, shoulder: 26 },
      PP: { ...SIZE_TABLE.M, shoulder: 26 },
    };
    applyGarmentSpec(s, spec, t);

    const entry = s.conflict!.entries?.find((e) => e.key === "armhole-cap");
    expect(entry!.sizes).toEqual(["PP", "GG"]);
  });

  it("refitSleeve remakes the cap and clears the conflict", () => {
    const s = seedPatternState(t);
    applyGarmentSpec(
      s,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", armholeDeepenCm: 2 },
      },
      t,
    );
    expect(s.conflict).not.toBeNull();
    refitSleeve(s, t);
    expect(s.conflict).toBeNull();
    expect(getSpec(s).style.sleeveRefit).toBe(true);
  });
});

describe("setConflict / applySizes", () => {
  it("setConflict(null) clears the warning", () => {
    const s = seedPatternState(t);
    applyGarmentSpec(
      s,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { sleeve: "short", armholeDeepenCm: 2 },
      },
      t,
    );
    setConflict(s, null);
    expect(s.conflict).toBeNull();
  });
  it("applySizes moves pending to applied", () => {
    const s = seedPatternState(t);
    applySizes(s, ["PP", "P"]);
    expect(s.pattern.sizesApplied).toEqual(expect.arrayContaining(["PP", "P"]));
    expect(s.pattern.sizesPending).not.toContain("PP");
  });
});

describe("seedPatternSizeSnapshot", () => {
  const chart: SizeChartData = {
    name: "Feminino adulto · ABNT",
    gender: "female",
    bodyType: "straight",
    isSystem: true,
    sizes: ["P", "M", "G"],
    baseSizeIndex: 1,
    baseMeasurements: { ...SIZE_TABLE.M },
    progressionRule: { bust: 4 },
    overrides: {},
  };

  it("freezes the chart's sizes and base size onto the pattern", () => {
    const s = seedPatternState(t);
    seedPatternSizeSnapshot(s, chart, DEFAULT_ENGINE_ID);
    expect(s.pattern.sizes).toEqual(["P", "M", "G"]);
    expect(s.pattern.baseSize).toBe("M");
    expect(Object.keys(s.pattern.sizeTable)).toEqual(["P", "M", "G"]);
  });

  // Recorded so the tech sheet can say which grade a pattern was drafted from.
  // Frozen at snapshot time for the same reason sizeTable is: renaming or
  // reassigning the chart later must not rewrite an existing pattern's history.
  it("records the name of the chart it drafted from", () => {
    const s = seedPatternState(t);
    seedPatternSizeSnapshot(s, chart, DEFAULT_ENGINE_ID);
    expect(s.pattern.sizeChartName).toBe("Feminino adulto · ABNT");
  });

  // #267: the engine is frozen in the SAME assignment as sizeTable/
  // sizeChartName -- one function, one moment.
  it("records the drafting engine it drafted with", () => {
    const s = seedPatternState(t);
    seedPatternSizeSnapshot(s, chart, DEFAULT_ENGINE_ID);
    expect(s.pattern.engine).toBe("moldai");
  });
});
