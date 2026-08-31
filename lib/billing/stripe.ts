import Stripe from "stripe";
import { isPurchaseType, type Purchase } from "./wallet";
import {
  CURRENCY,
  isPaidPlanId,
  isBillingInterval,
  type PaidPlanId,
  type BillingInterval,
} from "./plans";

/**
 * #206: the one file that talks to Stripe -- mirrors lib/ai/index.ts being
 * the one file importing the Anthropic SDK. Reached only from the "stripe"
 * branch of app/api/billing/purchase/route.ts and from
 * app/api/billing/webhook/route.ts, both gated by lib/billing/provider.ts's
 * PAYMENT_PROVIDER flag (default "mock" -- this module is never called at
 * all in the default configuration).
 *
 * It deliberately exports no Stripe type. Everything crossing this boundary
 * is a local shape (GatewayEvent, CheckoutInput, ...), so a route never has
 * to import the SDK to read a webhook -- and so the Stripe-payload shape
 * guessing lives in exactly one reviewable place.
 *
 * UNVERIFIED AGAINST A LIVE STRIPE ACCOUNT. There is no Stripe account and
 * no API key in the environment this shipped from. Built against the
 * installed SDK's own type declarations (stripe@22, read 2026-08-27) and
 * exercised only against a faked client in stripe.test.ts -- the same
 * standing caveat the deleted Asaas module carried. What a human still has
 * to verify against a real sandbox is listed in the PR body.
 */

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

/**
 * Null when either secret is missing -- callers treat that as
 * "gateway unavailable" (a 503) rather than half-configuring a money path.
 * The webhook secret is required alongside the API key on purpose: a
 * deployment that can create charges but cannot verify the webhook that
 * credits them would take money and never deliver credits.
 */
export function loadStripeConfig(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) return null;
  return { secretKey, webhookSecret };
}

/**
 * Thrown for any transport failure or API error. `message` is deliberately
 * generic -- Stripe's own response body is never forwarded into this error,
 * because every catch site turns this into a client-facing wire code, and a
 * raw provider message is not something to hand back to whoever is hitting
 * our API. The original error is chained via the standard `cause` option so
 * reportError still logs the real reason.
 */
export class StripeGatewayError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "StripeGatewayError";
  }
}

// An unbounded provider call inside a request is a defect this backlog
// already tracks for the Anthropic path (lib/ai/index.ts's ANTHROPIC_OPTIONS
// timeout) -- same reasoning here, so a stalled Stripe response can never
// hang a request indefinitely.
export const STRIPE_TIMEOUT_MS = 10_000;

// Stripe's SDK retries idempotently on its own; 1 keeps a transient network
// blip from failing a checkout without turning a 10s timeout into 30s.
const MAX_NETWORK_RETRIES = 1;

/**
 * The subset of the SDK this module actually calls. Declared structurally so
 * stripe.test.ts can inject a fake without constructing a real client (and
 * without a live key) -- the same injected-transport precedent the deleted
 * Asaas module used for `fetch`, one level up because the SDK, not `fetch`,
 * is the seam now.
 */
export interface StripeLike {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    };
  };
  customers: {
    create(params: Stripe.CustomerCreateParams): Promise<{ id: string }>;
  };
  subscriptions: {
    cancel(id: string): Promise<unknown>;
  };
  invoices: {
    retrieve(
      id: string,
      params: Stripe.InvoiceRetrieveParams,
    ): Promise<Stripe.Invoice>;
  };
  webhooks: {
    constructEvent(
      payload: string | Buffer,
      header: string,
      secret: string,
    ): Stripe.Event;
  };
}

export interface StripeDeps {
  /** Injected for tests -- never a real client outside this default. */
  client?: StripeLike;
}

function clientFor(config: StripeConfig, deps: StripeDeps): StripeLike {
  return (
    deps.client ??
    new Stripe(config.secretKey, {
      timeout: STRIPE_TIMEOUT_MS,
      maxNetworkRetries: MAX_NETWORK_RETRIES,
    })
  );
}

// --- purchase <-> Stripe metadata round trip -------------------------------

// #179/#206: which paid tier a subscribe checkout was for has to survive the
// round trip through the gateway, or the webhook cannot know which plan to
// grant. Under Asaas that rode in a single delimited `externalReference`
// string; Stripe has a real key/value `metadata` map, so the fields stay
// separate rather than being packed into one string and re-split.
//
// Both keys are read back through parsePurchaseMetadata, which re-validates
// them exactly as parseExternalReference did -- metadata arrives inside a
// signature-verified payload, but it is still gateway-echoed input rather
// than something this app computed in that request.
export const METADATA_USER_ID = "moldaiUserId";
export const METADATA_PURCHASE_TYPE = "moldaiPurchaseType";
export const METADATA_PLAN = "moldaiPlan";
export const METADATA_INTERVAL = "moldaiInterval";

export function buildPurchaseMetadata(
  userId: string,
  purchase: Purchase,
): Record<string, string> {
  const base = {
    [METADATA_USER_ID]: userId,
    [METADATA_PURCHASE_TYPE]: purchase.type,
  };
  return purchase.type === "subscribe"
    ? {
        ...base,
        [METADATA_PLAN]: purchase.plan,
        [METADATA_INTERVAL]: purchase.interval,
      }
    : base;
}

export interface ParsedPurchaseMetadata {
  userId: string;
  purchase: Purchase;
}

/**
 * Trust boundary, the validateSpec shape. Never throws; unusable metadata
 * returns null so the caller can log and no-op rather than crediting an
 * unvalidated type/plan. A subscribe whose embedded plan is missing,
 * unknown, or the literal "free" is rejected here by the same isPaidPlanId
 * narrowing the checkout-creation route applies before ever writing the
 * metadata -- so a forged or tampered value still cannot name an arbitrary
 * tier; only a real PaidPlanId member ever reaches applyPurchase.
 */
export function parsePurchaseMetadata(
  metadata: Record<string, string> | null | undefined,
): ParsedPurchaseMetadata | null {
  if (!metadata) return null;
  const userId = metadata[METADATA_USER_ID];
  const type = metadata[METADATA_PURCHASE_TYPE];
  if (!userId || !isPurchaseType(type)) return null;
  if (type === "topup") return { userId, purchase: { type: "topup" } };
  const plan = metadata[METADATA_PLAN];
  if (!isPaidPlanId(plan)) return null;
  const interval = metadata[METADATA_INTERVAL];
  if (!isBillingInterval(interval)) return null;
  return { userId, purchase: { type: "subscribe", plan, interval } };
}

// --- customer + checkout ---------------------------------------------------

export interface CreateCustomerInput {
  name: string;
  email: string;
  /** MoldAI's own userId, so the customer is traceable from the Dashboard. */
  userId: string;
}

/**
 * #206: unlike Asaas's POST /v3/customers -- which marks `cpfCnpj`
 * REQUIRED, a field this app collects nowhere, so that integration was
 * broken even for a Brazilian payer -- Stripe needs no tax id to create a
 * customer. This deletes that defect rather than fixing it.
 */
export async function createCustomer(
  config: StripeConfig,
  input: CreateCustomerInput,
  deps: StripeDeps = {},
): Promise<string> {
  try {
    const customer = await clientFor(config, deps).customers.create({
      name: input.name,
      email: input.email,
      metadata: { [METADATA_USER_ID]: input.userId },
    });
    return customer.id;
  } catch (err) {
    throw new StripeGatewayError("stripe customer creation failed", err);
  }
}

export interface CreateCheckoutInput {
  customerId: string;
  purchase: Purchase;
  userId: string;
  /** Display name for the line item, already resolved from the catalog. */
  itemName: string;
  /** In centavos -- always straight from lib/billing/plans.ts. */
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Prices the line item inline via `price_data` rather than resolving a
 * Dashboard `Price` object by id or lookup_key. #206 left that an open
 * question; inline wins for this codebase because lib/billing/plans.ts is
 * already the single source for every tier's terms (CLAUDE.md's own rule),
 * and both alternatives put a second copy of the price somewhere this repo
 * cannot see -- a Dashboard object that can silently disagree with
 * PLAN_PRICE_CENTS, or a `price_...` id in env that pins the amount outside
 * version control. It also needs no Dashboard setup at all before the flag
 * can be flipped.
 *
 * Adaptive Pricing is requested explicitly (`enabled: true`) instead of
 * relying on the account's Dashboard default, so an internationally-priced
 * checkout doesn't depend on a setting this repo can't assert. It converts
 * the BRL amount for PRESENTATION only -- settlement stays BRL, per
 * CURRENCY's own comment.
 */
export async function createCheckoutSession(
  config: StripeConfig,
  input: CreateCheckoutInput,
  deps: StripeDeps = {},
): Promise<{ id: string; url: string }> {
  const metadata = buildPurchaseMetadata(input.userId, input.purchase);
  const subscribing = input.purchase.type === "subscribe";
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: subscribing ? "subscription" : "payment",
    customer: input.customerId,
    // A human-readable cross-reference in the Dashboard. The machine-read
    // fields are `metadata` -- this is deliberately not the plan carrier.
    client_reference_id: input.userId,
    adaptive_pricing: { enabled: true },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: input.amountCents,
          product_data: { name: input.itemName },
          ...(input.purchase.type === "subscribe"
            ? { recurring: { interval: input.purchase.interval } }
            : {}),
        },
      },
    ],
    metadata,
    // A subscription's own metadata is what an INVOICE carries forward
    // (Invoice.parent.subscription_details.metadata), and renewals arrive
    // as invoices, not sessions -- so the same metadata has to be stamped
    // on both the session and the subscription or a monthly renewal would
    // arrive with no way back to the account that owns it.
    ...(subscribing ? { subscription_data: { metadata } } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
  try {
    const session = await clientFor(config, deps).checkout.sessions.create(
      params,
    );
    if (!session.url) {
      throw new Error("checkout session carried no url");
    }
    return { id: session.id, url: session.url };
  } catch (err) {
    throw new StripeGatewayError("stripe checkout creation failed", err);
  }
}

/**
 * Cancels a Stripe subscription immediately. Used by the webhook route as a
 * best-effort cleanup when a NEW subscription supersedes an OLD one (a real
 * plan/interval upgrade) -- every plan change in this app creates a
 * brand-new Checkout subscription rather than updating an existing one, so
 * without this the old subscription is left live, billing forever. Errors
 * propagate as StripeGatewayError; the caller decides whether to treat that
 * as fatal (it does not -- see the webhook route's own comment).
 */
export async function cancelSubscription(
  config: StripeConfig,
  subscriptionId: string,
  deps: StripeDeps = {},
): Promise<void> {
  try {
    await clientFor(config, deps).subscriptions.cancel(subscriptionId);
  } catch (err) {
    throw new StripeGatewayError("stripe subscription cancel failed", err);
  }
}

// --- webhook ---------------------------------------------------------------

/**
 * Verifies Stripe's HMAC signature over the RAW request body and returns the
 * parsed event. Throws StripeGatewayError on any failure -- an unverified
 * payload is indistinguishable from a forged one, and this is the only
 * authenticity boundary the webhook has (the rate limiter fails open by
 * design, so it is not and must not be treated as a security boundary).
 *
 * `rawBody` must be the exact bytes Stripe sent: re-serializing a parsed
 * object changes key order and whitespace and the signature no longer
 * matches. That is why the webhook route is a deliberate exception to
 * CLAUDE.md's "every route reads its body through parseBody/readJsonObject"
 * rule.
 */
export function verifyWebhookEvent(
  config: StripeConfig,
  rawBody: string,
  signature: string | null,
  deps: StripeDeps = {},
): Stripe.Event {
  if (!signature) {
    throw new StripeGatewayError("missing stripe-signature header");
  }
  try {
    return clientFor(config, deps).webhooks.constructEvent(
      rawBody,
      signature,
      config.webhookSecret,
    );
  } catch (err) {
    throw new StripeGatewayError("stripe webhook signature invalid", err);
  }
}

/**
 * The local, SDK-free shape a route acts on. Deliberately narrow: exactly
 * the four things this app does with money, plus an explicit "ignored" so a
 * reader can see that everything else is a named no-op rather than an
 * accident.
 *
 * `topupPaid` and `refunded` carry a payment-intent id; the two
 * subscription events carry an invoice id, because a subscription payment's
 * own payment intent is not on the invoice payload without an expand (see
 * resolveInvoicePaymentIntent).
 */
export type GatewayEvent =
  | { kind: "topupPaid"; userId: string; paymentIntentId: string }
  | {
      kind: "subscriptionStarted";
      userId: string;
      plan: PaidPlanId;
      interval: BillingInterval;
      invoiceId: string;
      subscriptionId: string;
    }
  | {
      kind: "subscriptionRenewed";
      userId: string | null;
      invoiceId: string;
      subscriptionId: string;
    }
  | {
      kind: "refunded";
      paymentIntentId: string;
      /** False for a PARTIAL refund -- the route must not claw back a whole
       * ledger entry for one. */
      full: boolean;
    }
  | { kind: "ignored"; reason: string };

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

/**
 * Pure: maps a verified Stripe event onto a GatewayEvent. Every field is
 * read defensively (a payload can be expanded or not, and Stripe's own
 * types make several of these `string | Object | null`), and anything it
 * cannot read honestly becomes `ignored` with a reason rather than a
 * guessed credit.
 *
 * The event map, and why each is the one it is:
 *
 *  - `checkout.session.completed`, mode "payment"  -> topupPaid. A one-off
 *    session carries its own payment intent directly.
 *  - `checkout.session.completed`, mode "subscription" -> IGNORED for
 *    money. The subscription's first payment arrives separately as
 *    `invoice.paid` / `subscription_create`, and crediting both would be
 *    two mutations for one purchase. (The route still records the
 *    subscription id from this event -- see its own handler.)
 *  - `invoice.paid`, billing_reason "subscription_create" ->
 *    subscriptionStarted, the real plan change (applyPurchase).
 *  - `invoice.paid`, billing_reason "subscription_cycle" ->
 *    subscriptionRenewed, the monthly cycle (renewWallet, NOT
 *    applyPurchase -- see the route for why that distinction is a money
 *    invariant rather than a style choice).
 *  - `charge.refunded` -> refunded.
 */
export function parseGatewayEvent(event: Stripe.Event): GatewayEvent {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const parsed = parsePurchaseMetadata(session.metadata);
      if (!parsed) {
        return { kind: "ignored", reason: "session metadata unusable" };
      }
      if (parsed.purchase.type === "subscribe") {
        return {
          kind: "ignored",
          reason: "subscription session credited via invoice.paid",
        };
      }
      const paymentIntentId = idOf(session.payment_intent);
      if (!paymentIntentId) {
        return { kind: "ignored", reason: "session carried no payment intent" };
      }
      return { kind: "topupPaid", userId: parsed.userId, paymentIntentId };
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      const details = invoice.parent?.subscription_details ?? null;
      const subscriptionId = idOf(details?.subscription);
      if (!subscriptionId) {
        return { kind: "ignored", reason: "invoice has no subscription" };
      }
      const invoiceId = invoice.id;
      if (!invoiceId) {
        return { kind: "ignored", reason: "invoice carried no id" };
      }
      // Metadata is an immutable snapshot taken at invoice finalization, so
      // it is present on a renewal too -- but only for subscriptions created
      // after this shipped. A renewal falls back to a lookup by
      // subscriptionId (userId: null), which is this app's OWN recorded
      // fact rather than gateway-echoed input; a first payment cannot,
      // because the plan it grants exists nowhere but the metadata.
      const parsed = parsePurchaseMetadata(details?.metadata ?? null);
      if (invoice.billing_reason === "subscription_create") {
        if (!parsed || parsed.purchase.type !== "subscribe") {
          return {
            kind: "ignored",
            reason: "subscription invoice metadata unusable",
          };
        }
        return {
          kind: "subscriptionStarted",
          userId: parsed.userId,
          plan: parsed.purchase.plan,
          interval: parsed.purchase.interval,
          invoiceId,
          subscriptionId,
        };
      }
      if (invoice.billing_reason === "subscription_cycle") {
        return {
          kind: "subscriptionRenewed",
          userId: parsed?.userId ?? null,
          invoiceId,
          subscriptionId,
        };
      }
      return {
        kind: "ignored",
        reason: `invoice.paid billing_reason ${invoice.billing_reason}`,
      };
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId = idOf(charge.payment_intent);
      if (!paymentIntentId) {
        return { kind: "ignored", reason: "charge carried no payment intent" };
      }
      return {
        kind: "refunded",
        paymentIntentId,
        full: charge.amount_refunded >= charge.amount,
      };
    }
    default:
      return { kind: "ignored", reason: event.type };
  }
}

/**
 * Recovers the payment-intent id behind a paid invoice, with one expand.
 *
 * Why this exists at all: a refund arrives as `charge.refunded`, and in this
 * API version a Charge carries NOTHING but `payment_intent` to identify what
 * it paid for -- there is no `charge.invoice`, and a PaymentIntent has no
 * `invoice` either (both verified against the installed declarations). So
 * the payment intent is the ONLY id a refund and its original credit can
 * both name, which makes it the externalId every credit must be keyed on.
 * An invoice does not carry it inline (`Invoice.payments` is optional and
 * needs expanding), hence this retrieve.
 *
 * Returns null rather than throwing when the id cannot be found, so the
 * caller reports an unprocessable event instead of crediting under a
 * guessed key.
 */
export async function resolveInvoicePaymentIntent(
  config: StripeConfig,
  invoiceId: string,
  deps: StripeDeps = {},
): Promise<string | null> {
  let invoice: Stripe.Invoice;
  try {
    invoice = await clientFor(config, deps).invoices.retrieve(invoiceId, {
      expand: ["payments"],
    });
  } catch (err) {
    throw new StripeGatewayError("stripe invoice retrieve failed", err);
  }
  for (const payment of invoice.payments?.data ?? []) {
    const id = idOf(payment.payment?.payment_intent);
    if (id) return id;
  }
  return null;
}
