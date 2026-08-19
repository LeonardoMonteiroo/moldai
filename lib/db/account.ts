import { prisma } from "./prisma";
import type { LedgerEntryType, LedgerHistoryEntry } from "@/lib/types";

export interface RecentUsageEntry {
  reason: string | null;
  amount: number;
  createdAt: string;
}

// Last `limit` debit-type ledger entries for the "Uso recente" dashboard
// card — refunds/topups/subscribes/renews are excluded, those aren't spend.
export async function getRecentUsage(
  userId: string,
  limit = 3,
): Promise<RecentUsageEntry[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, type: "debit" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    reason: r.reason,
    amount: r.amount,
    createdAt: r.createdAt.toISOString(),
  }));
}

// Full ledger (every transaction type) for the settings "Créditos e uso"
// section — unlike getRecentUsage, not filtered to debits only.
export async function getLedgerHistory(
  userId: string,
  limit = 30,
): Promise<LedgerHistoryEntry[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    type: r.type as LedgerEntryType,
    reason: r.reason,
    amount: r.amount,
    createdAt: r.createdAt.toISOString(),
  }));
}
