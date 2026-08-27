import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const ROW_UPDATED_AT = new Date("2026-08-21T11:30:00.000Z");
let wallet: Wallet = seedWallet(NOW);

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
// A stateful-enough fake of withStripeCustomerId: it actually remembers the
// id across calls (keyed per test user) so "reuses an existing customer"
// exercises real logic rather than a mock configured to already agree.
const stripeCustomerIds = new Map<string, string>();
vi.mock("@/lib/db/wallet", () => ({
  // #9: result is whatever the route's callback returns (a NextResponse,
  // since the route now builds its response under the lock) -- typed
  // `unknown` here rather than the route's own return shape so this mock
  // doesn't need to import NextResponse just to describe it.
  withWallet: vi.fn(
    async (
      _userId: string,
      fn: (w: Wallet) => { result: unknown; entries: LedgerEntry[] },
    ) => fn(wallet).result,
  ),
  // #206: also runs the route's `guard` against the (fake) locked wallet
  // and refuses before any provider call, so the upgrade-only rule is
  // exercised on the gateway path -- not just the mock one.
  withStripeCustomerId: vi.fn(
    async (
      userId: string,
      createCustomer: () => Promise<string>,
      guard?: (w: Wallet) => string | null,
    ) => {
      const refusal = guard?.(wallet) ?? null;
      if (refusal) return { ok: false, error: refusal };
      const existing = stripeCustomerIds.get(userId);
      if (existing) return { ok: true, customerId: existing };
      const id = await createCustomer();
      stripeCustomerIds.set(userId, id);
      return { ok: true, customerId: id };
    },
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/db/pattern", () => ({
  loadPattern: vi.fn(async (patternId: string) =>
    patternId === "m1"
      ? { state: seedPatternState(t), updatedAt: ROW_UPDATED_AT }
      : null,
  ),
  patternNotFound: vi.fn(
    () =>
      new Response(JSON.stringify({ status: "not_found" }), { status: 404 }),
  ),
}));
// #6: this route previously had no rate-limit bucket at all -- mocked
// allowed-by-default here so the pre-existing tests below still exercise
// the mock-purchase behaviour unchanged; individual tests override this to
// exercise the 429 path.
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));
vi.mock("@/lib/billing/stripe", () => ({
  loadStripeConfig: vi.fn(),
  createCustomer: vi.fn(),
  createCheckoutSession: vi.fn(async () => ({
    id: "cs_1",
    url: "https://checkout.stripe.com/c/pay/cs_1",
  })),
  StripeGatewayError: class StripeGatewayError extends Error {},
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { consume } from "@/lib/rate-limit/consume";
import { withWallet } from "@/lib/db/wallet";
import {
  loadStripeConfig,
  createCustomer,
  createCheckoutSession,
} from "@/lib/billing/stripe";
import { PLAN_PRICE_CENTS, TOPUP_PRICE_CENTS } from "@/lib/billing/plans";

function req(body: unknown) {
  return new Request("http://test/api/billing/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/purchase", () => {
  const ORIGINAL_PROVIDER = process.env.PAYMENT_PROVIDER;

  beforeEach(() => {
    wallet = seedWallet(NOW);
    delete process.env.PAYMENT_PROVIDER;
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(withWallet).mockClear();
    vi.mocked(consume).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(loadStripeConfig).mockReset();
    vi.mocked(loadStripeConfig).mockReturnValue({
      secretKey: "sk_test_x",
      webhookSecret: "whsec_test_x",
    });
    vi.mocked(createCustomer).mockReset();
    vi.mocked(createCheckoutSession).mockReset();
    vi.mocked(createCheckoutSession).mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.com/c/pay/cs_1",
    });
    stripeCustomerIds.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIGINAL_PROVIDER === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = ORIGINAL_PROVIDER;
  });

  describe("mock provider (default, PAYMENT_PROVIDER unset)", () => {
    it("with a patternId, returns the full composed editor state", async () => {
      const res = await POST(req({ type: "topup", patternId: "m1" }));
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.state.pattern.version).toBe(0);
      expect(json.state.credits.balance).toBe(130);
      // Non-mutating reader: must use the row's stored updatedAt, not "now".
      expect(json.state.pattern.updatedAt).toBe(ROW_UPDATED_AT.toISOString());
    });

    it("without a patternId, returns just credits", async () => {
      const res = await POST(req({ type: "topup" }));
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.credits.balance).toBe(130);
      expect(json.state).toBeUndefined();
    });

    it("404s when patternId is given but not found/owned", async () => {
      const res = await POST(req({ type: "topup", patternId: "not-mine" }));
      expect(res.status).toBe(404);
    });

    // The wallet write used to commit before patternId was checked, so a bad
    // id credited the account and then answered 404 -- the client never saw
    // it.
    it("does not touch the wallet when patternId is not found/owned", async () => {
      const before = wallet.balance;
      const res = await POST(req({ type: "topup", patternId: "not-mine" }));
      expect(res.status).toBe(404);
      expect(wallet.balance).toBe(before);
    });

    // applyPurchase treated anything that was not literally "topup" as
    // "subscribe", so an unrecognised (or absent) type granted the Atelie
    // plan.
    it("rejects an unknown purchase type without touching the wallet", async () => {
      const res = await POST(req({ type: "not-a-real-kind" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_purchase_type");
      expect(wallet.plan).toBe("free");
      expect(wallet.balance).toBe(30);
    });

    it("rejects a missing purchase type without touching the wallet", async () => {
      const res = await POST(req({}));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_purchase_type");
      expect(wallet.plan).toBe("free");
      expect(wallet.balance).toBe(30);
    });

    // #152: "null" is valid JSON, so it survives parseBody's JSON.parse and
    // fails PurchaseBodySchema's own object check -- this is the generic
    // bad_body, distinct from the domain-specific invalid_purchase_type
    // above (an object body with no usable `type`).
    it("answers bad_body, not invalid_purchase_type, for a literal null body", async () => {
      const res = await POST(req(null));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("bad_body");
      expect(wallet.plan).toBe("free");
      expect(wallet.balance).toBe(30);
    });

    it("still accepts the two real types", async () => {
      expect((await POST(req({ type: "topup" }))).status).toBe(200);
      wallet = seedWallet(NOW);
      const res = await POST(req({ type: "subscribe", plan: "atelier" }));
      expect(res.status).toBe(200);
      expect(wallet.plan).toBe("atelier");
    });

    // #9: absent, unknown, or the literal "free" must all be rejected
    // before applyPurchase ever runs -- the same isPurchaseType shape one
    // level up, now covering the plan a subscribe targets.
    describe("plan validation (#9)", () => {
      it("rejects a subscribe with no plan", async () => {
        const res = await POST(req({ type: "subscribe" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("invalid_plan");
        expect(wallet.plan).toBe("free");
        expect(wallet.balance).toBe(30);
      });

      it("rejects a subscribe to an unknown plan", async () => {
        const res = await POST(req({ type: "subscribe", plan: "gold" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("invalid_plan");
        expect(wallet.plan).toBe("free");
      });

      it('rejects a subscribe to "free" -- it is not a paid plan', async () => {
        const res = await POST(req({ type: "subscribe", plan: "free" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("invalid_plan");
        expect(wallet.plan).toBe("free");
        expect(wallet.balance).toBe(30);
      });

      it("subscribes a free wallet straight to studio, skipping atelier", async () => {
        const res = await POST(req({ type: "subscribe", plan: "studio" }));
        expect(res.status).toBe(200);
        expect(wallet.plan).toBe("studio");
        expect(wallet.total).toBe(2000);
      });

      it("subscribes to factory", async () => {
        const res = await POST(req({ type: "subscribe", plan: "factory" }));
        expect(res.status).toBe(200);
        expect(wallet.plan).toBe("factory");
        expect(wallet.total).toBe(10000);
      });

      it("refuses a downgrade under the wallet lock, with no mutation and no ledger row", async () => {
        wallet.plan = "studio";
        wallet.total = 2000;
        wallet.balance = 2000;
        const res = await POST(req({ type: "subscribe", plan: "atelier" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("plan_not_upgradable");
        expect(wallet.plan).toBe("studio");
        expect(wallet.balance).toBe(2000);
      });

      it("refuses a same-plan subscribe request", async () => {
        wallet.plan = "atelier";
        wallet.total = 500;
        wallet.balance = 500;
        const res = await POST(req({ type: "subscribe", plan: "atelier" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("plan_not_upgradable");
        expect(wallet.balance).toBe(500);
      });
    });

    it("no session returns 401", async () => {
      vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(401);
    });

    it("never calls the stripe client", async () => {
      await POST(req({ type: "topup" }));
      expect(createCheckoutSession).not.toHaveBeenCalled();
    });
  });

  describe("rate limiting", () => {
    it("429s on the IP-keyed bucket without touching the wallet", async () => {
      vi.mocked(consume).mockImplementation(async (bucket) =>
        bucket === "purchase"
          ? { allowed: false, retryAfterSec: 30 }
          : { allowed: true, retryAfterSec: 0 },
      );
      const before = wallet.balance;
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(429);
      expect(wallet.balance).toBe(before);
    });

    it("429s on the user-keyed bucket without touching the wallet", async () => {
      vi.mocked(consume).mockImplementation(async (bucket) =>
        bucket === "purchase_user"
          ? { allowed: false, retryAfterSec: 30 }
          : { allowed: true, retryAfterSec: 0 },
      );
      const before = wallet.balance;
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(429);
      expect(wallet.balance).toBe(before);
    });
  });

  describe("stripe provider (PAYMENT_PROVIDER=stripe)", () => {
    beforeEach(() => {
      process.env.PAYMENT_PROVIDER = "stripe";
      vi.mocked(createCheckoutSession).mockResolvedValue({
        id: "cs_1",
        url: "https://checkout.stripe.com/c/pay/cs_1",
      });
      vi.mocked(createCustomer).mockResolvedValue("cus_new");
    });

    it("returns a redirect and does not change the wallet balance", async () => {
      const before = wallet.balance;
      const res = await POST(req({ type: "topup" }));
      const json = await res.json();
      expect(json).toEqual({
        status: "redirect",
        url: "https://checkout.stripe.com/c/pay/cs_1",
      });
      expect(withWallet).not.toHaveBeenCalled();
      expect(wallet.balance).toBe(before);
    });

    it("invalid_purchase_type still 400s before any provider call", async () => {
      const res = await POST(req({ type: "nope" }));
      expect(res.status).toBe(400);
      expect(createCheckoutSession).not.toHaveBeenCalled();
    });

    it("still 404s on an unowned/missing patternId before creating a checkout", async () => {
      const res = await POST(req({ type: "topup", patternId: "not-mine" }));
      expect(res.status).toBe(404);
      expect(createCheckoutSession).not.toHaveBeenCalled();
    });

    it("creates a stripe customer on first purchase and reuses it after", async () => {
      await POST(req({ type: "topup" }));
      expect(createCustomer).toHaveBeenCalledTimes(1);

      await POST(req({ type: "topup" }));
      expect(createCustomer).toHaveBeenCalledTimes(1); // not called again
    });

    it("hands the whole validated Purchase to the checkout, so mode/recurrence is decided in one place", async () => {
      await POST(req({ type: "subscribe", plan: "atelier" }));
      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          purchase: { type: "subscribe", plan: "atelier" },
          userId: "u1",
        }),
      );
      vi.mocked(createCheckoutSession).mockClear();
      await POST(req({ type: "topup" }));
      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ purchase: { type: "topup" } }),
      );
    });

    // #206: the defect the deleted Asaas branch shipped -- it validated
    // isPaidPlanId and nothing else, so a DOWNGRADE created a real charge
    // that applyPurchase's monotonicity guard then folded into `purchased`:
    // money taken for a plan change that never happened. The refusal is
    // decided against the locked wallet, before any provider call.
    it("refuses a downgrade before creating any checkout", async () => {
      wallet.plan = "factory";
      const res = await POST(req({ type: "subscribe", plan: "atelier" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("plan_not_upgradable");
      expect(createCheckoutSession).not.toHaveBeenCalled();
    });

    it("refuses a same-tier resubscribe the same way", async () => {
      wallet.plan = "studio";
      const res = await POST(req({ type: "subscribe", plan: "studio" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("plan_not_upgradable");
      expect(createCheckoutSession).not.toHaveBeenCalled();
    });

    it("still allows a real upgrade", async () => {
      wallet.plan = "atelier";
      const res = await POST(req({ type: "subscribe", plan: "factory" }));
      expect(res.status).toBe(200);
      expect(createCheckoutSession).toHaveBeenCalled();
    });

    // #179: an unusable plan must never reach the provider -- same
    // trust-boundary shape as the mock path's own plan validation.
    describe("plan validation (#179)", () => {
      it("rejects a subscribe with no plan before any provider call", async () => {
        const res = await POST(req({ type: "subscribe" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("invalid_plan");
        expect(createCustomer).not.toHaveBeenCalled();
        expect(createCheckoutSession).not.toHaveBeenCalled();
      });

      it("rejects a subscribe to an unknown plan", async () => {
        const res = await POST(req({ type: "subscribe", plan: "gold" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("invalid_plan");
        expect(createCheckoutSession).not.toHaveBeenCalled();
      });

      it('rejects a subscribe to "free" -- it is not a paid plan', async () => {
        const res = await POST(req({ type: "subscribe", plan: "free" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("invalid_plan");
        expect(createCheckoutSession).not.toHaveBeenCalled();
      });
    });

    // #179/#206: the checkout amount comes from the *requested* plan
    // (lib/billing/plans.ts's PLAN_PRICE_CENTS), not a single flat
    // "subscribe" price -- a studio/factory checkout must charge its own
    // tier. Asserted against the constants, never a pasted number, so a
    // price change in plans.ts can't leave this test agreeing with a stale
    // figure. Amounts are centavos now (Stripe's minor unit).
    it("prices the checkout from plans.ts per requested tier, in centavos", async () => {
      await POST(req({ type: "topup" }));
      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          itemName: "topupTitle",
          amountCents: TOPUP_PRICE_CENTS,
        }),
      );
      for (const plan of ["atelier", "studio", "factory"] as const) {
        vi.mocked(createCheckoutSession).mockClear();
        // A fresh free wallet each time, so the upgrade guard allows every
        // tier rather than refusing the second one as a downgrade.
        wallet = seedWallet(NOW);
        stripeCustomerIds.clear();
        await POST(req({ type: "subscribe", plan }));
        expect(createCheckoutSession).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            itemName: `plans.${plan}.name`,
            amountCents: PLAN_PRICE_CENTS[plan],
          }),
        );
      }
    });

    it("answers checkout_unavailable when the STRIPE_* secrets are not configured", async () => {
      vi.mocked(loadStripeConfig).mockReturnValue(null);
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("checkout_unavailable");
      expect(createCheckoutSession).not.toHaveBeenCalled();
    });

    it("answers checkout_unavailable, never the provider's own error, when the gateway call fails", async () => {
      const { StripeGatewayError } = await import("@/lib/billing/stripe");
      vi.mocked(createCheckoutSession).mockRejectedValue(
        new StripeGatewayError("stripe checkout creation failed"),
      );
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toBe("checkout_unavailable");
      // The provider's own text must not appear in the client-facing body.
      expect(JSON.stringify(json)).not.toMatch(/stripe/i);
    });
  });
});
