import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Prisma client: an in-memory "table" keyed by userId.
const store = new Map<string, unknown>();

const tx = {
  // INSERT ... ON CONFLICT DO NOTHING (materializes the seed) and the final
  // UPDATE — both called as a tagged template: (strings, ...interpolated values).
  $executeRaw: vi.fn(
    async (
      _strings: TemplateStringsArray,
      ..._vals: unknown[]
    ): Promise<number> => 0,
  ),
  // SELECT data ... FOR UPDATE — returns the current row (after insert-if-absent).
  $queryRaw: vi.fn(async (): Promise<{ data: unknown }[]> => []),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    // interactive transaction: calls the callback with the fake tx.
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    molde: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const data = store.get(where.userId);
        return data === undefined ? null : { userId: where.userId, data };
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: { userId: string; data: unknown };
          update: { data: unknown };
        }) => {
          const exists = store.has(where.userId);
          store.set(where.userId, exists ? update.data : create.data);
          return { userId: where.userId, data: store.get(where.userId) };
        },
      ),
    },
  },
}));

import { withMolde, loadMolde, resetMolde } from "./molde";
import { seedState, debitCredits } from "@/lib/editor/state";

// Makes $executeRaw materialize the seed (INSERT-if-absent) and persist the
// final UPDATE, and makes $queryRaw return a COPY of the current row — truly
// mimicking INSERT ON CONFLICT DO NOTHING + SELECT FOR UPDATE + UPDATE.
//
// The copy in $queryRaw is essential: withMolde doesn't clone the `data` it
// reads, so if we returned the `store`'s own reference, an in-place mutation
// by fn (e.g. debitCredits) would show up in the store by aliasing — even if
// the UPDATE never ran. With the copy, only the UPDATE writes the mutation back.
function wireTx() {
  const uid = "u1";
  tx.$executeRaw.mockImplementation(
    async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      if (sql.includes("UPDATE")) {
        const jsonStr = vals.find(
          (v): v is string =>
            typeof v === "string" && v.trimStart().startsWith("{"),
        );
        if (jsonStr) store.set(uid, JSON.parse(jsonStr));
      }
      // INSERT ... ON CONFLICT DO NOTHING also goes through here; the seed is
      // materialized below in $queryRaw, so this is a no-op for the INSERT.
      return 0;
    },
  );
  tx.$queryRaw.mockImplementation(async () => {
    if (!store.has(uid)) store.set(uid, seedState());
    return [{ data: JSON.parse(JSON.stringify(store.get(uid))) }];
  });
}

describe("withMolde", () => {
  beforeEach(() => {
    store.clear();
    tx.$executeRaw.mockReset();
    tx.$queryRaw.mockReset();
    wireTx();
  });

  it("seeds the blank molde on first access and passes it to fn", async () => {
    let seen: number | null = null;
    await withMolde("u1", (state) => {
      seen = state.credits.balance;
    });
    expect(seen).toBe(320);
  });

  it("persists fn's mutations (the debit survives)", async () => {
    await withMolde("u1", (state) => {
      debitCredits(state, 4);
    });
    const s = store.get("u1") as ReturnType<typeof seedState>;
    expect(s.credits.balance).toBe(316);
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it("returns the value fn returns", async () => {
    const out = await withMolde("u1", () => "resp");
    expect(out).toBe("resp");
  });
});

describe("loadMolde", () => {
  beforeEach(() => {
    store.clear();
  });
  it("returns the seed without writing when there's no row", async () => {
    const s = await loadMolde("novo");
    expect(s.credits.balance).toBe(320);
    expect(store.has("novo")).toBe(false); // read-only: nothing was persisted
  });
  it("returns the persisted state when it exists", async () => {
    const seeded = seedState();
    seeded.credits.balance = 7;
    store.set("u1", seeded);
    const s = await loadMolde("u1");
    expect(s.credits.balance).toBe(7);
  });
});

describe("resetMolde", () => {
  beforeEach(() => {
    store.clear();
  });
  it("overwrites with the blank molde and persists it", async () => {
    const dirty = seedState();
    dirty.credits.balance = 0;
    dirty.pattern.version = 9;
    store.set("u1", dirty);
    const s = await resetMolde("u1");
    expect(s.credits.balance).toBe(320);
    expect(s.pattern.version).toBe(0);
    expect(
      (store.get("u1") as ReturnType<typeof seedState>).pattern.version,
    ).toBe(0);
  });
});
