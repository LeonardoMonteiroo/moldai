import { renewsInDays } from "@/lib/billing/wallet";
import type { Wallet } from "@/lib/billing/wallet";
import type { Credits, EditorState, PatternState } from "@/lib/types";

export function buildCredits(wallet: Wallet, now: Date): Credits {
  return {
    plan: wallet.plan,
    balance: wallet.balance,
    total: wallet.total,
    renewsInDays: renewsInDays(wallet, now),
    planInterval: wallet.planInterval,
  };
}

// Builds the full wire/store EditorState from the pattern's own state and the
// wallet — the client/store never know credits moved out of the pattern blob.
// `updatedAt` defaults to `now` because every mutating caller (withPattern/
// withPatternAndWallet) has just written "updatedAt" = now() on the row in
// the same transaction — the two non-mutating readers (GET /api/patterns/[id]
// and the purchase route) pass the row's own stored `updatedAt` instead.
export function composeEditorState(
  patternState: PatternState,
  wallet: Wallet,
  now: Date,
  updatedAt: Date = now,
): EditorState {
  return {
    ...patternState,
    pattern: { ...patternState.pattern, updatedAt: updatedAt.toISOString() },
    credits: buildCredits(wallet, now),
  };
}
