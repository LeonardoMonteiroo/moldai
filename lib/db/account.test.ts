import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  userId: string;
  type: string;
  amount: number;
  reason: string | null;
  createdAt: Date;
}
let rows: Row[] = [];

vi.mock("@/lib/db/prisma", () => ({
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
    },
  },
}));

import { getRecentUsage, getLedgerHistory } from "./account";

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
