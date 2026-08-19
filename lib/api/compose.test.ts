import { describe, it, expect } from "vitest";
import { composeEditorState, buildCredits } from "./compose";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");

describe("composeEditorState", () => {
  it("merges pattern/chat/conflict with credits derived from the wallet", () => {
    const moldeState = seedPatternState();
    const wallet = seedWallet(NOW);
    const state = composeEditorState(moldeState, wallet, NOW);
    expect(state.pattern).toBe(moldeState.pattern);
    expect(state.chat).toBe(moldeState.chat);
    expect(state.conflict).toBeNull();
    expect(state.credits).toEqual({
      plan: "atelier",
      planLabel: "Ateliê",
      balance: 320,
      total: 500,
      renewsInDays: 12,
    });
  });
});

describe("buildCredits", () => {
  it("builds a Credits object from a wallet, independent of any molde", () => {
    const wallet = {
      plan: "atelier" as const,
      planLabel: "Ateliê",
      balance: 320,
      total: 500,
      renewsAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const now = new Date("2026-08-18T00:00:00.000Z");
    expect(buildCredits(wallet, now)).toEqual({
      plan: "atelier",
      planLabel: "Ateliê",
      balance: 320,
      total: 500,
      renewsInDays: 14,
    });
  });
});
