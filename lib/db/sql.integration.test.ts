import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

// #104: every other test in this repo replaces PrismaClient with a fake
// (vi.mock("@/lib/db/prisma", ...)), so the hand-written raw SQL in
// lib/db/wallet.ts and lib/db/pattern.ts is otherwise never parsed by a real
// Postgres in any automated check. A migration that renamed or dropped a
// column one of those strings references (the repo already has one:
// 20260821120000_drop_wallet_plan_label) would pass build, lint, prettier
// and every other test, and only break in production -- lockWallet is on
// the path of every credited action (generate/graduate/purchase).
//
// Gated on TEST_DATABASE_URL, a variable distinct from DATABASE_URL, so a
// plain `npm test` never writes to a developer's own .env.local database --
// only CI (.github/workflows/ci.yml) sets it. The affected modules are
// dynamically imported inside beforeAll, after DATABASE_URL is pointed at
// TEST_DATABASE_URL: lib/db/prisma.ts's PrismaClient is constructed once at
// module-load time from process.env.DATABASE_URL, and ES module imports are
// hoisted above any plain statement in this file, so a static top-level
// import of ./wallet or ./pattern would already have constructed it against
// whatever DATABASE_URL happened to be set beforehand.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "raw SQL against a real database (#104)",
  () => {
    let prisma: PrismaClient;
    let withWallet: typeof import("./wallet").withWallet;
    let loadWallet: typeof import("./wallet").loadWallet;
    let withPattern: typeof import("./pattern").withPattern;
    let createPatternFromState: typeof import("./pattern").createPatternFromState;
    let userId: string;

    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      ({ prisma } = await import("./prisma"));
      ({ withWallet, loadWallet } = await import("./wallet"));
      ({ withPattern, createPatternFromState } = await import("./pattern"));

      const user = await prisma.user.create({
        data: {
          email: `sql-integration-${Date.now()}@moldai.local`,
          passwordHash: "not-a-real-hash",
        },
      });
      userId = user.id;
    });

    afterAll(async () => {
      // Cascades to the user's Wallet/Pattern/Transaction rows (schema.prisma's
      // onDelete: Cascade), so nothing else needs explicit cleanup.
      if (userId) await prisma.user.delete({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it("lockWallet materializes a default wallet and withWallet persists a real UPDATE", async () => {
      const before = await loadWallet(userId);
      expect(before.balance).toBeGreaterThan(0);

      await withWallet(userId, (wallet) => {
        wallet.balance -= 1;
        return {
          result: undefined,
          entries: [
            {
              type: "debit" as const,
              amount: -1,
              balanceAfter: wallet.balance,
              reason: "sql-integration-test",
            },
          ],
        };
      });

      const after = await loadWallet(userId);
      expect(after.balance).toBe(before.balance - 1);

      const ledgerRows = await prisma.transaction.findMany({
        where: { userId, reason: "sql-integration-test" },
      });
      expect(ledgerRows).toHaveLength(1);
    });

    it("withPattern locks, mutates and saves a real row scoped to (id, userId)", async () => {
      const { seedPatternState } = await import("@/lib/editor/state");
      const { t } = await import("@/lib/i18n/test-translate");
      const patternId = await createPatternFromState(
        userId,
        seedPatternState(t),
      );

      const found = await withPattern(patternId, userId, (state) => {
        state.pattern = { ...state.pattern, name: "sql integration" };
      });
      expect(found).not.toBeNull();

      const row = await prisma.pattern.findUniqueOrThrow({
        where: { id: patternId },
      });
      expect((row.data as { pattern: { name: string } }).pattern.name).toBe(
        "sql integration",
      );
    });

    it("withPattern returns null for a pattern owned by someone else, without touching it", async () => {
      const { seedPatternState } = await import("@/lib/editor/state");
      const { t } = await import("@/lib/i18n/test-translate");
      const patternId = await createPatternFromState(
        userId,
        seedPatternState(t),
      );

      const found = await withPattern(patternId, "someone-elses-id", () => {
        throw new Error("should never run against another account's row");
      });
      expect(found).toBeNull();
    });
  },
);
