import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";
import { seedWallet } from "@/lib/billing/wallet";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";
import { PLAN_CREDITS, TOPUP_CREDITS } from "@/lib/billing/plans";

const NOW = new Date("2026-08-26T12:00:00.000Z");

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
      stripeSubscriptionId?: string,
    ) => {
      const w = wallet(userId);
      // Snapshotted rather than un-applied field by field: the real
      // implementation simply never calls saveWallet on the duplicate path,
      // so NOTHING it mutated is persisted -- including renewsAt, which a
      // per-field undo would silently get wrong for a `renew` entry.
      const before = { ...w };
      const entry = fn(w);
      if (seenExternalIds.has(externalId)) {
        Object.assign(w, before);
        return { credited: false };
      }
      // #196: mirrors lib/db/wallet.ts's own withWalletIdempotent -- records
      // which externalId now backs the wallet's plan whenever fn's entry
      // actually moved it, so route-level tests exercise the same
      // reverseRefundedSubscription decision the real DB layer feeds.
      if (entry.type === "subscribe" && entry.planChanged) {
        w.planSourceExternalId = externalId;
      }
      // #206: written in the SAME call as the credit, not afterwards.
      if (stripeSubscriptionId) {
        subscriptionIds.set(userId, stripeSubscriptionId);
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
  findWalletUserIdByStripeSubscriptionId: vi.fn(async (subId: string) => {
    for (const [userId, id] of subscriptionIds) {
      if (id === subId) return userId;
    }
    return null;
  }),
}));

// Partial mock ON PURPOSE: parseGatewayEvent stays REAL, so these tests
// exercise the route talking to the actual payload parser rather than to a
// stub that already agrees with it. Only the two members that need a live
// Stripe client are replaced -- signature verification (covered against real
// HMAC in lib/billing/stripe.test.ts) and the invoice retrieve.
vi.mock("@/lib/billing/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/stripe")>();
  return {
    ...actual,
    loadStripeConfig: vi.fn(() => ({
      secretKey: "sk_test_x",
      webhookSecret: "whsec_test_x",
    })),
    verifyWebhookEvent: vi.fn(),
    resolveInvoicePaymentIntent: vi.fn(async () => "pi_default"),
  };
});

import { POST } from "./route";
import {
  loadStripeConfig,
  verifyWebhookEvent,
  resolveInvoicePaymentIntent,
  StripeGatewayError,
  buildPurchaseMetadata,
} from "@/lib/billing/stripe";

function req(body = "{}") {
  return new Request("http://test/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=ok" },
    body,
  });
}

/** The minimal verified-event shape parseGatewayEvent reads. */
function stripeEvent(type: string, object: unknown): Stripe.Event {
  return { id: "evt_1", type, data: { object } } as unknown as Stripe.Event;
}

function topupSession(paymentIntentId = "pi_topup") {
  return stripeEvent("checkout.session.completed", {
    mode: "payment",
    metadata: buildPurchaseMetadata("u1", { type: "topup" }),
    payment_intent: paymentIntentId,
  });
}

function subscriptionInvoice(
  billingReason: string,
  { invoiceId = "in_1", subscriptionId = "sub_1", plan = "atelier" } = {},
) {
  return stripeEvent("invoice.paid", {
    id: invoiceId,
    billing_reason: billingReason,
    parent: {
      subscription_details: {
        subscription: subscriptionId,
        metadata: buildPurchaseMetadata("u1", {
          type: "subscribe",
          plan: plan as "atelier" | "studio" | "factory",
        }),
      },
    },
  });
}

function refundCharge(paymentIntentId: string, full = true) {
  return stripeEvent("charge.refunded", {
    payment_intent: paymentIntentId,
    amount: 5900,
    amount_refunded: full ? 5900 : 1000,
  });
}

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    wallets.clear();
    seenExternalIds.clear();
    ledger.length = 0;
    subscriptionIds.clear();
    vi.mocked(loadStripeConfig).mockReturnValue({
      secretKey: "sk_test_x",
      webhookSecret: "whsec_test_x",
    });
    vi.mocked(verifyWebhookEvent).mockReset();
    vi.mocked(resolveInvoicePaymentIntent).mockReset();
    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_default");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("authenticity", () => {
    // 400, never 200: an invalid signature is not a Stripe event at all, so
    // there is nothing for a retry to fix, and answering 200 would hide a
    // misconfigured secret (or a probe) completely.
    it("rejects an unverifiable payload with 400 and never touches a wallet", async () => {
      vi.mocked(verifyWebhookEvent).mockImplementation(() => {
        throw new StripeGatewayError("stripe webhook signature invalid");
      });
      const res = await POST(req());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_webhook_signature");
      expect(wallets.size).toBe(0);
    });

    it("answers 503 when the STRIPE_* secrets are unset, rather than accepting unverified events", async () => {
      vi.mocked(loadStripeConfig).mockReturnValue(null);
      const res = await POST(req());
      expect(res.status).toBe(503);
      expect(verifyWebhookEvent).not.toHaveBeenCalled();
    });

    // The signature covers the exact bytes, so the route must hand the raw
    // body through -- a parse-and-reserialize would break every real event.
    it("passes the raw request body to verification, byte for byte", async () => {
      const raw = '{\n  "id": "evt_1",\n  "type": "customer.created"\n}';
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        stripeEvent("customer.created", {}),
      );
      await POST(req(raw));
      expect(verifyWebhookEvent).toHaveBeenCalledWith(
        expect.anything(),
        raw,
        "t=1,v1=ok",
      );
    });
  });

  describe("topup", () => {
    it("credits TOPUP_CREDITS once, keyed on the payment intent", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(topupSession());
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(wallet("u1").balance).toBe(PLAN_CREDITS.free + TOPUP_CREDITS);
      expect(ledger).toHaveLength(1);
      expect(ledger[0].externalId).toBe("pi_topup");
    });

    it("is idempotent across a duplicate delivery", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(topupSession());
      await POST(req());
      const after = wallet("u1").balance;
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(wallet("u1").balance).toBe(after);
      expect(ledger).toHaveLength(1);
    });

    it("acknowledges (200) a session whose metadata names no account, without crediting", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        stripeEvent("checkout.session.completed", {
          mode: "payment",
          metadata: {},
          payment_intent: "pi_x",
        }),
      );
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(wallets.size).toBe(0);
    });
  });

  describe("subscription first payment", () => {
    it("applies the plan and records the subscription id in the same call", async () => {
      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_sub1");
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_create"),
      );
      const res = await POST(req());
      expect(res.status).toBe(200);
      const w = wallet("u1");
      expect(w.plan).toBe("atelier");
      expect(w.total).toBe(PLAN_CREDITS.atelier);
      expect(subscriptionIds.get("u1")).toBe("sub_1");
      expect(ledger[0].externalId).toBe("pi_sub1");
    });

    // A subscription checkout must be credited exactly once. The session
    // completion is deliberately a money no-op; invoice.paid is the credit.
    it("does not also credit from the checkout session for a subscription", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        stripeEvent("checkout.session.completed", {
          mode: "subscription",
          metadata: buildPurchaseMetadata("u1", {
            type: "subscribe",
            plan: "atelier",
          }),
          payment_intent: null,
        }),
      );
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(ledger).toHaveLength(0);
      expect(wallets.size).toBe(0);
    });

    it("keeps the monotonicity guard: a late lower-tier confirmation never walks the plan down", async () => {
      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_factory");
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_create", {
          invoiceId: "in_f",
          plan: "factory",
        }),
      );
      await POST(req());
      expect(wallet("u1").plan).toBe("factory");

      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_atelier");
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_create", {
          invoiceId: "in_a",
          plan: "atelier",
        }),
      );
      const balanceBefore = wallet("u1").balance;
      await POST(req());
      const w = wallet("u1");
      // Plan untouched; the settled payment is NOT swallowed -- its credit
      // value folds into `purchased` instead.
      expect(w.plan).toBe("factory");
      expect(w.balance).toBe(balanceBefore + PLAN_CREDITS.atelier);
      expect(w.purchased).toBe(PLAN_CREDITS.atelier);
    });

    it("acknowledges (200) without crediting when the invoice yields no payment intent", async () => {
      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue(null);
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_create"),
      );
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(ledger).toHaveLength(0);
    });

    // A retrieve failure is transient, so Stripe should retry -- this is the
    // case the deleted Asaas route's blanket-200 made unusable.
    it("answers 500 so Stripe retries when the invoice retrieve fails", async () => {
      vi.mocked(resolveInvoicePaymentIntent).mockRejectedValue(
        new StripeGatewayError("stripe invoice retrieve failed"),
      );
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_create"),
      );
      const res = await POST(req());
      expect(res.status).toBe(500);
      expect(ledger).toHaveLength(0);
    });
  });

  describe("subscription renewal", () => {
    async function subscribeFirst() {
      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_sub1");
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_create"),
      );
      await POST(req());
    }

    // #206: THE money invariant this issue's design turns on. The deleted
    // Asaas route ran every confirmed payment -- recurring included --
    // through applyPurchase, where a same-plan subscribe is refused by the
    // monotonicity guard and folded into `purchased`: the carry-over pool a
    // renewal must never touch. Because cron-renew excludes subscribed
    // wallets, that was the ONLY renewal path, so a subscriber's
    // `purchased` grew by a whole plan allowance every month, forever.
    it("renews (resetting balance to total + purchased) and never inflates `purchased`", async () => {
      await subscribeFirst();
      const w = wallet("u1");
      // Spend some of the allowance, so a real renewal is observable.
      w.balance -= 200;
      const purchasedBefore = w.purchased;

      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_cycle1");
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_cycle", { invoiceId: "in_2" }),
      );
      const res = await POST(req());
      expect(res.status).toBe(200);

      expect(w.balance).toBe(w.total + w.purchased);
      expect(w.purchased).toBe(purchasedBefore);
      expect(w.plan).toBe("atelier");
      expect(ledger.at(-1)?.entry.type).toBe("renew");
    });

    it("stays flat across many renewals rather than compounding", async () => {
      await subscribeFirst();
      const w = wallet("u1");
      for (let i = 0; i < 6; i++) {
        vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue(`pi_c${i}`);
        vi.mocked(verifyWebhookEvent).mockReturnValue(
          subscriptionInvoice("subscription_cycle", { invoiceId: `in_c${i}` }),
        );
        await POST(req());
      }
      expect(w.purchased).toBe(0);
      expect(w.balance).toBe(PLAN_CREDITS.atelier);
    });

    it("routes the renewal by the recorded subscription id", async () => {
      await subscribeFirst();
      expect(subscriptionIds.get("u1")).toBe("sub_1");
      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_cycle1");
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_cycle", { invoiceId: "in_2" }),
      );
      await POST(req());
      expect(ledger.at(-1)?.userId).toBe("u1");
    });

    it("is idempotent across a duplicate renewal delivery", async () => {
      await subscribeFirst();
      const w = wallet("u1");
      w.balance -= 100;
      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_cycle1");
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_cycle", { invoiceId: "in_2" }),
      );
      await POST(req());
      const afterFirst = { ...w };
      await POST(req());
      expect(w.balance).toBe(afterFirst.balance);
      expect(w.renewsAt?.getTime()).toBe(afterFirst.renewsAt?.getTime());
    });

    it("acknowledges (200) a renewal for a subscription no wallet claims", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        stripeEvent("invoice.paid", {
          id: "in_orphan",
          billing_reason: "subscription_cycle",
          parent: {
            subscription_details: {
              subscription: "sub_unknown",
              metadata: null,
            },
          },
        }),
      );
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(ledger).toHaveLength(0);
    });
  });

  describe("refund", () => {
    it("reverses a refunded topup's purchased credits, not just its balance", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(topupSession("pi_topup"));
      await POST(req());
      const w = wallet("u1");
      expect(w.purchased).toBe(TOPUP_CREDITS);

      vi.mocked(verifyWebhookEvent).mockReturnValue(refundCharge("pi_topup"));
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(w.purchased).toBe(0);
      expect(w.balance).toBe(PLAN_CREDITS.free);
    });

    it("resets the plan when the refunded entry IS the wallet's plan source", async () => {
      vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_sub1");
      vi.mocked(verifyWebhookEvent).mockReturnValue(
        subscriptionInvoice("subscription_create"),
      );
      await POST(req());
      expect(wallet("u1").plan).toBe("atelier");

      vi.mocked(verifyWebhookEvent).mockReturnValue(refundCharge("pi_sub1"));
      await POST(req());
      const w = wallet("u1");
      expect(w.plan).toBe("free");
      expect(w.total).toBe(PLAN_CREDITS.free);
      expect(w.planSourceExternalId).toBeNull();
    });

    it("no-ops for a payment intent nothing was ever credited under", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(refundCharge("pi_never"));
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(wallets.size).toBe(0);
    });

    // #206: reverseRefundedEntry undoes an entry's WHOLE contribution, so
    // applying it to a partial refund would claw back more than was given
    // back. Nothing in this app can issue a partial refund, so it is
    // reported for reconciliation rather than approximated.
    it("never claws back a whole entry for a PARTIAL refund", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(topupSession("pi_topup"));
      await POST(req());
      const w = wallet("u1");
      const before = { balance: w.balance, purchased: w.purchased };

      vi.mocked(verifyWebhookEvent).mockReturnValue(
        refundCharge("pi_topup", false),
      );
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(w.balance).toBe(before.balance);
      expect(w.purchased).toBe(before.purchased);
    });

    it("is idempotent across a duplicate refund delivery", async () => {
      vi.mocked(verifyWebhookEvent).mockReturnValue(topupSession("pi_topup"));
      await POST(req());
      vi.mocked(verifyWebhookEvent).mockReturnValue(refundCharge("pi_topup"));
      await POST(req());
      const w = wallet("u1");
      const after = { balance: w.balance, purchased: w.purchased };
      await POST(req());
      expect(w.balance).toBe(after.balance);
      expect(w.purchased).toBe(after.purchased);
    });
  });

  describe("unrelated events", () => {
    it("acknowledges every event type it does not act on, without touching a wallet", async () => {
      for (const type of [
        "customer.created",
        "payment_intent.succeeded",
        "invoice.payment_failed",
        "checkout.session.expired",
      ]) {
        vi.mocked(verifyWebhookEvent).mockReturnValue(stripeEvent(type, {}));
        const res = await POST(req());
        expect(res.status).toBe(200);
      }
      expect(wallets.size).toBe(0);
      expect(ledger).toHaveLength(0);
    });
  });
});
