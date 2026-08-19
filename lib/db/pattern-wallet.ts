import { prisma } from "./prisma";
import { lockPattern, savePattern, TX_OPTS } from "./pattern";
import { lockWallet, saveWallet, saveLedger } from "./wallet";
import type { LedgerEntry, Wallet } from "@/lib/billing/wallet";
import type { PatternState } from "@/lib/types";

// Locks BOTH rows in the SAME transaction, atomically — Pattern ALWAYS first,
// then Wallet, in that fixed order. This is the only function in the codebase
// allowed to hold both locks at once; withWallet/withPattern alone are never
// combined with this in the same request, so the lock order can never invert
// and deadlock. Don't add a second combined-lock helper without preserving
// this order.
//
// If the pattern doesn't exist or isn't the caller's, returns null WITHOUT
// locking the wallet — routes turn that into patternNotFound().
export async function withPatternAndWallet<T>(
  patternId: string,
  userId: string,
  fn: (
    state: PatternState,
    wallet: Wallet,
  ) =>
    | { result: T; entries: LedgerEntry[] }
    | Promise<{ result: T; entries: LedgerEntry[] }>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const state = await lockPattern(tx, patternId, userId);
    if (!state) return null;
    const wallet = await lockWallet(tx, userId);
    const { result, entries } = await fn(state, wallet);
    await savePattern(tx, patternId, state);
    await saveWallet(tx, userId, wallet);
    await saveLedger(tx, userId, entries);
    return result;
  }, TX_OPTS);
}
