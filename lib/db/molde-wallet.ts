import { prisma } from "./prisma";
import { lockMolde, saveMolde, TX_OPTS } from "./molde";
import { lockWallet, saveWallet, saveLedger } from "./wallet";
import type { LedgerEntry, Wallet } from "@/lib/billing/wallet";
import type { MoldeState } from "@/lib/types";

// Locks BOTH rows in the SAME transaction, atomically — Molde ALWAYS first,
// then Wallet, in that fixed order. This is the only function in the codebase
// allowed to hold both locks at once; withWallet/withMolde alone are never
// combined with this in the same request, so the lock order can never invert
// and deadlock. Don't add a second combined-lock helper without preserving
// this order.
//
// If the molde doesn't exist or isn't the caller's, returns null WITHOUT
// locking the wallet — routes turn that into moldeNotFound().
export async function withMoldeAndWallet<T>(
  moldeId: string,
  userId: string,
  fn: (
    state: MoldeState,
    wallet: Wallet,
  ) =>
    | { result: T; entries: LedgerEntry[] }
    | Promise<{ result: T; entries: LedgerEntry[] }>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const state = await lockMolde(tx, moldeId, userId);
    if (!state) return null;
    const wallet = await lockWallet(tx, userId);
    const { result, entries } = await fn(state, wallet);
    await saveMolde(tx, moldeId, state);
    await saveWallet(tx, userId, wallet);
    await saveLedger(tx, userId, entries);
    return result;
  }, TX_OPTS);
}
