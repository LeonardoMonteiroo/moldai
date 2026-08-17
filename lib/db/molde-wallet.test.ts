import { describe, it, expect, vi, beforeEach } from "vitest";

const moldeStore = new Map<string, unknown>();
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
      if (sql.includes('"Molde"') && sql.includes("UPDATE")) {
        callOrder.push("save-molde");
        const jsonStr = vals.find(
          (v): v is string =>
            typeof v === "string" && v.trimStart().startsWith("{"),
        );
        if (jsonStr) moldeStore.set("u1", JSON.parse(jsonStr));
      }
      if (sql.includes('"Wallet"') && sql.includes("UPDATE")) {
        callOrder.push("save-wallet");
        const [plan, planLabel, balance, total, renewsAt] = vals;
        walletStore.set("u1", { plan, planLabel, balance, total, renewsAt });
      }
      return 0;
    },
  ),
  $queryRaw: vi.fn(
    async (strings: TemplateStringsArray): Promise<unknown[]> => {
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      if (sql.includes('"Molde"')) {
        callOrder.push("lock-molde");
        if (!moldeStore.has("u1")) moldeStore.set("u1", seedMoldeState());
        return [{ data: JSON.parse(JSON.stringify(moldeStore.get("u1"))) }];
      }
      callOrder.push("lock-wallet");
      if (!walletStore.has("u1")) walletStore.set("u1", seedWallet(NOW));
      return [{ ...(walletStore.get("u1") as object) }];
    },
  ),
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
  },
}));

import { withMoldeAndWallet } from "./molde-wallet";
import { seedMoldeState, bumpVersion } from "@/lib/editor/state";
import { seedWallet, debitWallet } from "@/lib/billing/wallet";

describe("withMoldeAndWallet", () => {
  beforeEach(() => {
    moldeStore.clear();
    walletStore.clear();
    ledger.length = 0;
    callOrder.length = 0;
    tx.$executeRaw.mockClear();
    tx.$queryRaw.mockClear();
    tx.transaction.createMany.mockClear();
  });

  it("passes both a locked molde state and wallet to fn", async () => {
    let seenVersion: number | null = null;
    let seenBalance: number | null = null;
    await withMoldeAndWallet("u1", (state, wallet) => {
      seenVersion = state.pattern.version;
      seenBalance = wallet.balance;
      return { result: undefined, entries: [] };
    });
    expect(seenVersion).toBe(0);
    expect(seenBalance).toBe(320);
  });

  it("locks Molde before Wallet, always", async () => {
    await withMoldeAndWallet("u1", () => ({ result: undefined, entries: [] }));
    const lockIdx = callOrder.filter((c) => c.startsWith("lock-"));
    expect(lockIdx).toEqual(["lock-molde", "lock-wallet"]);
  });

  it("persists both mutations and the ledger, atomically", async () => {
    await withMoldeAndWallet("u1", (state, wallet) => {
      bumpVersion(state);
      const entry = debitWallet(wallet, 4, "generate");
      return { result: undefined, entries: [entry] };
    });
    expect(
      (moldeStore.get("u1") as { pattern: { version: number } }).pattern
        .version,
    ).toBe(1);
    expect((walletStore.get("u1") as { balance: number }).balance).toBe(316);
    expect(ledger).toHaveLength(1);
  });

  it("returns the value fn returns", async () => {
    const out = await withMoldeAndWallet("u1", () => ({
      result: "resp",
      entries: [],
    }));
    expect(out).toBe("resp");
  });
});
