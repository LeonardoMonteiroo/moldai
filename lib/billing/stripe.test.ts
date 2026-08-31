import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";
import {
  loadStripeConfig,
  createCustomer,
  createCheckoutSession,
  cancelSubscription,
  verifyWebhookEvent,
  parseGatewayEvent,
  resolveInvoicePaymentIntent,
  buildPurchaseMetadata,
  parsePurchaseMetadata,
  StripeGatewayError,
  STRIPE_TIMEOUT_MS,
  METADATA_USER_ID,
  METADATA_PURCHASE_TYPE,
  METADATA_PLAN,
  METADATA_INTERVAL,
  type StripeLike,
} from "./stripe";
import { PLAN_PRICE_CENTS, TOPUP_PRICE_CENTS, annualPriceCents } from "./plans";

const CONFIG = { secretKey: "sk_test_x", webhookSecret: "whsec_test_x" };

// A fake client, never a real one -- this suite makes no network call and
// needs no live key. Only the four members lib/billing/stripe.ts actually
// calls are implemented, which is exactly what StripeLike declares.
function fakeClient(overrides: Partial<StripeLike> = {}): StripeLike {
  return {
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_1", url: "https://pay/x" })),
      },
    },
    customers: { create: vi.fn(async () => ({ id: "cus_1" })) },
    subscriptions: { cancel: vi.fn(async () => ({})) },
    invoices: {
      retrieve: vi.fn(async () => ({}) as Stripe.Invoice),
    },
    webhooks: {
      constructEvent: vi.fn(() => ({}) as Stripe.Event),
    },
    ...overrides,
  } as StripeLike;
}

describe("loadStripeConfig", () => {
  const KEY = process.env.STRIPE_SECRET_KEY;
  const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  function restore() {
    if (KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = KEY;
    if (SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  }

  it("returns null unless BOTH secrets are set", () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(loadStripeConfig()).toBeNull();
    // An API key alone is not enough: a deployment that can charge a card
    // but cannot verify the webhook that credits it would take money and
    // never deliver credits.
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(loadStripeConfig()).toBeNull();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_x";
    expect(loadStripeConfig()).toEqual({
      secretKey: "sk_test_x",
      webhookSecret: "whsec_test_x",
    });
    restore();
  });
});

describe("purchase metadata round trip", () => {
  it("round-trips a topup and every paid plan, monthly and annual", () => {
    expect(
      parsePurchaseMetadata(buildPurchaseMetadata("u1", { type: "topup" })),
    ).toEqual({ userId: "u1", purchase: { type: "topup" } });
    for (const plan of ["atelier", "studio", "factory"] as const) {
      for (const interval of ["month", "year"] as const) {
        expect(
          parsePurchaseMetadata(
            buildPurchaseMetadata("u1", { type: "subscribe", plan, interval }),
          ),
        ).toEqual({
          userId: "u1",
          purchase: { type: "subscribe", plan, interval },
        });
      }
    }
  });

  it("writes no plan or interval key for a topup", () => {
    expect(buildPurchaseMetadata("u1", { type: "topup" })).not.toHaveProperty(
      METADATA_PLAN,
    );
    expect(buildPurchaseMetadata("u1", { type: "topup" })).not.toHaveProperty(
      METADATA_INTERVAL,
    );
  });

  // The trust boundary: metadata arrives inside a signature-verified
  // payload, but it is still gateway-echoed input. A forged or tampered
  // value must never name an arbitrary tier.
  it.each([
    ["null metadata", null],
    ["no userId", { [METADATA_PURCHASE_TYPE]: "topup" }],
    [
      "unknown type",
      { [METADATA_USER_ID]: "u1", [METADATA_PURCHASE_TYPE]: "x" },
    ],
    [
      "subscribe with no plan",
      { [METADATA_USER_ID]: "u1", [METADATA_PURCHASE_TYPE]: "subscribe" },
    ],
    [
      "subscribe naming free",
      {
        [METADATA_USER_ID]: "u1",
        [METADATA_PURCHASE_TYPE]: "subscribe",
        [METADATA_PLAN]: "free",
      },
    ],
    [
      "subscribe naming an invented tier",
      {
        [METADATA_USER_ID]: "u1",
        [METADATA_PURCHASE_TYPE]: "subscribe",
        [METADATA_PLAN]: "enterprise",
      },
    ],
    [
      "subscribe naming an unrecognised interval",
      {
        [METADATA_USER_ID]: "u1",
        [METADATA_PURCHASE_TYPE]: "subscribe",
        [METADATA_PLAN]: "atelier",
        [METADATA_INTERVAL]: "weekly",
      },
    ],
  ])("rejects %s rather than throwing", (_label, metadata) => {
    expect(
      parsePurchaseMetadata(metadata as Record<string, string> | null),
    ).toBeNull();
  });
});

describe("createCheckoutSession", () => {
  it("prices a topup from TOPUP_PRICE_CENTS in one-off payment mode", async () => {
    const create = vi.fn(async (_p: Stripe.Checkout.SessionCreateParams) => ({
      id: "cs_1",
      url: "https://pay/x" as string | null,
    }));
    const client = fakeClient({
      checkout: { sessions: { create } },
    } as Partial<StripeLike>);
    const result = await createCheckoutSession(
      CONFIG,
      {
        customerId: "cus_1",
        purchase: { type: "topup" },
        userId: "u1",
        itemName: "Créditos avulsos",
        amountCents: TOPUP_PRICE_CENTS,
        successUrl: "https://app/ok",
        cancelUrl: "https://app/no",
      },
      { client },
    );
    expect(result).toEqual({ id: "cs_1", url: "https://pay/x" });
    const params = create.mock
      .calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params.mode).toBe("payment");
    const priceData = params.line_items?.[0]
      ?.price_data as Stripe.Checkout.SessionCreateParams.LineItem.PriceData;
    expect(priceData.unit_amount).toBe(TOPUP_PRICE_CENTS);
    expect(priceData.currency).toBe("brl");
    // A one-off has no recurring interval, and no subscription metadata to
    // carry forward -- there are no renewal invoices for it.
    expect(priceData.recurring).toBeUndefined();
    expect(params.subscription_data).toBeUndefined();
  });

  it("prices a subscribe from PLAN_PRICE_CENTS, monthly by default, and stamps metadata on BOTH the session and the subscription", async () => {
    const create = vi.fn(async (_p: Stripe.Checkout.SessionCreateParams) => ({
      id: "cs_2",
      url: "https://pay/y" as string | null,
    }));
    const client = fakeClient({
      checkout: { sessions: { create } },
    } as Partial<StripeLike>);
    await createCheckoutSession(
      CONFIG,
      {
        customerId: "cus_1",
        purchase: { type: "subscribe", plan: "studio", interval: "month" },
        userId: "u1",
        itemName: "Estúdio",
        amountCents: PLAN_PRICE_CENTS.studio,
        successUrl: "https://app/ok",
        cancelUrl: "https://app/no",
      },
      { client },
    );
    const params = create.mock
      .calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params.mode).toBe("subscription");
    const priceData = params.line_items?.[0]
      ?.price_data as Stripe.Checkout.SessionCreateParams.LineItem.PriceData;
    expect(priceData.unit_amount).toBe(PLAN_PRICE_CENTS.studio);
    expect(priceData.recurring).toEqual({ interval: "month" });
    // The subscription's own metadata is what a RENEWAL invoice carries
    // forward; without it a monthly renewal would arrive with no way back
    // to the account (and the plan it was for).
    expect((params.metadata as Record<string, string>)[METADATA_PLAN]).toBe(
      "studio",
    );
    expect(
      (params.subscription_data?.metadata as Record<string, string>)[
        METADATA_PLAN
      ],
    ).toBe("studio");
    expect(
      (params.subscription_data?.metadata as Record<string, string>)[
        METADATA_USER_ID
      ],
    ).toBe("u1");
    expect(
      (params.subscription_data?.metadata as Record<string, string>)[
        METADATA_INTERVAL
      ],
    ).toBe("month");
  });

  it("prices an annual subscribe with recurring.interval 'year' and the full annual amount", async () => {
    const create = vi.fn(async (_p: Stripe.Checkout.SessionCreateParams) => ({
      id: "cs_5",
      url: "https://pay/annual" as string | null,
    }));
    const client = fakeClient({
      checkout: { sessions: { create } },
    } as Partial<StripeLike>);
    await createCheckoutSession(
      CONFIG,
      {
        customerId: "cus_1",
        purchase: { type: "subscribe", plan: "atelier", interval: "year" },
        userId: "u1",
        itemName: "Ateliê",
        amountCents: annualPriceCents("atelier"),
        successUrl: "https://app/ok",
        cancelUrl: "https://app/no",
      },
      { client },
    );
    const params = create.mock
      .calls[0][0] as Stripe.Checkout.SessionCreateParams;
    const priceData = params.line_items?.[0]
      ?.price_data as Stripe.Checkout.SessionCreateParams.LineItem.PriceData;
    expect(priceData.recurring).toEqual({ interval: "year" });
    expect(priceData.unit_amount).toBe(annualPriceCents("atelier"));
  });

  it("requests Adaptive Pricing explicitly rather than relying on a Dashboard default", async () => {
    const create = vi.fn(async (_p: Stripe.Checkout.SessionCreateParams) => ({
      id: "cs_3",
      url: "https://pay/z" as string | null,
    }));
    const client = fakeClient({
      checkout: { sessions: { create } },
    } as Partial<StripeLike>);
    await createCheckoutSession(
      CONFIG,
      {
        customerId: "cus_1",
        purchase: { type: "topup" },
        userId: "u1",
        itemName: "x",
        amountCents: TOPUP_PRICE_CENTS,
        successUrl: "https://app/ok",
        cancelUrl: "https://app/no",
      },
      { client },
    );
    const params = create.mock
      .calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params.adaptive_pricing).toEqual({ enabled: true });
  });

  it("wraps a provider failure in StripeGatewayError without forwarding its message", async () => {
    const client = fakeClient({
      checkout: {
        sessions: {
          create: vi.fn(async () => {
            throw new Error("card_declined: raw provider detail 4242");
          }),
        },
      },
    } as Partial<StripeLike>);
    const promise = createCheckoutSession(
      CONFIG,
      {
        customerId: "cus_1",
        purchase: { type: "topup" },
        userId: "u1",
        itemName: "x",
        amountCents: TOPUP_PRICE_CENTS,
        successUrl: "https://app/ok",
        cancelUrl: "https://app/no",
      },
      { client },
    );
    await expect(promise).rejects.toBeInstanceOf(StripeGatewayError);
    await expect(promise).rejects.toThrow(/stripe checkout creation failed/);
    // The provider's own text must never reach our client -- it is chained
    // as `cause` for the log, not folded into the message.
    await expect(promise).rejects.not.toThrow(/4242/);
  });

  it("treats a session with no url as a failure rather than returning an empty redirect", async () => {
    const client = fakeClient({
      checkout: {
        sessions: { create: vi.fn(async () => ({ id: "cs_4", url: null })) },
      },
    } as Partial<StripeLike>);
    await expect(
      createCheckoutSession(
        CONFIG,
        {
          customerId: "cus_1",
          purchase: { type: "topup" },
          userId: "u1",
          itemName: "x",
          amountCents: TOPUP_PRICE_CENTS,
          successUrl: "https://app/ok",
          cancelUrl: "https://app/no",
        },
        { client },
      ),
    ).rejects.toBeInstanceOf(StripeGatewayError);
  });
});

describe("createCustomer", () => {
  it("sends no tax id -- the cpfCnpj defect the Asaas integration carried does not exist here", async () => {
    const create = vi.fn(async (_p: Stripe.CustomerCreateParams) => ({
      id: "cus_9",
    }));
    const client = fakeClient({ customers: { create } } as Partial<StripeLike>);
    const id = await createCustomer(
      CONFIG,
      { name: "Ana", email: "ana@example.com", userId: "u1" },
      { client },
    );
    expect(id).toBe("cus_9");
    const params = create.mock.calls[0][0] as Stripe.CustomerCreateParams;
    expect((params.metadata as Record<string, string>)[METADATA_USER_ID]).toBe(
      "u1",
    );
    expect(params).not.toHaveProperty("cpfCnpj");
    expect(params).not.toHaveProperty("tax_id");
  });
});

describe("verifyWebhookEvent", () => {
  it("rejects a missing signature header without calling the SDK", () => {
    const constructEvent = vi.fn(() => ({}) as Stripe.Event);
    const client = fakeClient({
      webhooks: { constructEvent },
    } as Partial<StripeLike>);
    expect(() => verifyWebhookEvent(CONFIG, "{}", null, { client })).toThrow(
      StripeGatewayError,
    );
    expect(constructEvent).not.toHaveBeenCalled();
  });

  // The acceptance criterion's signature-verification failure case: an
  // invalid signature is indistinguishable from a forged payload, so it must
  // throw rather than fall through to any event handling.
  it("wraps a signature failure in StripeGatewayError", () => {
    const client = fakeClient({
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error(
            "No signatures found matching the expected signature",
          );
        }),
      },
    } as Partial<StripeLike>);
    expect(() =>
      verifyWebhookEvent(CONFIG, "{}", "t=1,v1=bad", { client }),
    ).toThrow(/stripe webhook signature invalid/);
  });

  it("passes the RAW body bytes through untouched, never a reserialized object", () => {
    // Whitespace and key order are part of what the HMAC covers, so a route
    // that parsed and reserialized would produce a body that never verifies.
    const raw = '{\n  "id": "evt_1",\n  "type": "charge.refunded"\n}';
    const constructEvent = vi.fn(() => ({ id: "evt_1" }) as Stripe.Event);
    const client = fakeClient({
      webhooks: { constructEvent },
    } as Partial<StripeLike>);
    verifyWebhookEvent(CONFIG, raw, "t=1,v1=ok", { client });
    expect(constructEvent).toHaveBeenCalledWith(
      raw,
      "t=1,v1=ok",
      CONFIG.webhookSecret,
    );
  });

  it("verifies against a signature the SDK itself generated", () => {
    // The one case that exercises real HMAC code rather than a fake: the
    // SDK's own test-header helper signs a payload with our secret, and
    // constructEvent must accept it.
    const stripe = new Stripe(CONFIG.secretKey, {
      timeout: STRIPE_TIMEOUT_MS,
    });
    const payload = JSON.stringify({
      id: "evt_real",
      type: "charge.refunded",
      data: { object: {} },
    });
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: CONFIG.webhookSecret,
    });
    const event = verifyWebhookEvent(CONFIG, payload, header, {
      client: stripe as unknown as StripeLike,
    });
    expect(event.id).toBe("evt_real");
    // And the same payload with a tampered byte must NOT verify.
    expect(() =>
      verifyWebhookEvent(CONFIG, payload + " ", header, {
        client: stripe as unknown as StripeLike,
      }),
    ).toThrow(StripeGatewayError);
  });
});

// Helpers building the minimal shape parseGatewayEvent reads. Cast rather
// than constructed in full: a real Stripe.Event has ~40 required fields and
// this function reads five.
function event(type: string, object: unknown): Stripe.Event {
  return { id: "evt_1", type, data: { object } } as unknown as Stripe.Event;
}

describe("parseGatewayEvent", () => {
  const topupMeta = buildPurchaseMetadata("u1", { type: "topup" });
  const subMeta = buildPurchaseMetadata("u1", {
    type: "subscribe",
    plan: "studio",
    interval: "month",
  });

  it("maps a completed one-off session to topupPaid with its payment intent", () => {
    expect(
      parseGatewayEvent(
        event("checkout.session.completed", {
          mode: "payment",
          metadata: topupMeta,
          payment_intent: "pi_1",
        }),
      ),
    ).toEqual({ kind: "topupPaid", userId: "u1", paymentIntentId: "pi_1" });
  });

  // A subscription is credited from invoice.paid, NOT from the session --
  // crediting both would be two wallet mutations for one purchase.
  it("ignores a completed SUBSCRIPTION session for money purposes", () => {
    const result = parseGatewayEvent(
      event("checkout.session.completed", {
        mode: "subscription",
        metadata: subMeta,
        payment_intent: null,
      }),
    );
    expect(result.kind).toBe("ignored");
  });

  it("maps subscription_create to subscriptionStarted with the plan AND interval from metadata", () => {
    expect(
      parseGatewayEvent(
        event("invoice.paid", {
          id: "in_1",
          billing_reason: "subscription_create",
          parent: {
            subscription_details: {
              subscription: "sub_1",
              metadata: subMeta,
            },
          },
        }),
      ),
    ).toEqual({
      kind: "subscriptionStarted",
      userId: "u1",
      plan: "studio",
      interval: "month",
      invoiceId: "in_1",
      subscriptionId: "sub_1",
    });
  });

  it("recovers an annual interval from metadata the same way", () => {
    expect(
      parseGatewayEvent(
        event("invoice.paid", {
          id: "in_2",
          billing_reason: "subscription_create",
          parent: {
            subscription_details: {
              subscription: "sub_2",
              metadata: buildPurchaseMetadata("u1", {
                type: "subscribe",
                plan: "atelier",
                interval: "year",
              }),
            },
          },
        }),
      ),
    ).toMatchObject({ interval: "year" });
  });

  it("maps subscription_cycle to subscriptionRenewed, and tolerates absent metadata", () => {
    expect(
      parseGatewayEvent(
        event("invoice.paid", {
          id: "in_2",
          billing_reason: "subscription_cycle",
          parent: {
            subscription_details: { subscription: "sub_1", metadata: null },
          },
        }),
      ),
    ).toEqual({
      kind: "subscriptionRenewed",
      // Null is fine here and only here: a renewal is routed by the
      // subscription id this app itself recorded, so it does not depend on
      // gateway-echoed metadata the way a first payment does.
      userId: null,
      invoiceId: "in_2",
      subscriptionId: "sub_1",
    });
  });

  it("refuses to credit a subscription_create whose metadata cannot name a paid plan", () => {
    const result = parseGatewayEvent(
      event("invoice.paid", {
        id: "in_3",
        billing_reason: "subscription_create",
        parent: {
          subscription_details: {
            subscription: "sub_1",
            metadata: { [METADATA_USER_ID]: "u1" },
          },
        },
      }),
    );
    expect(result.kind).toBe("ignored");
  });

  it("ignores an invoice.paid for any other billing reason", () => {
    for (const reason of ["manual", "subscription_update", "quote_accept"]) {
      expect(
        parseGatewayEvent(
          event("invoice.paid", {
            id: "in_4",
            billing_reason: reason,
            parent: {
              subscription_details: { subscription: "sub_1", metadata: null },
            },
          }),
        ).kind,
      ).toBe("ignored");
    }
  });

  it("distinguishes a full refund from a partial one", () => {
    expect(
      parseGatewayEvent(
        event("charge.refunded", {
          payment_intent: "pi_1",
          amount: 5900,
          amount_refunded: 5900,
        }),
      ),
    ).toEqual({ kind: "refunded", paymentIntentId: "pi_1", full: true });
    expect(
      parseGatewayEvent(
        event("charge.refunded", {
          payment_intent: "pi_1",
          amount: 5900,
          amount_refunded: 1000,
        }),
      ),
    ).toEqual({ kind: "refunded", paymentIntentId: "pi_1", full: false });
  });

  it("reads an id off an EXPANDED object as well as a bare string", () => {
    expect(
      parseGatewayEvent(
        event("charge.refunded", {
          payment_intent: { id: "pi_expanded" },
          amount: 100,
          amount_refunded: 100,
        }),
      ),
    ).toMatchObject({ paymentIntentId: "pi_expanded" });
  });

  it("ignores every unrelated event type by name", () => {
    const result = parseGatewayEvent(event("customer.created", {}));
    expect(result).toEqual({ kind: "ignored", reason: "customer.created" });
  });
});

describe("resolveInvoicePaymentIntent", () => {
  it("expands payments and returns the first payment intent", async () => {
    const retrieve = vi.fn(
      async () =>
        ({
          payments: { data: [{ payment: { payment_intent: "pi_7" } }] },
        }) as unknown as Stripe.Invoice,
    );
    const client = fakeClient({
      invoices: { retrieve },
    } as Partial<StripeLike>);
    expect(await resolveInvoicePaymentIntent(CONFIG, "in_1", { client })).toBe(
      "pi_7",
    );
    expect(retrieve).toHaveBeenCalledWith("in_1", { expand: ["payments"] });
  });

  it("returns null rather than throwing when no payment intent is present", async () => {
    const client = fakeClient({
      invoices: {
        retrieve: vi.fn(
          async () => ({ payments: { data: [] } }) as unknown as Stripe.Invoice,
        ),
      },
    } as Partial<StripeLike>);
    expect(
      await resolveInvoicePaymentIntent(CONFIG, "in_1", { client }),
    ).toBeNull();
  });

  it("wraps a retrieve failure so the caller can treat it as transient", async () => {
    const client = fakeClient({
      invoices: {
        retrieve: vi.fn(async () => {
          throw new Error("connection reset");
        }),
      },
    } as Partial<StripeLike>);
    await expect(
      resolveInvoicePaymentIntent(CONFIG, "in_1", { client }),
    ).rejects.toBeInstanceOf(StripeGatewayError);
  });
});

describe("cancelSubscription", () => {
  it("calls subscriptions.cancel with the given id", async () => {
    const cancel = vi.fn(async () => ({}));
    const client = fakeClient({
      subscriptions: { cancel },
    } as Partial<StripeLike>);
    await cancelSubscription(CONFIG, "sub_old", { client });
    expect(cancel).toHaveBeenCalledWith("sub_old");
  });

  it("wraps a provider failure in StripeGatewayError", async () => {
    const client = fakeClient({
      subscriptions: {
        cancel: vi.fn(async () => {
          throw new Error("no such subscription");
        }),
      },
    } as Partial<StripeLike>);
    await expect(
      cancelSubscription(CONFIG, "sub_old", { client }),
    ).rejects.toBeInstanceOf(StripeGatewayError);
  });
});
