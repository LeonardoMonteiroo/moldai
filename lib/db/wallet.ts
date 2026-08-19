import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedWallet } from "@/lib/billing/wallet";
import type { LedgerEntry, Wallet } from "@/lib/billing/wallet";

type Tx = Prisma.TransactionClient;

export const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

interface WalletRow {
  plan: string;
  planLabel: string;
  balance: number;
  total: number;
  renewsAt: Date | null;
}

function toWallet(row: WalletRow): Wallet {
  return {
    plan: row.plan as Wallet["plan"],
    planLabel: row.planLabel,
    balance: row.balance,
    total: row.total,
    renewsAt: row.renewsAt,
  };
}

// Materializes the default wallet if missing, then locks and reads the row.
// Exported so lib/db/pattern-wallet.ts can lock this row inside its own combined
// transaction without duplicating the SQL.
export async function lockWallet(tx: Tx, userId: string): Promise<Wallet> {
  const seed = seedWallet(new Date());
  await tx.$executeRaw`
    INSERT INTO "Wallet" ("userId", "plan", "planLabel", "balance", "total", "renewsAt", "updatedAt")
    VALUES (${userId}, ${seed.plan}, ${seed.planLabel}, ${seed.balance}, ${seed.total}, ${seed.renewsAt}, now())
    ON CONFLICT ("userId") DO NOTHING`;
  const rows = await tx.$queryRaw<WalletRow[]>`
    SELECT "plan", "planLabel", "balance", "total", "renewsAt"
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
    SET "plan" = ${wallet.plan}, "planLabel" = ${wallet.planLabel},
        "balance" = ${wallet.balance}, "total" = ${wallet.total},
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

export async function loadWallet(userId: string): Promise<Wallet> {
  const row = await prisma.wallet.findUnique({ where: { userId } });
  return row ? toWallet(row) : seedWallet(new Date());
}

export async function resetWallet(userId: string): Promise<Wallet> {
  const wallet = seedWallet(new Date());
  await prisma.wallet.upsert({
    where: { userId },
    create: { userId, ...wallet },
    update: { ...wallet },
  });
  return wallet;
}
