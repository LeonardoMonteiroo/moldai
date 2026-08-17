import { describe, it, expect } from "vitest";
import { composeEditorState } from "./compose";
import { seedMoldeState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");

describe("composeEditorState", () => {
  it("merges pattern/chat/conflict with credits derived from the wallet", () => {
    const moldeState = seedMoldeState();
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
