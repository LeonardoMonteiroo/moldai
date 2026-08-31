import { describe, it, expect, vi, beforeEach } from "vitest";

const patternStore = new Map<string, { userId: string; data: unknown }>();
const walletStore = new Map<string, unknown>();
const ledger: unknown[] = [];
const callOrder: string[] = [];

const NOW = new Date("2026-08-17T12:00:00.000Z");

const tx = {
  $executeRaw: vi.fn(
    async (
      strings: TemplateStringsArray,
      ...vals: unknown[]
    ): Promise<number> => {
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      if (sql.includes('"Pattern"') && sql.includes("UPDATE")) {
        callOrder.push("save-pattern");
        // Interpolation order matches savePattern: json, id, userId.
        const [jsonStr, patternId, userId] = vals as [string, string, string];
        const row = patternStore.get(patternId);
        if (row && row.userId === userId) row.data = JSON.parse(jsonStr);
      }
      if (sql.includes('"Wallet"') && sql.includes("UPDATE")) {
        callOrder.push("save-wallet");
        // Interpolation order matches saveWallet: plan, balance, total,
        // purchased, renewsAt, planInterval, planSourceExternalId, userId --
        // userId is last.
        const [
          plan,
          balance,
          total,
          purchased,
          renewsAt,
          planInterval,
          planSourceExternalId,
          userId,
        ] = vals as [
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          string,
        ];
        walletStore.set(userId, {
          plan,
          balance,
          total,
          purchased,
          renewsAt,
          planInterval,
          planSourceExternalId,
        });
      }
      return 0;
    },
  ),
  $queryRaw: vi.fn(
    async (
      strings: TemplateStringsArray,
      ...vals: unknown[]
    ): Promise<unknown[]> => {
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      if (sql.includes('"Pattern"')) {
        callOrder.push("lock-pattern");
        const [patternId, userId] = vals as [string, string];
        const row = patternStore.get(patternId);
        if (!row || row.userId !== userId) return [];
        return [{ data: JSON.parse(JSON.stringify(row.data)) }];
      }
      callOrder.push("lock-wallet");
      const [userId] = vals as [string];
      if (!walletStore.has(userId)) walletStore.set(userId, seedWallet(NOW));
      return [{ ...(walletStore.get(userId) as object) }];
    },
  ),
  transaction: {
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
      ledger.push(...data);
      return { count: data.length };
    }),
  },
};

// #166: matches the specifier this file's own subject imports (see
// lib/db/aliasResolution.test.ts and CLAUDE.md's testing-conventions note).
vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

import { withPatternAndWallet } from "./pattern-wallet";
import { seedPatternState, bumpVersion } from "@/lib/editor/state";
import { seedWallet, debitWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";

describe("withPatternAndWallet", () => {
  beforeEach(() => {
    patternStore.clear();
    patternStore.set("m1", { userId: "u1", data: seedPatternState(t) });
    walletStore.clear();
    ledger.length = 0;
    callOrder.length = 0;
    tx.$executeRaw.mockClear();
    tx.$queryRaw.mockClear();
    tx.transaction.createMany.mockClear();
  });

  it("passes both a locked pattern state and wallet to fn", async () => {
    let seenVersion: number | null = null;
    let seenBalance: number | null = null;
    await withPatternAndWallet("m1", "u1", (state, wallet) => {
      seenVersion = state.pattern.version;
      seenBalance = wallet.balance;
      return { result: undefined, entries: [] };
    });
    expect(seenVersion).toBe(0);
    expect(seenBalance).toBe(30);
  });

  it("locks Pattern before Wallet, always", async () => {
    await withPatternAndWallet("m1", "u1", () => ({
      result: undefined,
      entries: [],
    }));
    const lockIdx = callOrder.filter((c) => c.startsWith("lock-"));
    expect(lockIdx).toEqual(["lock-pattern", "lock-wallet"]);
  });

  it("persists both mutations and the ledger, atomically", async () => {
    await withPatternAndWallet("m1", "u1", (state, wallet) => {
      bumpVersion(state);
      const entry = debitWallet(wallet, 4, "generate");
      return { result: undefined, entries: [entry] };
    });
    expect(
      (patternStore.get("m1")!.data as { pattern: { version: number } }).pattern
        .version,
    ).toBe(1);
    expect((walletStore.get("u1") as { balance: number }).balance).toBe(26);
    expect(ledger).toHaveLength(1);
  });

  it("returns null and never locks the wallet when the pattern isn't owned", async () => {
    let called = false;
    const out = await withPatternAndWallet("m1", "someone-else", () => {
      called = true;
      return { result: undefined, entries: [] };
    });
    expect(out).toBeNull();
    expect(called).toBe(false);
    expect(callOrder).toEqual(["lock-pattern"]);
  });

  it("returns the value fn returns", async () => {
    const out = await withPatternAndWallet("m1", "u1", () => ({
      result: "resp",
      entries: [],
    }));
    expect(out).toBe("resp");
  });

  // #72: the fake used to key wallet reads/writes on a hardcoded "u1"
  // regardless of the userId argument, so deleting the WHERE userId = $1
  // clause from lockWallet/saveWallet's real SQL would still leave this
  // whole suite green. Pattern m1/u1 and a wallet for u2 coexisting proves
  // the combined-lock path scopes the wallet half by the actual caller.
  it("debiting u1's wallet through m1 never touches a pre-existing u2 wallet", async () => {
    walletStore.set("u2", seedWallet(NOW));

    await withPatternAndWallet("m1", "u1", (_state, wallet) => {
      const entry = debitWallet(wallet, 4, "generate");
      return { result: undefined, entries: [entry] };
    });

    expect((walletStore.get("u1") as { balance: number }).balance).toBe(26);
    expect((walletStore.get("u2") as { balance: number }).balance).toBe(30);
  });

  // #43: a rejecting branch (insufficient credits, nothing to graduate)
  // returns before mutating anything, but the save used to run unconditionally
  // anyway -- rewriting Pattern.updatedAt (which listPatternsForUser sorts by)
  // and re-serializing the whole blob for a request that changed nothing.
  it("skips saving the pattern and wallet when fn reports dirty: false", async () => {
    await withPatternAndWallet("m1", "u1", () => ({
      result: undefined,
      entries: [],
      dirty: false,
    }));
    expect(callOrder).not.toContain("save-pattern");
    expect(callOrder).not.toContain("save-wallet");
  });

  it("still saves by default when fn omits the dirty flag", async () => {
    await withPatternAndWallet("m1", "u1", (state) => {
      bumpVersion(state);
      return { result: undefined, entries: [] };
    });
    expect(callOrder).toContain("save-pattern");
    expect(callOrder).toContain("save-wallet");
    expect(
      (patternStore.get("m1")!.data as { pattern: { version: number } }).pattern
        .version,
    ).toBe(1);
  });

  it("persists u2's wallet debit independently of u1's, when both exist", async () => {
    patternStore.set("m2", { userId: "u2", data: seedPatternState(t) });
    walletStore.set("u1", seedWallet(NOW));

    await withPatternAndWallet("m2", "u2", (state, wallet) => {
      const entry = debitWallet(wallet, 4, "generate");
      return { result: undefined, entries: [entry] };
    });

    expect((walletStore.get("u2") as { balance: number }).balance).toBe(26);
    expect((walletStore.get("u1") as { balance: number }).balance).toBe(30);
  });
});
