import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedWallet } from "@/lib/billing/wallet";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-26T12:00:00.000Z");
const TOKEN = "a".repeat(32);

// A realistic-enough fake of lib/db/wallet.ts's withWalletIdempotent: it
// actually tracks which externalIds have already been "inserted" in an
// in-memory Set, so a test that delivers the same event twice genuinely
// exercises the route's dedup path rather than asserting a mock was called
// twice with the same args (which would pass even if the route never
// checked anything). The real atomic implementation (Prisma transaction +
// unique constraint) is covered separately in lib/db/wallet.test.ts.
const wallets = new Map<string, Wallet>();
const seenExternalIds = new Set<string>();
const ledger: { userId: string; externalId: string; entry: LedgerEntry }[] = [];
const subscriptionIds = new Map<string, string>();

function wallet(userId: string): Wallet {
  let w = wallets.get(userId);
  if (!w) {
    w = seedWallet(NOW);
    wallets.set(userId, w);
  }
  return w;
}

vi.mock("@/lib/db/wallet", () => ({
  withWalletIdempotent: vi.fn(
    async (
      userId: string,
      externalId: string,
      fn: (w: Wallet) => LedgerEntry,
    ) => {
      const w = wallet(userId);
      const entry = fn(w);
      if (seenExternalIds.has(externalId)) {
        // Duplicate delivery: undo fn's in-place mutation, mirroring how the
        // real implementation never calls saveWallet on this path.
        if (entry.type === "debit") w.balance += entry.amount;
        else w.balance -= entry.amount;
        return { credited: false };
      }
      // #196: mirrors lib/db/wallet.ts's own withWalletIdempotent -- records
      // which externalId now backs the wallet's plan whenever fn's entry
      // actually moved it, so route-level tests exercise the same
      // reverseRefundedSubscription decision the real DB layer feeds.
      if (entry.type === "subscribe" && entry.planChanged) {
        w.planSourceExternalId = externalId;
      }
      seenExternalIds.add(externalId);
      ledger.push({ userId, externalId, entry });
      return { credited: true };
    },
  ),
  findLedgerEntryByExternalId: vi.fn(async (externalId: string) => {
    const row = ledger.find((r) => r.externalId === externalId);
    return row
      ? {
          userId: row.userId,
          amount: row.entry.amount,
          type: row.entry.type,
          planChanged: row.entry.planChanged ?? false,
        }
      : null;
  }),
  setAsaasSubscriptionId: vi.fn(async (userId: string, subId: string) => {
    subscriptionIds.set(userId, subId);
  }),
}));

import { POST } from "./route";
import { withWalletIdempotent } from "@/lib/db/wallet";

function req(
  body: unknown,
  headers: Record<string, string> = { "asaas-access-token": TOKEN },
) {
  return new Request("http://test/api/billing/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const CONFIRMED_PAYLOAD = {
  event: "PAYMENT_CONFIRMED",
  payment: { id: "pay_1", externalReference: "u1:topup" },
};

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
    wallets.clear();
    seenExternalIds.clear();
    ledger.length = 0;
    subscriptionIds.clear();
    vi.mocked(withWalletIdempotent).mockClear();
    // A handful of cases deliberately trigger reportError's console.error
    // (a malformed/no-op payload that must still 200) -- silenced so the
    // test run stays readable; the response status is what's asserted.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a wrong asaas-access-token with 401, without ever loading the wallet", async () => {
    const res = await POST(
      req(CONFIRMED_PAYLOAD, { "asaas-access-token": "b".repeat(32) }),
    );
    expect(res.status).toBe(401);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("rejects a request with no token header at all", async () => {
    const res = await POST(req(CONFIRMED_PAYLOAD, {}));
    expect(res.status).toBe(401);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("rejects when ASAAS_WEBHOOK_TOKEN is not configured server-side", async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    const res = await POST(req(CONFIRMED_PAYLOAD));
    expect(res.status).toBe(401);
  });

  it("PAYMENT_CONFIRMED credits the wallet once and writes one ledger row carrying the payment id as externalId", async () => {
    const res = await POST(req(CONFIRMED_PAYLOAD));
    expect(res.status).toBe(200);
    expect(wallet("u1").balance).toBe(130); // seed 30 + topup 100
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ userId: "u1", externalId: "pay_1" });
    expect(ledger[0].entry.type).toBe("topup");
  });

  // This is the test that matters -- at-least-once delivery guarantees this
  // happens in production.
  it("the same webhook payload delivered twice credits the account exactly once", async () => {
    const first = await POST(req(CONFIRMED_PAYLOAD));
    const second = await POST(req(CONFIRMED_PAYLOAD));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(wallet("u1").balance).toBe(130);
    expect(ledger).toHaveLength(1);
  });

  it("credits subscribe checkouts and best-effort persists the subscription id", async () => {
    const res = await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_2",
          externalReference: "u2:subscribe:atelier",
          subscription: "sub_abc",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(wallet("u2").plan).toBe("atelier");
    expect(subscriptionIds.get("u2")).toBe("sub_abc");
  });

  // #179: a confirmed subscribe payment applies whichever paid tier the
  // checkout was actually created for -- recovered from externalReference,
  // never hardcoded to atelier regardless of what was paid for.
  it("credits the plan the checkout was actually created for, not a hardcoded atelier", async () => {
    const studio = await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_studio", externalReference: "u4:subscribe:studio" },
      }),
    );
    expect(studio.status).toBe(200);
    expect(wallet("u4").plan).toBe("studio");
    expect(wallet("u4").total).toBe(2000);

    const factory = await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_factory",
          externalReference: "u5:subscribe:factory",
        },
      }),
    );
    expect(factory.status).toBe(200);
    expect(wallet("u5").plan).toBe("factory");
    expect(wallet("u5").total).toBe(10000);
  });

  // #179: the embedded plan is itself re-validated (the isPaidPlanId trust
  // boundary) -- an unrecognised or "free" plan must not silently apply,
  // and must not fall back to crediting atelier either.
  it("a subscribe reference with an unrecognised embedded plan is a no-op, still 200", async () => {
    const res = await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_bad_plan", externalReference: "u6:subscribe:gold" },
      }),
    );
    expect(res.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("a subscribe reference missing its embedded plan is a no-op, still 200", async () => {
    const res = await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_no_plan", externalReference: "u7:subscribe" },
      }),
    );
    expect(res.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("an unrecognised event returns 200, not 4xx", async () => {
    const res = await POST(
      req({ event: "SOME_FUTURE_EVENT", payment: { id: "pay_9" } }),
    );
    expect(res.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("CHECKOUT_EXPIRED and CHECKOUT_CANCELED return 200 without touching any wallet", async () => {
    const expired = await POST(req({ event: "CHECKOUT_EXPIRED" }));
    const canceled = await POST(req({ event: "CHECKOUT_CANCELED" }));
    expect(expired.status).toBe(200);
    expect(canceled.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("a PAYMENT_CONFIRMED with no matching prior credit is silently skipped, still 200", async () => {
    const res = await POST(
      req({ event: "PAYMENT_REFUNDED", payment: { id: "never-credited" } }),
    );
    expect(res.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("PAYMENT_REFUNDED debits back exactly what the original payment credited", async () => {
    await POST(req(CONFIRMED_PAYLOAD)); // credits u1 +100 (topup)
    const res = await POST(
      req({ event: "PAYMENT_REFUNDED", payment: { id: "pay_1" } }),
    );
    expect(res.status).toBe(200);
    expect(wallet("u1").balance).toBe(30); // back to the seeded balance
  });

  it("a duplicated PAYMENT_REFUNDED delivery only debits once", async () => {
    await POST(req(CONFIRMED_PAYLOAD));
    await POST(req({ event: "PAYMENT_REFUNDED", payment: { id: "pay_1" } }));
    await POST(req({ event: "PAYMENT_REFUNDED", payment: { id: "pay_1" } }));
    expect(wallet("u1").balance).toBe(30);
  });

  it("PAYMENT_CONFIRMED with a missing externalReference is a no-op, still 200", async () => {
    const res = await POST(
      req({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_3" } }),
    );
    expect(res.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("PAYMENT_CONFIRMED with an unparseable externalReference is a no-op, still 200", async () => {
    const res = await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_4", externalReference: "garbage" },
      }),
    );
    expect(res.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  // A non-2xx here counts towards Asaas's 15-consecutive-failure queue
  // pause exactly like an unrecognised event does -- so even the shared
  // parseBody 400 every other route in this app returns as-is must not
  // escape from this one.
  it("a malformed (non-JSON) body still answers 200, not the shared parseBody 400", async () => {
    const res = await POST(
      new Request("http://test/api/billing/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "asaas-access-token": TOKEN,
        },
        body: "not json",
      }),
    );
    expect(res.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  // #152: "null" is valid JSON (unlike "not json" above) -- it survives
  // parseBody's JSON.parse and fails AsaasWebhookBodySchema's own object
  // check instead, exercising the schema-rejection branch rather than the
  // JSON-syntax-error branch. Both must still answer 200, never propagate
  // the shared bad_body.
  it("a literal null body still answers 200, not the shared parseBody 400", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(200);
    expect(withWalletIdempotent).not.toHaveBeenCalled();
  });

  it("PAYMENT_REFUNDED for a subscribe purchase also reverts the plan back to free, not just the balance", async () => {
    await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_5", externalReference: "u3:subscribe:atelier" },
      }),
    );
    expect(wallet("u3").plan).toBe("atelier");
    const res = await POST(
      req({ event: "PAYMENT_REFUNDED", payment: { id: "pay_5" } }),
    );
    expect(res.status).toBe(200);
    expect(wallet("u3").plan).toBe("free");
    expect(wallet("u3").total).toBe(30);
    expect(wallet("u3").balance).toBe(30); // back to the seeded free balance
  });

  it("PAYMENT_REFUNDED for a topup purchase never touches plan/total", async () => {
    await POST(req(CONFIRMED_PAYLOAD)); // u1:topup
    await POST(req({ event: "PAYMENT_REFUNDED", payment: { id: "pay_1" } }));
    expect(wallet("u1").plan).toBe("free");
    expect(wallet("u1").total).toBe(30);
  });

  // #198: this route's own half of the fix. The assertion above (plan/total
  // untouched) is exactly what the pre-#198 test checked -- and it passed
  // throughout, because `purchased` is neither of those. A topup grants BOTH
  // balance and purchased, so reversing only the balance half left the
  // carry-over pool inflated and every later renewal re-granted the refunded
  // credits (renewWallet: total + purchased).
  it("PAYMENT_REFUNDED for a topup returns purchased, not just balance", async () => {
    await POST(req(CONFIRMED_PAYLOAD)); // u1:topup, +100 to balance AND purchased
    expect(wallet("u1").balance).toBe(130);
    expect(wallet("u1").purchased).toBe(100);

    await POST(req({ event: "PAYMENT_REFUNDED", payment: { id: "pay_1" } }));

    expect(wallet("u1").balance).toBe(30);
    expect(wallet("u1").purchased).toBe(0);
  });

  // #193: the acceptance criterion itself -- confirm factory, then confirm
  // an OLDER, lower-plan studio payment for the same account (Asaas
  // guarantees at-least-once, out-of-order delivery). The wallet must stay
  // on factory; the studio payment must still be credited, not dropped.
  it("an out-of-order lower-plan confirmation arriving after a higher one leaves the wallet on the higher plan", async () => {
    const factory = await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_factory",
          externalReference: "u8:subscribe:factory",
        },
      }),
    );
    expect(factory.status).toBe(200);
    expect(wallet("u8").plan).toBe("factory");
    expect(wallet("u8").total).toBe(10000);

    // The reordered/delayed studio confirmation -- a genuinely distinct
    // payment id, not a duplicate delivery of the same one.
    const studio = await POST(
      req({
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_studio_late",
          externalReference: "u8:subscribe:studio",
        },
      }),
    );
    expect(studio.status).toBe(200);
    expect(wallet("u8").plan).toBe("factory");
    expect(wallet("u8").total).toBe(10000);
    // The studio payment is still honoured -- folded into balance as
    // purchased credits, not silently dropped.
    expect(wallet("u8").balance).toBe(12000); // 10000 + 2000
    expect(wallet("u8").purchased).toBe(2000);
    // Both payments left their own ledger trace (idempotency keyed by
    // payment id, unaffected by this guard).
    expect(ledger.filter((r) => r.userId === "u8")).toHaveLength(2);
  });

  // #196: the issue's own acceptance criterion. Wallet upgraded to factory,
  // then a SEPARATE, lower-plan subscribe payment is confirmed (superseded
  // per #193 -- folded into purchased, plan untouched), then THAT payment
  // is refunded. The wallet must stay on factory, not drop to free.
  describe("PAYMENT_REFUNDED plan-source tracking (#196)", () => {
    it("refunding a superseded (folded) subscribe payment undoes exactly what it added, leaving the wallet on its real plan", async () => {
      await POST(
        req({
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: "pay_factory",
            externalReference: "u9:subscribe:factory",
          },
        }),
      );
      expect(wallet("u9").plan).toBe("factory");
      expect(wallet("u9").balance).toBe(10000);

      await POST(
        req({
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: "pay_studio_superseded",
            externalReference: "u9:subscribe:studio",
          },
        }),
      );
      expect(wallet("u9").plan).toBe("factory"); // unchanged -- #193's guard
      expect(wallet("u9").balance).toBe(12000); // 10000 + 2000 folded
      expect(wallet("u9").purchased).toBe(2000);

      const res = await POST(
        req({
          event: "PAYMENT_REFUNDED",
          payment: { id: "pay_studio_superseded" },
        }),
      );
      expect(res.status).toBe(200);
      // The bug this issue fixes: this must NOT reset to free.
      expect(wallet("u9").plan).toBe("factory");
      expect(wallet("u9").total).toBe(10000);
      // It DOES precisely undo what the folded payment added.
      expect(wallet("u9").balance).toBe(10000);
      expect(wallet("u9").purchased).toBe(0);
    });

    it("refunding the actual plan-setting payment still fully resets to free, even after an unrelated fold happened in between", async () => {
      await POST(
        req({
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: "pay_factory_2",
            externalReference: "u10:subscribe:factory",
          },
        }),
      );
      await POST(
        req({
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: "pay_studio_superseded_2",
            externalReference: "u10:subscribe:studio",
          },
        }),
      ); // folded, +2000 purchased/balance -- must not confuse the refund below
      expect(wallet("u10").balance).toBe(12000);

      const res = await POST(
        req({
          event: "PAYMENT_REFUNDED",
          payment: { id: "pay_factory_2" },
        }),
      );
      expect(res.status).toBe(200);
      expect(wallet("u10").plan).toBe("free");
      expect(wallet("u10").total).toBe(30);
      // reverseSubscription undoes the ORIGINAL subscribe entry's own
      // stored delta (10000 - 30 = 9970), not the plan's flat total --
      // matching how every other subscribe/refund pair in this suite
      // already behaves. Balance lands at 12000 - 9970 = 2030: the seeded
      // 30 plus the 2000 the later, unrelated fold added and was never
      // itself refunded. A real gateway would refund at most one of these
      // two payments in a single event; this ordering is a deliberately
      // pessimistic stress case; the acceptance criterion it proves is that
      // the fold in between never confuses which entry is being reversed.
      expect(wallet("u10").balance).toBe(2030);
    });

    // The chain-of-upgrades case named in the issue's own Context section:
    // refund the ORIGINAL atelier->studio payment after the account later,
    // separately, upgraded to factory. Pre-#196 this reset the wallet to
    // free even though factory is the real, currently-active plan.
    it("refunding a real plan-changing payment that was later superseded by a further upgrade leaves the wallet untouched", async () => {
      await POST(
        req({
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: "pay_atelier_3",
            externalReference: "u11:subscribe:atelier",
          },
        }),
      );
      expect(wallet("u11").plan).toBe("atelier");

      await POST(
        req({
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: "pay_factory_3",
            externalReference: "u11:subscribe:factory",
          },
        }),
      );
      expect(wallet("u11").plan).toBe("factory");
      const balanceAfterFactory = wallet("u11").balance;

      const res = await POST(
        req({ event: "PAYMENT_REFUNDED", payment: { id: "pay_atelier_3" } }),
      );
      expect(res.status).toBe(200);
      expect(wallet("u11").plan).toBe("factory");
      expect(wallet("u11").total).toBe(10000);
      expect(wallet("u11").balance).toBe(balanceAfterFactory); // untouched
    });
  });
});
