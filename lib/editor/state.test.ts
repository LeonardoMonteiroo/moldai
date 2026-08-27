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

describe("applyGarmentSpec / conflict / refit", () => {
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
    baseMeasurements: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    },
    progressionRule: { bust: 4 },
    overrides: {},
  };

  it("freezes the chart's sizes and base size onto the pattern", () => {
    const s = seedPatternState(t);
    seedPatternSizeSnapshot(s, chart);
    expect(s.pattern.sizes).toEqual(["P", "M", "G"]);
    expect(s.pattern.baseSize).toBe("M");
    expect(Object.keys(s.pattern.sizeTable)).toEqual(["P", "M", "G"]);
  });

  // Recorded so the tech sheet can say which grade a pattern was drafted from.
  // Frozen at snapshot time for the same reason sizeTable is: renaming or
  // reassigning the chart later must not rewrite an existing pattern's history.
  it("records the name of the chart it drafted from", () => {
    const s = seedPatternState(t);
    seedPatternSizeSnapshot(s, chart);
    expect(s.pattern.sizeChartName).toBe("Feminino adulto · ABNT");
  });
});
