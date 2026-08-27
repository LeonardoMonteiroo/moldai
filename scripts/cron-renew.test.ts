import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// #161: cron-renew.ts's own module-level `const prisma = new PrismaClient()`
// means the mock has to intercept the constructor itself, not an exported
// singleton -- there is no "./prisma" specifier to match here (contrast
// lib/db/*.test.ts, which mock the relative specifier those files import;
// see the #166 worktree-trap note this repo's CLAUDE.md records).
const { findMany, disconnect } = vi.hoisted(() => ({
  findMany: vi.fn(),
  disconnect: vi.fn(async () => undefined),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    wallet: { findMany },
    $disconnect: disconnect,
  })),
}));

// Mocked by the exact relative specifier cron-renew.ts imports
// ("../lib/db/wallet"), per the #166 worktree-trap rule.
const { withWallet } = vi.hoisted(() => ({ withWallet: vi.fn() }));
vi.mock("../lib/db/wallet", () => ({ withWallet }));

vi.mock("../lib/observability/report", () => ({ reportError: vi.fn() }));

describe("cron-renew (#161: skip wallets a live Stripe subscription already renews)", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries only unsubscribed past-due wallets, and renews exactly that one", async () => {
    // A tiny fake table standing in for the WHERE clause a real Postgres
    // query would apply -- filtering here on the exact same shape main()
    // passes in is what makes this a real regression guard: dropping the
    // `stripeSubscriptionId: null` filter from the subject file would make
    // this fake return BOTH rows, and the withWallet assertion below would
    // then fail (called twice, including for the subscribed wallet).
    const table = [
      { userId: "free-user", stripeSubscriptionId: null },
      { userId: "subscribed-user", stripeSubscriptionId: "sub_123" },
    ];
    findMany.mockImplementation(
      async ({
        where,
      }: {
        where: { renewsAt: { lte: Date }; stripeSubscriptionId?: null };
      }) => {
        expect(where.renewsAt.lte).toEqual(now);
        return table
          .filter(
            (row) =>
              !("stripeSubscriptionId" in where) ||
              row.stripeSubscriptionId === where.stripeSubscriptionId,
          )
          .map((row) => ({ userId: row.userId }));
      },
    );
    withWallet.mockResolvedValue(undefined);

    const { main } = await import("./cron-renew");
    await main();

    expect(findMany).toHaveBeenCalledWith({
      where: { renewsAt: { lte: now }, stripeSubscriptionId: null },
      select: { userId: true },
    });
    // Only the unsubscribed wallet is ever handed to withWallet -- the
    // subscribed one never reaches the renewal loop at all.
    expect(withWallet).toHaveBeenCalledTimes(1);
    expect(withWallet).toHaveBeenCalledWith("free-user", expect.any(Function));
  });

  it("does not touch $disconnect or process.exit as a side effect of being imported", async () => {
    // Regression guard for the import.meta.url === argv[1] entry-point
    // guard itself: importing this module under vitest (argv[1] is the
    // test runner's own entry, never this file) must not re-run main()
    // and call process.exit, which would kill the whole test process.
    findMany.mockResolvedValue([]);
    const mod = await import("./cron-renew");
    expect(typeof mod.main).toBe("function");
    expect(findMany).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });
});
