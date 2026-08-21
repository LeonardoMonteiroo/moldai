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
} from "./state";
import { t } from "@/lib/i18n/test-translate";

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
    expect(s.pattern.updatedAt).toBeUndefined();
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
    expect(s.pattern.pieces.length).toBe(1);
    expect(s.pattern.pieces[0].id).toBe("skirt");
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
