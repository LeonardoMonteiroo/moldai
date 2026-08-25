import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { lockPattern, savePattern, TX_OPTS } from "./pattern";
import { lockWallet, saveWallet, saveLedger } from "./wallet";
import type { LedgerEntry, Wallet } from "@/lib/billing/wallet";
import type { PatternState } from "@/lib/types";

type Tx = Prisma.TransactionClient;

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
    // #67: exposed so a caller that needs another table inside this same
    // transaction (e.g. the size chart the generate route resolves) can
    // pass it along instead of reaching for the module-level `prisma`
    // singleton, which would run on a different pooled connection while
    // this transaction holds the Pattern+Wallet locks for the whole call.
    tx: Tx,
  ) =>
    | { result: T; entries: LedgerEntry[]; dirty?: boolean }
    | Promise<{ result: T; entries: LedgerEntry[]; dirty?: boolean }>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const state = await lockPattern(tx, patternId, userId);
    if (!state) return null;
    const wallet = await lockWallet(tx, userId);
    // #43: a rejecting branch (insufficient credits, nothing to graduate)
    // returns before mutating state or wallet at all, but the unconditional
    // save below still stamped Pattern.updatedAt=now() -- which
    // listPatternsForUser sorts by, so a 402/400 that changed nothing bumped
    // the row to the top of the dashboard and re-serialized its whole JSON
    // blob for no reason. `dirty` is an explicit per-call signal from fn, not
    // inferred from entries.length: ask/decline debit nothing but still
    // addMessage into state, so an entries-based heuristic would wrongly
    // skip saving them too.
    const { result, entries, dirty = true } = await fn(state, wallet, tx);
    if (dirty) {
      await savePattern(tx, patternId, userId, state);
      await saveWallet(tx, userId, wallet);
    }
    await saveLedger(tx, userId, entries);
    return result;
  }, TX_OPTS);
}
