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
  planSourceExternalId: string | null;
}

function toWallet(row: WalletRow): Wallet {
  return {
    plan: row.plan as Wallet["plan"],
    balance: row.balance,
    total: row.total,
    purchased: row.purchased,
    renewsAt: row.renewsAt,
    planSourceExternalId: row.planSourceExternalId,
  };
}

// Materializes the default wallet if missing, then locks and reads the row.
// Exported so lib/db/pattern-wallet.ts can lock this row inside its own combined
// transaction without duplicating the SQL.
export async function lockWallet(tx: Tx, userId: string): Promise<Wallet> {
  const seed = seedWallet(new Date());
  await tx.$executeRaw`
    INSERT INTO "Wallet" ("userId", "plan", "balance", "total", "purchased", "renewsAt", "planSourceExternalId", "updatedAt")
    VALUES (${userId}, ${seed.plan}, ${seed.balance}, ${seed.total}, ${seed.purchased}, ${seed.renewsAt}, ${seed.planSourceExternalId}, now())
    ON CONFLICT ("userId") DO NOTHING`;
  const rows = await tx.$queryRaw<WalletRow[]>`
    SELECT "plan", "balance", "total", "purchased", "renewsAt", "planSourceExternalId"
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
        "renewsAt" = ${wallet.renewsAt},
        "planSourceExternalId" = ${wallet.planSourceExternalId},
        "updatedAt" = now()
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
      // #196: only meaningful on a "subscribe" row -- see LedgerEntry's own
      // comment. Persisted for every entry uniformly (defaults false)
      // rather than only for subscribes, so a future refund-support caller
      // reading a non-subscribe row never has to special-case its absence.
      planChanged: e.planChanged ?? false,
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
 * #6: used by the Stripe webhook (app/api/billing/webhook/route.ts) to apply
 * exactly one wallet mutation per gateway event id, even though Stripe
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
  // #206: written in the SAME transaction as the credit it accompanies,
  // never after it. The deleted Asaas path set its subscription id
  // best-effort *outside* the money transaction, on the reasoning that
  // losing it must not block a credit that already landed -- but losing it
  // is not harmless: scripts/cron-renew.ts excludes wallets carrying a
  // subscription id precisely so the gateway's own renewal webhook is the
  // only thing that renews them. A credit that commits without this column
  // therefore leaves a subscribed wallet in the free-tier cron's sweep AND
  // reachable by its own renewal webhook -- the exact double-renewal #161
  // exists to prevent. Committing both together makes that state
  // unreachable rather than merely unlikely.
  stripeSubscriptionId?: string,
): Promise<IdempotentMutationResult> {
  return prisma.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, userId);
    const entry = fn(wallet);
    // #196: centralized here (not in the webhook route) so every caller of
    // withWalletIdempotent gets the same bookkeeping for free -- whenever
    // `fn` actually moved the wallet's plan (applyPurchase's upgrade
    // branch, surfaced via LedgerEntry.planChanged), this externalId is now
    // the one recorded as backing that plan. A later charge.refunded for
    // this exact externalId is how reverseRefundedSubscription recognises
    // "this is the current plan source" vs. "this was superseded".
    if (entry.type === "subscribe" && entry.planChanged) {
      wallet.planSourceExternalId = externalId;
    }
    try {
      await tx.transaction.create({
        data: {
          userId,
          type: entry.type,
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          reason: entry.reason ?? null,
          externalId,
          planChanged: entry.planChanged ?? false,
          // See loadWallet's own comment: bridges a Prisma Client that
          // predates the planChanged column on its generated types.
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return { credited: false };
      }
      throw err;
    }
    await saveWallet(tx, userId, wallet);
    if (stripeSubscriptionId) {
      // A plain UPDATE, not an upsert: lockWallet's own lazy-seed above
      // guarantees the row exists, so there is no "create" case. Written
      // unconditionally rather than only-when-null so a resubscribe after a
      // cancellation points at the live subscription instead of a dead one.
      await tx.$executeRaw`
        UPDATE "Wallet" SET "stripeSubscriptionId" = ${stripeSubscriptionId}
        WHERE "userId" = ${userId}`;
    }
    return { credited: true };
  }, TX_OPTS);
}

/**
 * Looks up the ledger row a prior gateway event created, keyed by its own
 * externalId (the Stripe payment-intent id behind the credit) -- used by
 * the webhook's charge.refunded handler to recover how much to reverse,
 * for which account, and (via `type`) whether it was a subscribe purchase
 * that also needs its plan reverted, without a second table tracking the
 * same information.
 */
export async function findLedgerEntryByExternalId(externalId: string): Promise<{
  userId: string;
  amount: number;
  type: string;
  // #196: whether THIS entry actually moved plan/total when it ran -- see
  // LedgerEntry.planChanged. handleRefunded needs it, alongside the locked
  // wallet's own planSourceExternalId, to tell a superseded plan-changing
  // subscribe apart from a folded one (reverseRefundedSubscription).
  planChanged: boolean;
} | null> {
  // See loadWallet's own comment: `select` bridges a Prisma Client that
  // predates the planChanged column on its generated types.
  const row = await prisma.transaction.findUnique({
    where: { externalId },
    select: { userId: true, amount: true, type: true, planChanged: true },
  });
  return (
    (row as {
      userId: string;
      amount: number;
      type: string;
      planChanged: boolean;
    } | null) ?? null
  );
}

export type CheckoutPrepResult =
  { ok: true; customerId: string } | { ok: false; error: string };

/**
 * #206: everything the checkout-creation route has to decide under the
 * wallet's own row lock, in one transaction:
 *
 *  1. `guard` gets the LOCKED wallet and may refuse the purchase outright
 *     by returning a wire error code. This is where the upgrade-only rule
 *     is enforced for the gateway path -- CLAUDE.md says downgrades are
 *     "refused server-side, decided inside the wallet lock", which was
 *     true only of the mock branch before this: the Stripe branch validated
 *     isPaidPlanId and nothing else, so a downgrade created a REAL charge
 *     that applyPurchase's monotonicity guard then folded into `purchased`
 *     -- money taken for a plan change that never happened.
 *  2. Atomically gets-or-creates this account's Stripe customer id. The row
 *     stays locked for the duration of `createCustomer` -- without that
 *     lock, two concurrent first-purchase requests could both observe "no
 *     customer id yet" and each create a separate, orphaned customer.
 *
 * Holding a DB lock across a real network call has a precedent in this
 * codebase: withPatternAndWallet already does it for the (much slower)
 * Anthropic generate call, which is why TX_OPTS's timeout is 30s.
 */
export async function withStripeCustomerId(
  userId: string,
  createCustomer: () => Promise<string>,
  guard?: (wallet: Wallet) => string | null,
): Promise<CheckoutPrepResult> {
  return prisma.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, userId); // lazy-seed + row lock
    const refusal = guard?.(wallet) ?? null;
    if (refusal) return { ok: false as const, error: refusal };
    const rows = await tx.$queryRaw<{ stripeCustomerId: string | null }[]>`
      SELECT "stripeCustomerId" FROM "Wallet" WHERE "userId" = ${userId}`;
    const existing = rows[0]?.stripeCustomerId ?? null;
    if (existing) return { ok: true as const, customerId: existing };
    const customerId = await createCustomer();
    await tx.$executeRaw`
      UPDATE "Wallet" SET "stripeCustomerId" = ${customerId}, "updatedAt" = now()
      WHERE "userId" = ${userId}`;
    return { ok: true as const, customerId };
  }, TX_OPTS);
}

/**
 * #206: routes a subscription RENEWAL back to the wallet that owns it.
 *
 * A renewal invoice's only reliable link to an account is the subscription
 * id, and unlike webhook metadata that id is this app's OWN recorded fact
 * (written by withWalletIdempotent in the same transaction as the first
 * payment's credit), not gateway-echoed input. UNIQUE per migration
 * 20260827180000, so this can never be ambiguous.
 */
export async function findWalletUserIdByStripeSubscriptionId(
  stripeSubscriptionId: string,
): Promise<string | null> {
  const row = await prisma.wallet.findFirst({
    where: { stripeSubscriptionId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}
