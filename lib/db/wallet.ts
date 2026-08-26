import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedWallet } from "@/lib/billing/wallet";
import type { LedgerEntry, Wallet } from "@/lib/billing/wallet";

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

type Tx = Prisma.TransactionClient;

export const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

interface WalletRow {
  plan: string;
  balance: number;
  total: number;
  purchased: number;
  renewsAt: Date | null;
}

function toWallet(row: WalletRow): Wallet {
  return {
    plan: row.plan as Wallet["plan"],
    balance: row.balance,
    total: row.total,
    purchased: row.purchased,
    renewsAt: row.renewsAt,
  };
}

// Materializes the default wallet if missing, then locks and reads the row.
// Exported so lib/db/pattern-wallet.ts can lock this row inside its own combined
// transaction without duplicating the SQL.
export async function lockWallet(tx: Tx, userId: string): Promise<Wallet> {
  const seed = seedWallet(new Date());
  await tx.$executeRaw`
    INSERT INTO "Wallet" ("userId", "plan", "balance", "total", "purchased", "renewsAt", "updatedAt")
    VALUES (${userId}, ${seed.plan}, ${seed.balance}, ${seed.total}, ${seed.purchased}, ${seed.renewsAt}, now())
    ON CONFLICT ("userId") DO NOTHING`;
  const rows = await tx.$queryRaw<WalletRow[]>`
    SELECT "plan", "balance", "total", "purchased", "renewsAt"
    FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  return toWallet(rows[0]);
}

export async function saveWallet(
  tx: Tx,
  userId: string,
  wallet: Wallet,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Wallet"
    SET "plan" = ${wallet.plan},
        "balance" = ${wallet.balance}, "total" = ${wallet.total},
        "purchased" = ${wallet.purchased},
        "renewsAt" = ${wallet.renewsAt}, "updatedAt" = now()
    WHERE "userId" = ${userId}`;
}

export async function saveLedger(
  tx: Tx,
  userId: string,
  entries: LedgerEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx.transaction.createMany({
    data: entries.map((e) => ({
      userId,
      type: e.type,
      amount: e.amount,
      balanceAfter: e.balanceAfter,
      reason: e.reason ?? null,
    })),
  });
}

export async function withWallet<T>(
  userId: string,
  fn: (
    wallet: Wallet,
  ) =>
    | { result: T; entries: LedgerEntry[] }
    | Promise<{ result: T; entries: LedgerEntry[] }>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, userId);
    const { result, entries } = await fn(wallet);
    await saveWallet(tx, userId, wallet);
    await saveLedger(tx, userId, entries);
    return result;
  }, TX_OPTS);
}

// #62: used to fabricate a free wallet whenever no Wallet row existed yet,
// without distinguishing "a real account whose wallet hasn't been lazily
// seeded" (lockWallet's job, on the write path) from "this userId belongs to
// nobody" -- a deleted account read back as a funded free-tier one. The
// display-only lazy-seed for a real user stays (that precedent is
// deliberate, matching lockWallet/ensureSystemSizeCharts); only a
// confirmed-nonexistent user now gets null instead of a fabricated wallet.
export async function loadWallet(userId: string): Promise<Wallet | null> {
  const row = await prisma.wallet.findUnique({ where: { userId } });
  if (row) return toWallet(row);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return user ? seedWallet(new Date()) : null;
}

export interface IdempotentMutationResult {
  /** false means this externalId was already credited/debited -- a
   * duplicate webhook delivery, handled as a no-op rather than an error. */
  credited: boolean;
}

/**
 * #6: used by the Asaas webhook (app/api/billing/webhook/route.ts) to apply
 * exactly one wallet mutation per gateway event id, even though Asaas
 * guarantees only *at-least-once* delivery (the same event WILL arrive more
 * than once, out of order, and potentially concurrently).
 *
 * Idempotency is atomic with the mutation, not a read-then-write race:
 *
 *  1. lockWallet's `SELECT ... FOR UPDATE` already serializes concurrent
 *     deliveries for the SAME userId -- a second delivery arriving while the
 *     first is still in flight simply blocks on the row lock until the
 *     first transaction commits (or rolls back).
 *  2. The ledger insert carries `externalId`, UNIQUE per migration
 *     20260826140000_add_payment_idempotency. A duplicate delivery's insert
 *     hits that constraint (Prisma P2002, caught below); `fn`'s wallet
 *     mutation was only ever applied to the in-memory `wallet` object
 *     returned by lockWallet, and saveWallet is skipped on that path, so
 *     the transaction commits having changed nothing on disk.
 *
 * `fn` is synchronous and mutates `wallet` in place, mirroring
 * applyPurchase/debitWallet's own shape -- it must not perform I/O, since it
 * may run again against a freshly locked row if the transaction retries.
 */
export async function withWalletIdempotent(
  userId: string,
  externalId: string,
  fn: (wallet: Wallet) => LedgerEntry,
): Promise<IdempotentMutationResult> {
  return prisma.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, userId);
    const entry = fn(wallet);
    try {
      await tx.transaction.create({
        data: {
          userId,
          type: entry.type,
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          reason: entry.reason ?? null,
          externalId,
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return { credited: false };
      }
      throw err;
    }
    await saveWallet(tx, userId, wallet);
    return { credited: true };
  }, TX_OPTS);
}

/**
 * Looks up the ledger row a prior gateway event created, keyed by its own
 * externalId (e.g. the Asaas payment id from PAYMENT_CONFIRMED) -- used by
 * the webhook's PAYMENT_REFUNDED handler to recover how much to reverse,
 * for which account, and (via `type`) whether it was a subscribe purchase
 * that also needs its plan reverted, without a second table tracking the
 * same information.
 */
export async function findLedgerEntryByExternalId(externalId: string): Promise<{
  userId: string;
  amount: number;
  type: string;
} | null> {
  const row = await prisma.transaction.findUnique({
    where: { externalId },
    select: { userId: true, amount: true, type: true },
  });
  return row ?? null;
}

/**
 * Atomically gets-or-creates this account's Asaas customer id. The wallet
 * row is locked (and lazily seeded, if this is literally the account's
 * first-ever wallet touch) for the duration of `createCustomer` -- without
 * that lock, two concurrent first-purchase requests could both observe "no
 * customer id yet" and each create a separate, orphaned Asaas customer.
 * Holding a DB lock across a real network call has a precedent in this
 * codebase: withPatternAndWallet already does it for the (much slower)
 * Anthropic generate call, which is why TX_OPTS's timeout is 30s.
 */
export async function withAsaasCustomerId(
  userId: string,
  createCustomer: () => Promise<string>,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await lockWallet(tx, userId); // lazy-seed + row lock, held for the tx
    const rows = await tx.$queryRaw<{ asaasCustomerId: string | null }[]>`
      SELECT "asaasCustomerId" FROM "Wallet" WHERE "userId" = ${userId}`;
    const existing = rows[0]?.asaasCustomerId ?? null;
    if (existing) return existing;
    const customerId = await createCustomer();
    await tx.$executeRaw`
      UPDATE "Wallet" SET "asaasCustomerId" = ${customerId}, "updatedAt" = now()
      WHERE "userId" = ${userId}`;
    return customerId;
  }, TX_OPTS);
}

// Best-effort: written from a PAYMENT_CONFIRMED webhook that names a
// subscription, so a later unit can exclude subscribed wallets from
// scripts/cron-renew.ts's past-due sweep (issue #6 step 7 -- that file is
// outside this unit's own file list, so the cron query itself is
// unchanged here). Failure to persist this must never block crediting the
// wallet, so the webhook route calls this outside the money transaction.
// A plain UPDATE, not an upsert: by the time this is called,
// withWalletIdempotent has already credited this exact userId, and
// lockWallet's own lazy-seed guarantees the row exists -- there is no
// "create" case to handle.
export async function setAsaasSubscriptionId(
  userId: string,
  asaasSubscriptionId: string,
): Promise<void> {
  await prisma.wallet.update({
    where: { userId },
    data: { asaasSubscriptionId },
  });
}
