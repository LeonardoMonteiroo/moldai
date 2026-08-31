import { describe, it, expect } from "vitest";
import { composeEditorState, buildCredits } from "./compose";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";

const NOW = new Date("2026-08-17T12:00:00.000Z");

describe("composeEditorState", () => {
  it("merges pattern/chat/conflict with credits derived from the wallet", () => {
    const patternState = seedPatternState(t);
    const wallet = seedWallet(NOW);
    const state = composeEditorState(patternState, wallet, NOW);
    // pattern is a new object (updatedAt is spread onto it), but every other
    // field is carried over unchanged from the source pattern.
    expect(state.pattern).toEqual({
      ...patternState.pattern,
      updatedAt: NOW.toISOString(),
    });
    expect(state.chat).toBe(patternState.chat);
    expect(state.conflict).toBeNull();
    expect(state.credits).toEqual({
      plan: "free",
      balance: 30,
      total: 30,
      renewsInDays: 30,
      planInterval: "month",
    });
  });

  it("puts updatedAt on the wire and no savedAgo", () => {
    const patternState = seedPatternState(t);
    const wallet = seedWallet(NOW);
    const state = composeEditorState(
      patternState,
      wallet,
      new Date("2026-08-21T12:00:00Z"),
      new Date("2026-08-21T11:30:00Z"),
    );
    expect(state.pattern).not.toHaveProperty("savedAgo");
    expect(state.pattern.updatedAt).toBe("2026-08-21T11:30:00.000Z");
  });

  it("defaults updatedAt to now when the caller just mutated the row", () => {
    const patternState = seedPatternState(t);
    const wallet = seedWallet(NOW);
    const now = new Date("2026-08-21T12:00:00Z");
    const state = composeEditorState(patternState, wallet, now);
    expect(state.pattern.updatedAt).toBe(now.toISOString());
  });
});

describe("buildCredits", () => {
  it("builds a Credits object from a wallet, independent of any pattern", () => {
    const wallet = {
      plan: "atelier" as const,
      balance: 320,
      total: 500,
      purchased: 0,
      renewsAt: new Date("2026-09-01T00:00:00.000Z"),
      planInterval: "month" as const,
      planSourceExternalId: null,
    };
    const now = new Date("2026-08-18T00:00:00.000Z");
    expect(buildCredits(wallet, now)).toEqual({
      plan: "atelier",
      balance: 320,
      total: 500,
      renewsInDays: 14,
      planInterval: "month",
    });
  });

  it("carries the wallet's planInterval onto the wire", () => {
    const wallet = {
      plan: "atelier" as const,
      balance: 6000,
      total: 6000,
      purchased: 0,
      renewsAt: new Date("2027-08-17T00:00:00.000Z"),
      planInterval: "year" as const,
      planSourceExternalId: null,
    };
    const now = new Date("2026-08-18T00:00:00.000Z");
    expect(buildCredits(wallet, now).planInterval).toBe("year");
  });

  it("does not put a display label on the wire", () => {
    const wallet = {
      plan: "free" as const,
      balance: 30,
      total: 30,
      purchased: 0,
      renewsAt: new Date("2026-09-16T12:00:00.000Z"),
      planInterval: "month" as const,
      planSourceExternalId: null,
    };
    const now = new Date("2026-08-17T12:00:00.000Z");
    const credits = buildCredits(wallet, now);
    expect(credits).not.toHaveProperty("planLabel");
    expect(credits.plan).toBe("free");
  });
});
