import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const store = new Map<string, unknown>();
const ledger: unknown[] = [];
// Simulates the real UNIQUE constraint on Transaction.externalId (migration
// 20260826140000_add_payment_idempotency) -- keyed separately from `ledger`
// because externalId is optional and most ledger rows (debit/refund/renew,
// the mock purchase path) never set it.
const ledgerByExternalId = new Map<
  string,
  { userId: string; amount: number; type: string; planChanged: boolean }
>();

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`externalId`)",
    { code: "P2002", clientVersion: "test" },
  );
}

const tx = {
  $executeRaw: vi.fn(
    async (
      _strings: TemplateStringsArray,
      ..._vals: unknown[]
    ): Promise<number> => 0,
  ),
  $queryRaw: vi.fn(
    async (
      _strings: TemplateStringsArray,
      ..._vals: unknown[]
    ): Promise<unknown[]> => [],
  ),
  transaction: {
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
      ledger.push(...data);
      return { count: data.length };
    }),
    create: vi.fn(
      async ({
        data,
      }: {
        data: {
          userId: string;
          type: string;
          amount: number;
          balanceAfter: number;
          reason: string | null;
          externalId?: string | null;
          planChanged?: boolean;
        };
      }) => {
        if (data.externalId) {
          if (ledgerByExternalId.has(data.externalId)) {
            throw uniqueConstraintError();
          }
          ledgerByExternalId.set(data.externalId, {
            userId: data.userId,
            amount: data.amount,
            type: data.type,
            planChanged: data.planChanged ?? false,
          });
        }
        ledger.push(data);
        return data;
      },
    ),
  },
};

// #166: matches the specifier this file's own subject imports (see
// lib/db/aliasResolution.test.ts and CLAUDE.md's testing-conventions note).
vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    // #62: loadWallet falls back to this when no Wallet row exists yet, to
    // tell a real account awaiting its lazy seed apart from a deleted one --
    // exists by default (every id in this suite belongs to a live account
    // unless a test overrides it with mockResolvedValueOnce(null)).
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
      })),
    },
    wallet: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const data = store.get(where.userId);
        return data === undefined ? null : data;
      }),
      // #206: findWalletUserIdByStripeSubscriptionId's own lookup -- scans
      // the store the way a real indexed WHERE would, so the test exercises
      // "no row matches" as a real outcome rather than a mocked null.
      findFirst: vi.fn(
        async ({ where }: { where: { stripeSubscriptionId: string } }) => {
          for (const [userId, row] of store) {
            const r = row as { stripeSubscriptionId?: string };
            if (r.stripeSubscriptionId === where.stripeSubscriptionId) {
              return { userId };
            }
          }
          return null;
        },
      ),
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
          const current = (store.get(where.userId) ?? {}) as Record<
            string,
            unknown
          >;
          store.set(where.userId, exists ? { ...current, ...update } : create);
          return store.get(where.userId);
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userId: string };
          data: Record<string, unknown>;
        }) => {
          const current = (store.get(where.userId) ?? {}) as Record<
            string,
            unknown
          >;
          store.set(where.userId, { ...current, ...data });
          return store.get(where.userId);
        },
      ),
    },
    transaction: {
      findUnique: vi.fn(
        async ({ where }: { where: { externalId: string } }) => {
          return ledgerByExternalId.get(where.externalId) ?? null;
        },
      ),
    },
  },
}));

import {
  withWallet,
  loadWallet,
  withWalletIdempotent,
  findLedgerEntryByExternalId,
  withStripeCustomerId,
  findWalletUserIdByStripeSubscriptionId,
} from "./wallet";
import { prisma } from "./prisma";
import { seedWallet, debitWallet, applyPurchase } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");

// Wires the fake tx to read/write `store` keyed on the interpolated userId,
// mimicking lockWallet's INSERT ... ON CONFLICT DO NOTHING + SELECT ... WHERE
// userId = $1 FOR UPDATE, and saveWallet's UPDATE ... WHERE userId = $1.
function wireTx() {
  tx.$executeRaw.mockImplementation(
    async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      if (sql.includes("INSERT")) {
        // vals order matches lockWallet: userId, plan, balance, total,
        // purchased, renewsAt, planSourceExternalId. Mirrors ON CONFLICT DO
        // NOTHING -- only seeds when the row doesn't already exist.
        const [
          userId,
          plan,
          balance,
          total,
          purchased,
          renewsAt,
          planSourceExternalId,
        ] = vals as [string, ...unknown[]];
        if (!store.has(userId)) {
          store.set(userId, {
            plan,
            balance,
            total,
            purchased,
            renewsAt,
            planSourceExternalId,
          });
        }
      } else if (sql.includes('"stripeCustomerId"')) {
        // withStripeCustomerId's own UPDATE: vals = [customerId, userId] --
        // a distinct shape from saveWallet's, checked first so it isn't
        // mis-destructured by the generic branch below.
        const [customerId, userId] = vals as [string, string];
        const current = (store.get(userId) ?? {}) as Record<string, unknown>;
        store.set(userId, { ...current, stripeCustomerId: customerId });
      } else if (sql.includes('"stripeSubscriptionId"')) {
        // #206: withWalletIdempotent's in-transaction subscription-id write.
        // vals = [subscriptionId, userId] -- same distinct two-value shape
        // as the customer-id branch above, checked before the generic
        // saveWallet branch so it isn't mis-destructured.
        const [subscriptionId, userId] = vals as [string, string];
        const current = (store.get(userId) ?? {}) as Record<string, unknown>;
        store.set(userId, { ...current, stripeSubscriptionId: subscriptionId });
      } else if (sql.includes("UPDATE")) {
        // vals order matches saveWallet: plan, balance, total, purchased,
        // renewsAt, planSourceExternalId, userId -- userId is last.
        const [
          plan,
          balance,
          total,
          purchased,
          renewsAt,
          planSourceExternalId,
          userId,
        ] = vals as [
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          string,
        ];
        const current = (store.get(userId) ?? {}) as Record<string, unknown>;
        store.set(userId, {
          ...current,
          plan,
          balance,
          total,
          purchased,
          renewsAt,
          planSourceExternalId,
        });
      }
      return 0;
    },
  );
  tx.$queryRaw.mockImplementation(async (_s: unknown, ...vals: unknown[]) => {
    const [userId] = vals as [string];
    return store.has(userId) ? [store.get(userId)] : [];
  });
}

describe("withWallet", () => {
  beforeEach(() => {
    store.clear();
    ledger.length = 0;
    ledgerByExternalId.clear();
    tx.$executeRaw.mockReset();
    tx.$queryRaw.mockReset();
    tx.transaction.createMany.mockClear();
    tx.transaction.create.mockClear();
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

  // #196: the mock purchase route (app/api/billing/purchase) has no
  // externalId concept at all, so withWallet -- unlike withWalletIdempotent
  // -- never has anything to record here, even for a real plan upgrade. A
  // mock-originated subscribe therefore has no refund path (there is no
  // gateway to deliver a PAYMENT_REFUNDED for it), which is exactly why
  // this is safe: the field simply stays whatever it already was.
  it("never sets planSourceExternalId, even for a real plan-changing subscribe", async () => {
    await withWallet("u1", (wallet) => {
      const entry = applyPurchase(
        wallet,
        { type: "subscribe", plan: "atelier" },
        NOW,
      );
      return { result: undefined, entries: [entry] };
    });
    expect(
      (store.get("u1") as { planSourceExternalId: string | null })
        .planSourceExternalId,
    ).toBeNull();
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

  // #72: the fake used to key everything on a hardcoded "u1" regardless of
  // the userId argument, so deleting the WHERE userId = $1 clause from the
  // real lockWallet/saveWallet SQL would still leave this whole suite green.
  it("lockWallet seeds and returns u2's own row, not u1's", async () => {
    await withWallet("u1", (wallet) => {
      wallet.balance = 999;
      return { result: undefined, entries: [] };
    });
    let seenU2Balance: number | null = null;
    await withWallet("u2", (wallet) => {
      seenU2Balance = wallet.balance;
      return { result: undefined, entries: [] };
    });
    expect(seenU2Balance).toBe(30);
    expect((store.get("u1") as { balance: number }).balance).toBe(999);
  });

  it("saveWallet under u2 leaves u1's row untouched", async () => {
    await withWallet("u1", () => ({ result: undefined, entries: [] }));
    await withWallet("u2", (wallet) => {
      const entry = debitWallet(wallet, 4, "generate");
      return { result: undefined, entries: [entry] };
    });
    expect((store.get("u1") as { balance: number }).balance).toBe(30);
    expect((store.get("u2") as { balance: number }).balance).toBe(26);
  });
});

describe("loadWallet", () => {
  beforeEach(() => store.clear());
  it("returns the seed without writing when a real account has no row yet", async () => {
    const w = await loadWallet("novo");
    expect(w?.balance).toBe(30);
    expect(store.has("novo")).toBe(false);
  });
  it("returns the persisted wallet when it exists", async () => {
    const seeded = seedWallet(NOW);
    seeded.balance = 7;
    store.set("u1", seeded);
    const w = await loadWallet("u1");
    expect(w?.balance).toBe(7);
  });
  // #62: without this, a deleted account's Wallet-row-not-found path was
  // indistinguishable from a real account's lazy-seed-not-yet-applied path --
  // both fabricated a free 30/30 wallet, so a vanished account read back as
  // a funded one.
  it("returns null for a userId with no row and no User account (deleted)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const w = await loadWallet("deleted-user");
    expect(w).toBeNull();
    expect(store.has("deleted-user")).toBe(false);
  });
});

// #6: the atomic half of the Stripe webhook's idempotency story -- see the
// header comment on withWalletIdempotent itself. app/api/billing/webhook's
// own route.test.ts covers the route logic against a lighter fake; this
// exercises the REAL implementation (a Prisma transaction + a P2002 caught
// against the unique-constraint-simulating fake tx.transaction.create
// above), so a regression in the actual dedup mechanism fails here even if
// the route-level fake happened to still pass.
describe("withWalletIdempotent", () => {
  beforeEach(() => {
    store.clear();
    ledger.length = 0;
    ledgerByExternalId.clear();
    tx.$executeRaw.mockReset();
    tx.$queryRaw.mockReset();
    tx.transaction.createMany.mockClear();
    tx.transaction.create.mockClear();
    wireTx();
  });

  it("credits the wallet and inserts one ledger row carrying externalId", async () => {
    const out = await withWalletIdempotent("u1", "pay_1", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    expect(out.credited).toBe(true);
    expect((store.get("u1") as { balance: number }).balance).toBe(130);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      userId: "u1",
      externalId: "pay_1",
      amount: 100,
      balanceAfter: 130,
    });
  });

  // #196: withWalletIdempotent itself records which externalId now backs
  // the wallet's plan -- centralized here so every caller gets it for free,
  // rather than each webhook handler having to remember to set it.
  it("records planSourceExternalId when fn's entry actually changed the plan", async () => {
    await withWalletIdempotent("u1", "pay_atelier", (wallet) =>
      applyPurchase(wallet, { type: "subscribe", plan: "atelier" }, NOW),
    );
    expect(
      (store.get("u1") as { planSourceExternalId: string | null })
        .planSourceExternalId,
    ).toBe("pay_atelier");
  });

  it("does not set planSourceExternalId for a folded subscribe (plan unchanged)", async () => {
    await withWalletIdempotent("u1", "pay_factory", (wallet) =>
      applyPurchase(wallet, { type: "subscribe", plan: "factory" }, NOW),
    );
    await withWalletIdempotent(
      "u1",
      "pay_studio_later",
      (wallet) =>
        applyPurchase(wallet, { type: "subscribe", plan: "studio" }, NOW), // folded
    );
    expect(
      (store.get("u1") as { planSourceExternalId: string | null })
        .planSourceExternalId,
    ).toBe("pay_factory"); // still the real plan-setter, not the folded one
  });

  it("does not set planSourceExternalId for a non-subscribe entry", async () => {
    await withWalletIdempotent("u1", "pay_1", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    expect(
      (store.get("u1") as { planSourceExternalId: string | null })
        .planSourceExternalId,
    ).toBeNull();
  });

  // This is the test that matters -- Stripe guarantees at-least-once webhook
  // delivery, so the same event WILL be delivered more than once in
  // production.
  it("the same externalId delivered twice credits the wallet exactly once", async () => {
    const first = await withWalletIdempotent("u1", "pay_1", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    const second = await withWalletIdempotent("u1", "pay_1", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    expect(first.credited).toBe(true);
    expect(second.credited).toBe(false);
    expect((store.get("u1") as { balance: number }).balance).toBe(130);
    expect(ledger).toHaveLength(1);
  });

  it("a duplicate delivery never calls saveWallet -- the row is left exactly as fn's mutation would have changed it, unpersisted", async () => {
    await withWalletIdempotent("u1", "pay_1", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    const balanceAfterFirst = (store.get("u1") as { balance: number }).balance;
    await withWalletIdempotent("u1", "pay_1", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    expect((store.get("u1") as { balance: number }).balance).toBe(
      balanceAfterFirst,
    );
  });

  it("different externalIds for the same user both credit", async () => {
    await withWalletIdempotent("u1", "pay_1", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    await withWalletIdempotent("u1", "pay_2", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    expect((store.get("u1") as { balance: number }).balance).toBe(230);
    expect(ledger).toHaveLength(2);
  });

  it("a non-unique-constraint error propagates instead of being swallowed as a duplicate", async () => {
    tx.transaction.create.mockRejectedValueOnce(new Error("connection reset"));
    await expect(
      withWalletIdempotent("u1", "pay_1", (wallet) =>
        applyPurchase(wallet, { type: "topup" }, NOW),
      ),
    ).rejects.toThrow("connection reset");
  });
});

describe("findLedgerEntryByExternalId", () => {
  beforeEach(() => {
    store.clear();
    ledger.length = 0;
    ledgerByExternalId.clear();
    wireTx();
  });

  it("returns null when no ledger row carries this externalId", async () => {
    expect(await findLedgerEntryByExternalId("nope")).toBeNull();
  });

  it("returns the userId, amount, type and planChanged of the matching ledger row", async () => {
    await withWalletIdempotent("u1", "pay_1", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    expect(await findLedgerEntryByExternalId("pay_1")).toEqual({
      userId: "u1",
      amount: 100,
      type: "topup",
      planChanged: false,
    });
  });

  // #196: the field a refund needs to tell a real plan-changing subscribe
  // apart from one that only folded into `purchased`.
  it("reports planChanged: true for a subscribe entry that actually moved plan/total", async () => {
    await withWalletIdempotent("u1", "pay_atelier", (wallet) =>
      applyPurchase(wallet, { type: "subscribe", plan: "atelier" }, NOW),
    );
    expect(await findLedgerEntryByExternalId("pay_atelier")).toMatchObject({
      type: "subscribe",
      planChanged: true,
    });
  });
});

describe("withStripeCustomerId", () => {
  beforeEach(() => {
    store.clear();
    tx.$executeRaw.mockReset();
    tx.$queryRaw.mockReset();
    wireTx();
  });

  it("creates and persists a customer id, seeding the wallet row if needed", async () => {
    const createCustomer = vi.fn(async () => "cus_new");
    const result = await withStripeCustomerId("u1", createCustomer);
    expect(result).toEqual({ ok: true, customerId: "cus_new" });
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(
      (store.get("u1") as { stripeCustomerId?: string }).stripeCustomerId,
    ).toBe("cus_new");
    // Seeded a real wallet row in the process, not just the one field.
    expect((store.get("u1") as { balance: number }).balance).toBe(30);
  });

  it("reuses an existing customer id without calling the callback again", async () => {
    const createCustomer = vi.fn(async () => "cus_new");
    await withStripeCustomerId("u1", createCustomer);
    const result = await withStripeCustomerId("u1", createCustomer);
    expect(result).toEqual({ ok: true, customerId: "cus_new" });
    expect(createCustomer).toHaveBeenCalledTimes(1);
  });

  // #206: the guard runs against the LOCKED wallet and refuses BEFORE any
  // provider call. This is the regression guard for the defect the deleted
  // Asaas branch shipped: it validated isPaidPlanId and nothing else, so a
  // downgrade request created a real charge that applyPurchase's
  // monotonicity guard then folded into `purchased` -- money taken for a
  // plan change that never happened.
  it("refuses via the guard without creating a customer, and never mutates the wallet", async () => {
    const createCustomer = vi.fn(async () => "cus_new");
    const result = await withStripeCustomerId(
      "u1",
      createCustomer,
      () => "plan_not_upgradable",
    );
    expect(result).toEqual({ ok: false, error: "plan_not_upgradable" });
    expect(createCustomer).not.toHaveBeenCalled();
    expect(
      (store.get("u1") as { stripeCustomerId?: string }).stripeCustomerId,
    ).toBeUndefined();
  });

  it("passes the locked wallet to the guard so the decision reads committed state", async () => {
    await withWallet("u1", (wallet) => {
      const entry = applyPurchase(
        wallet,
        { type: "subscribe", plan: "studio" },
        NOW,
      );
      return { result: undefined, entries: [entry] };
    });
    let seenPlan: string | null = null;
    await withStripeCustomerId(
      "u1",
      async () => "cus_new",
      (wallet) => {
        seenPlan = wallet.plan;
        return null;
      },
    );
    expect(seenPlan).toBe("studio");
  });

  it("does not clobber an existing wallet's balance when creating a customer id", async () => {
    await withWallet("u1", (wallet) => {
      const entry = debitWallet(wallet, 4, "generate");
      return { result: undefined, entries: [entry] };
    });
    await withStripeCustomerId("u1", async () => "cus_123");
    expect((store.get("u1") as { balance: number }).balance).toBe(26);
    expect(
      (store.get("u1") as { stripeCustomerId?: string }).stripeCustomerId,
    ).toBe("cus_123");
  });

  it("keeps a previously set customer id when the wallet is later saved by an unrelated mutation", async () => {
    await withStripeCustomerId("u1", async () => "cus_123");
    await withWallet("u1", (wallet) => {
      const entry = debitWallet(wallet, 4, "generate");
      return { result: undefined, entries: [entry] };
    });
    expect(
      (store.get("u1") as { stripeCustomerId?: string }).stripeCustomerId,
    ).toBe("cus_123");
  });
});

// #206: the subscription id is written INSIDE withWalletIdempotent's own
// transaction, not by a separate best-effort call afterwards. The deleted
// Asaas path did the latter, which meant a failed write left a subscribed
// wallet still visible to scripts/cron-renew.ts's past-due sweep AND
// reachable by its own renewal webhook -- the exact double-renewal #161
// exists to prevent.
describe("withWalletIdempotent (stripeSubscriptionId)", () => {
  beforeEach(() => {
    store.clear();
    ledger.length = 0;
    ledgerByExternalId.clear();
    tx.$executeRaw.mockReset();
    tx.$queryRaw.mockReset();
    tx.transaction.create.mockClear();
    wireTx();
  });

  it("persists the subscription id in the same transaction as the credit", async () => {
    await withWalletIdempotent(
      "u1",
      "pi_first",
      (wallet) =>
        applyPurchase(wallet, { type: "subscribe", plan: "atelier" }, NOW),
      "sub_abc",
    );
    const row = store.get("u1") as {
      balance: number;
      stripeSubscriptionId?: string;
    };
    expect(row.balance).toBe(500);
    expect(row.stripeSubscriptionId).toBe("sub_abc");
  });

  it("writes no subscription id when none is passed", async () => {
    await withWalletIdempotent("u1", "pi_topup", (wallet) =>
      applyPurchase(wallet, { type: "topup" }, NOW),
    );
    expect(
      (store.get("u1") as { stripeSubscriptionId?: string })
        .stripeSubscriptionId,
    ).toBeUndefined();
  });

  it("does not write the subscription id when the credit was a duplicate no-op", async () => {
    await withWalletIdempotent(
      "u1",
      "pi_first",
      (wallet) =>
        applyPurchase(wallet, { type: "subscribe", plan: "atelier" }, NOW),
      "sub_abc",
    );
    const second = await withWalletIdempotent(
      "u1",
      "pi_first",
      (wallet) =>
        applyPurchase(wallet, { type: "subscribe", plan: "factory" }, NOW),
      "sub_other",
    );
    expect(second.credited).toBe(false);
    // The duplicate delivery changed nothing -- neither the balance nor the
    // subscription id moved to the second call's values.
    const row = store.get("u1") as {
      balance: number;
      stripeSubscriptionId?: string;
    };
    expect(row.balance).toBe(500);
    expect(row.stripeSubscriptionId).toBe("sub_abc");
  });
});

describe("findWalletUserIdByStripeSubscriptionId", () => {
  beforeEach(() => store.clear());

  it("returns the owning userId, and null for an unknown subscription", async () => {
    store.set("u1", { plan: "atelier", stripeSubscriptionId: "sub_abc" });
    expect(await findWalletUserIdByStripeSubscriptionId("sub_abc")).toBe("u1");
    expect(await findWalletUserIdByStripeSubscriptionId("sub_nope")).toBeNull();
  });
});
