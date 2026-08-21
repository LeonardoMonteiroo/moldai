import { renewsInDays } from "@/lib/billing/wallet";
import type { Wallet } from "@/lib/billing/wallet";
import type { Credits, EditorState, PatternState } from "@/lib/types";

export function buildCredits(wallet: Wallet, now: Date): Credits {
  return {
    plan: wallet.plan,
    balance: wallet.balance,
    total: wallet.total,
    renewsInDays: renewsInDays(wallet, now),
  };
}

// Builds the full wire/store EditorState from the pattern's own state and the
// wallet — the client/store never know credits moved out of the pattern blob.
export function composeEditorState(
  patternState: PatternState,
  wallet: Wallet,
  now: Date,
): EditorState {
  return { ...patternState, credits: buildCredits(wallet, now) };
}
