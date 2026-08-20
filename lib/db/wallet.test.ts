import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();
const ledger: unknown[] = [];

const tx = {
  $executeRaw: vi.fn(
    async (
      _strings: TemplateStringsArray,
      ..._vals: unknown[]
    ): Promise<number> => 0,
  ),
  $queryRaw: vi.fn(async (): Promise<unknown[]> => []),
  transaction: {
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
      ledger.push(...data);
      return { count: data.length };
    }),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    wallet: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const data = store.get(where.userId);
        return data === undefined ? null : data;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const exists = store.has(where.userId);
          store.set(where.userId, exists ? update : create);
          return store.get(where.userId);
        },
      ),
    },
  },
}));

import { withWallet, loadWallet } from "./wallet";
import { seedWallet, debitWallet } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");

function wireTx() {
  const uid = "u1";
  tx.$executeRaw.mockImplementation(
    async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      if (sql.includes("UPDATE")) {
        // vals order matches the tagged-template interpolation order in
        // saveWallet: plan, planLabel, balance, total, renewsAt.
        const [plan, planLabel, balance, total, renewsAt] = vals;
        store.set(uid, { plan, planLabel, balance, total, renewsAt });
      }
      return 0;
    },
  );
  tx.$queryRaw.mockImplementation(async () => {
    if (!store.has(uid)) store.set(uid, seedWallet(NOW));
    return [store.get(uid)];
  });
}

describe("withWallet", () => {
  beforeEach(() => {
    store.clear();
    ledger.length = 0;
    tx.$executeRaw.mockReset();
    tx.$queryRaw.mockReset();
    tx.transaction.createMany.mockClear();
    wireTx();
  });

  it("seeds the default wallet on first access and passes it to fn", async () => {
    let seen: number | null = null;
    await withWallet("u1", (wallet) => {
      seen = wallet.balance;
      return { result: undefined, entries: [] };
    });
    expect(seen).toBe(30);
  });

  it("persists fn's mutations and inserts the returned ledger entries", async () => {
    await withWallet("u1", (wallet) => {
      const entry = debitWallet(wallet, 4, "generate");
      return { result: undefined, entries: [entry] };
    });
    const w = store.get("u1") as ReturnType<typeof seedWallet>;
    expect(w.balance).toBe(26);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      userId: "u1",
      type: "debit",
      amount: 4,
      balanceAfter: 26,
      reason: "generate",
    });
  });

  it("inserts no ledger rows when fn returns no entries", async () => {
    await withWallet("u1", () => ({ result: undefined, entries: [] }));
    expect(tx.transaction.createMany).not.toHaveBeenCalled();
  });

  it("returns the value fn returns", async () => {
    const out = await withWallet("u1", () => ({
      result: "resp",
      entries: [],
    }));
    expect(out).toBe("resp");
  });
});

describe("loadWallet", () => {
  beforeEach(() => store.clear());
  it("returns the seed without writing when there's no row", async () => {
    const w = await loadWallet("novo");
    expect(w.balance).toBe(30);
    expect(store.has("novo")).toBe(false);
  });
  it("returns the persisted wallet when it exists", async () => {
    const seeded = seedWallet(NOW);
    seeded.balance = 7;
    store.set("u1", seeded);
    const w = await loadWallet("u1");
    expect(w.balance).toBe(7);
  });
});
