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
