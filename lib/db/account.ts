import { prisma } from "./prisma";
import type {
  LedgerEntryType,
  LedgerHistoryEntry,
  UsageThisCycle,
} from "@/lib/types";

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

// Counts debit-type transactions since `since` (the current billing cycle's
// start), grouped by the only two reasons a debit ever carries -- "generate"
// covers every chat-driven draft/adjustment alike (this app has no separate
// "first generation" vs "later edit" distinction to report), "graduate"
// covers grading. Settings' "Usados neste ciclo" stat card.
export async function getUsageThisCycle(
  userId: string,
  since: Date,
): Promise<UsageThisCycle> {
  const rows = await prisma.transaction.groupBy({
    by: ["reason"],
    where: { userId, type: "debit", createdAt: { gte: since } },
    _count: { _all: true },
  });
  const result: UsageThisCycle = { generate: 0, graduate: 0 };
  for (const row of rows) {
    if (row.reason === "generate") result.generate = row._count._all;
    else if (row.reason === "graduate") result.graduate = row._count._all;
  }
  return result;
}

/** The two events the dashboard onboarding checklist (#232) can record. */
export type ChecklistEvent = "exported" | "imported";

export function isChecklistEvent(value: unknown): value is ChecklistEvent {
  return value === "exported" || value === "imported";
}

const CHECKLIST_EVENT_COLUMN = {
  exported: "firstExportedAt",
  imported: "firstImportedAt",
} as const satisfies Record<ChecklistEvent, string>;

// First-write-wins: `updateMany` is scoped to the column still being NULL,
// so a duplicate ping (the client fires this best-effort, more than once is
// expected) never overwrites the real first-occurrence timestamp.
export async function recordChecklistEvent(
  userId: string,
  event: ChecklistEvent,
): Promise<void> {
  const column = CHECKLIST_EVENT_COLUMN[event];
  await prisma.user.updateMany({
    where: { id: userId, [column]: null },
    data: { [column]: new Date() },
  });
}

export async function getChecklistProgress(
  userId: string,
): Promise<{ hasExported: boolean; hasImported: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstExportedAt: true, firstImportedAt: true },
  });
  return {
    hasExported: user?.firstExportedAt != null,
    hasImported: user?.firstImportedAt != null,
  };
}
