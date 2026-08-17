import { describe, it, expect } from "vitest";
import {
  seedState,
  addMessage,
  debitCredits,
  refundCredits,
  bumpVersion,
  setConflict,
  applyGarmentSpec,
  refitSleeve,
  getSpec,
  applySizes,
  applyPurchase,
} from "./state";
import { t } from "@/lib/i18n/test-translate";

describe("seedState", () => {
  it("blank molde: no pieces, empty chat, version 0, Ateliê credits 320/500", () => {
    const s = seedState();
    expect(s.pattern.pieces).toHaveLength(0);
    expect(s.chat).toHaveLength(0);
    expect(s.pattern.version).toBe(0);
    expect(s.conflict).toBeNull();
    expect(s.credits.balance).toBe(320);
    expect(s.credits.total).toBe(500);
    expect(s.credits.plan).toBe("atelier");
  });
  it("each call returns an independent state (no aliasing)", () => {
    const a = seedState();
    const b = seedState();
    a.credits.balance = 0;
    expect(b.credits.balance).toBe(320);
  });
});

describe("credits and version", () => {
  it("debit/refund adjust the balance", () => {
    const s = seedState();
    debitCredits(s, 4);
    expect(s.credits.balance).toBe(316);
    refundCredits(s, 4);
    expect(s.credits.balance).toBe(320);
  });
  it("bumpVersion increments and marks saved just now", () => {
    const s = seedState();
    bumpVersion(s);
    expect(s.pattern.version).toBe(1);
    expect(s.pattern.savedAgo).toBe("salvo agora");
  });
  it("addMessage appends to the chat", () => {
    const s = seedState();
    addMessage(s, { id: "m1", author: "user", text: "oi", createdAt: 1 });
    expect(s.chat).toHaveLength(1);
    expect(s.chat[0].id).toBe("m1");
  });
});

describe("applyGarmentSpec / conflict / refit", () => {
  it("drafts a skirt and stores it on the pattern", () => {
    const s = seedState();
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
    const s = seedState();
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
    const s = seedState();
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
    const s = seedState();
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

describe("setConflict / applySizes / applyPurchase", () => {
  it("setConflict(null) clears the warning", () => {
    const s = seedState();
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
    const s = seedState();
    applySizes(s, ["PP", "P"]);
    expect(s.pattern.sizesApplied).toEqual(expect.arrayContaining(["PP", "P"]));
    expect(s.pattern.sizesPending).not.toContain("PP");
  });
  it("applyPurchase topup adds 100; subscribe resets to the Ateliê plan", () => {
    const s = seedState();
    applyPurchase(s, "topup");
    expect(s.credits.balance).toBe(420);
    const s2 = seedState();
    s2.credits.balance = 10;
    applyPurchase(s2, "subscribe");
    expect(s2.credits.balance).toBe(510);
    expect(s2.credits.total).toBe(500);
    expect(s2.credits.renewsInDays).toBe(30);
  });
});
