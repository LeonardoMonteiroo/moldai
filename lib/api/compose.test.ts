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
    expect(state.pattern).toBe(patternState.pattern);
    expect(state.chat).toBe(patternState.chat);
    expect(state.conflict).toBeNull();
    expect(state.credits).toEqual({
      plan: "free",
      balance: 30,
      total: 30,
      renewsInDays: 30,
    });
  });
});

describe("buildCredits", () => {
  it("builds a Credits object from a wallet, independent of any pattern", () => {
    const wallet = {
      plan: "atelier" as const,
      balance: 320,
      total: 500,
      renewsAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const now = new Date("2026-08-18T00:00:00.000Z");
    expect(buildCredits(wallet, now)).toEqual({
      plan: "atelier",
      balance: 320,
      total: 500,
      renewsInDays: 14,
    });
  });

  it("does not put a display label on the wire", () => {
    const wallet = {
      plan: "free" as const,
      balance: 30,
      total: 30,
      renewsAt: new Date("2026-09-16T12:00:00.000Z"),
    };
    const now = new Date("2026-08-17T12:00:00.000Z");
    const credits = buildCredits(wallet, now);
    expect(credits).not.toHaveProperty("planLabel");
    expect(credits.plan).toBe("free");
  });
});
