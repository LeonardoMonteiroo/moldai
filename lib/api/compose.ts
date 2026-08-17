import { renewsInDays } from "@/lib/billing/wallet";
import type { Wallet } from "@/lib/billing/wallet";
import type { Credits, EditorState, MoldeState } from "@/lib/types";

// Builds the full wire/store EditorState from the molde's own state and the
// wallet — the client/store never know credits moved out of the molde blob.
export function composeEditorState(
  moldeState: MoldeState,
  wallet: Wallet,
  now: Date,
): EditorState {
  const credits: Credits = {
    plan: wallet.plan,
    planLabel: wallet.planLabel,
    balance: wallet.balance,
    total: wallet.total,
    renewsInDays: renewsInDays(wallet, now),
  };
  return { ...moldeState, credits };
}
