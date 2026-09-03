import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  userId: string;
  type: string;
  amount: number;
  reason: string | null;
  createdAt: Date;
}
let rows: Row[] = [];

interface UserRow {
  id: string;
  firstExportedAt: Date | null;
  firstImportedAt: Date | null;
}
let userRows: Record<string, UserRow> = {};

// #166: matches the specifier this file's own subject imports (see
// lib/db/aliasResolution.test.ts and CLAUDE.md's testing-conventions note).
vi.mock("./prisma", () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(
        async ({
          where,
          orderBy,
          take,
        }: {
          where: { userId: string; type?: string };
          orderBy: { createdAt: "desc" };
          take: number;
        }) =>
          rows
            .filter(
              (r) =>
                r.userId === where.userId &&
                (where.type === undefined || r.type === where.type),
            )
            .sort((a, b) =>
              orderBy.createdAt === "desc"
                ? b.createdAt.getTime() - a.createdAt.getTime()
                : a.createdAt.getTime() - b.createdAt.getTime(),
            )
            .slice(0, take),
      ),
      groupBy: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
            type: string;
            createdAt: { gte: Date };
          };
        }) => {
          const matching = rows.filter(
            (r) =>
              r.userId === where.userId &&
              r.type === where.type &&
              r.createdAt.getTime() >= where.createdAt.gte.getTime(),
          );
          const counts = new Map<string | null, number>();
          for (const r of matching) {
            counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
          }
          return Array.from(counts.entries()).map(([reason, count]) => ({
            reason,
            _count: { _all: count },
          }));
        },
      ),
    },
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          userRows[where.id] ?? null,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string } & Partial<
            Record<"firstExportedAt" | "firstImportedAt", null>
          >;
          data: Partial<Record<"firstExportedAt" | "firstImportedAt", Date>>;
        }) => {
          const u = userRows[where.id];
          if (!u) return { count: 0 };
          const column = (
            "firstExportedAt" in where ? "firstExportedAt" : "firstImportedAt"
          ) as "firstExportedAt" | "firstImportedAt";
          if (u[column] !== null) return { count: 0 };
          userRows[where.id] = { ...u, [column]: data[column] };
          return { count: 1 };
        },
      ),
    },
  },
}));

import {
  getRecentUsage,
  getLedgerHistory,
  getUsageThisCycle,
  isChecklistEvent,
  recordChecklistEvent,
  getChecklistProgress,
} from "./account";

describe("getRecentUsage", () => {
  beforeEach(() => {
    rows = [
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2026-01-01"),
      },
      {
        userId: "u1",
        type: "debit",
        amount: 6,
        reason: "graduate",
        createdAt: new Date("2026-01-03"),
      },
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2026-01-02"),
      },
      {
        userId: "u1",
        type: "refund",
        amount: 1,
        reason: "generate-declined",
        createdAt: new Date("2026-01-04"),
      },
      {
        userId: "u2",
        type: "debit",
        amount: 4,
        reason: "generate",
        createdAt: new Date("2026-01-05"),
      },
    ];
  });

  it("returns only the user's debit entries, most recent first", async () => {
    const usage = await getRecentUsage("u1", 3);
    expect(usage).toEqual([
      { reason: "graduate", amount: 6, createdAt: "2026-01-03T00:00:00.000Z" },
      { reason: "generate", amount: 1, createdAt: "2026-01-02T00:00:00.000Z" },
      { reason: "generate", amount: 1, createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("excludes non-debit entries (refunds, topups, etc.)", async () => {
    const usage = await getRecentUsage("u1", 10);
    expect(usage.every((u) => u.reason !== "generate-declined")).toBe(true);
  });

  it("respects the limit", async () => {
    const usage = await getRecentUsage("u1", 1);
    expect(usage).toHaveLength(1);
  });
});

describe("getLedgerHistory", () => {
  beforeEach(() => {
    rows = [
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2026-01-01"),
      },
      {
        userId: "u1",
        type: "debit",
        amount: 6,
        reason: "graduate",
        createdAt: new Date("2026-01-03"),
      },
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2026-01-02"),
      },
      {
        userId: "u1",
        type: "refund",
        amount: 1,
        reason: "generate-declined",
        createdAt: new Date("2026-01-04"),
      },
      {
        userId: "u2",
        type: "debit",
        amount: 4,
        reason: "generate",
        createdAt: new Date("2026-01-05"),
      },
    ];
  });

  it("returns every transaction type for the user, most recent first", async () => {
    const ledger = await getLedgerHistory("u1", 10);
    expect(ledger).toEqual([
      {
        type: "refund",
        reason: "generate-declined",
        amount: 1,
        createdAt: "2026-01-04T00:00:00.000Z",
      },
      {
        type: "debit",
        reason: "graduate",
        amount: 6,
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      {
        type: "debit",
        reason: "generate",
        amount: 1,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        type: "debit",
        reason: "generate",
        amount: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("respects the limit", async () => {
    const ledger = await getLedgerHistory("u1", 2);
    expect(ledger).toHaveLength(2);
  });

  it("does not include another user's transactions", async () => {
    const ledger = await getLedgerHistory("u1", 10);
    expect(ledger.some((e) => e.amount === 4 && e.reason === "generate")).toBe(
      false,
    );
  });
});

describe("getUsageThisCycle", () => {
  beforeEach(() => {
    rows = [
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2026-01-10"),
      },
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2026-01-11"),
      },
      {
        userId: "u1",
        type: "debit",
        amount: 6,
        reason: "graduate",
        createdAt: new Date("2026-01-12"),
      },
      // Before the cycle started -- must not be counted.
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2025-12-01"),
      },
      // A refund, not a debit -- must not be counted even though it's a
      // "generate"-adjacent reason and inside the cycle window.
      {
        userId: "u1",
        type: "refund",
        amount: 1,
        reason: "generate-declined",
        createdAt: new Date("2026-01-10"),
      },
      // Another user's debit inside the same window -- must not leak in.
      {
        userId: "u2",
        type: "debit",
        amount: 4,
        reason: "generate",
        createdAt: new Date("2026-01-10"),
      },
    ];
  });

  it("counts only this user's in-cycle debits, split by reason", async () => {
    const usage = await getUsageThisCycle("u1", new Date("2026-01-05"));
    expect(usage).toEqual({ generate: 2, graduate: 1 });
  });

  it("reports zero for both reasons when nothing happened this cycle", async () => {
    const usage = await getUsageThisCycle("u1", new Date("2026-06-01"));
    expect(usage).toEqual({ generate: 0, graduate: 0 });
  });
});

describe("isChecklistEvent", () => {
  it("accepts exactly the two known events", () => {
    expect(isChecklistEvent("exported")).toBe(true);
    expect(isChecklistEvent("imported")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isChecklistEvent("invited")).toBe(false);
    expect(isChecklistEvent(undefined)).toBe(false);
    expect(isChecklistEvent(42)).toBe(false);
  });
});

describe("recordChecklistEvent / getChecklistProgress", () => {
  beforeEach(() => {
    userRows = {
      u1: { id: "u1", firstExportedAt: null, firstImportedAt: null },
    };
  });

  it("reports both flags false before anything is recorded", async () => {
    expect(await getChecklistProgress("u1")).toEqual({
      hasExported: false,
      hasImported: false,
    });
  });

  it("sets firstExportedAt on the first 'exported' event", async () => {
    await recordChecklistEvent("u1", "exported");
    expect(await getChecklistProgress("u1")).toEqual({
      hasExported: true,
      hasImported: false,
    });
  });

  it("sets firstImportedAt on the first 'imported' event, independently", async () => {
    await recordChecklistEvent("u1", "imported");
    expect(await getChecklistProgress("u1")).toEqual({
      hasExported: false,
      hasImported: true,
    });
  });

  it("never overwrites an already-set timestamp (first-write-wins)", async () => {
    await recordChecklistEvent("u1", "exported");
    const firstRun = userRows.u1.firstExportedAt;
    await recordChecklistEvent("u1", "exported");
    expect(userRows.u1.firstExportedAt).toBe(firstRun);
  });

  it("reports both flags false for an account with no row (defensive default)", async () => {
    expect(await getChecklistProgress("ghost")).toEqual({
      hasExported: false,
      hasImported: false,
    });
  });
});
