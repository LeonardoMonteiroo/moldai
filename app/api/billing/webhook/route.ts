import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { reportError } from "@/lib/observability/report";
import {
  loadStripeConfig,
  verifyWebhookEvent,
  parseGatewayEvent,
  resolveInvoicePaymentIntent,
  type GatewayEvent,
  type StripeConfig,
  type StripeDeps,
} from "@/lib/billing/stripe";
import type { PaidPlanId } from "@/lib/billing/plans";
import type { PlanId } from "@/lib/types";
import {
  applyPurchase,
  renewWallet,
  reverseRefundedEntry,
  type RefundedEntryOutcome,
} from "@/lib/billing/wallet";
import {
  withWalletIdempotent,
  findLedgerEntryByExternalId,
  findWalletUserIdByStripeSubscriptionId,
} from "@/lib/db/wallet";

/**
 * #206: unauthenticated by necessity -- Stripe cannot carry this app's
 * session cookie. Joins POST /api/signup, POST /api/verify-email(+/resend),
 * POST /api/password-reset/(request|confirm), and GET /api/health as the
 * small, deliberately documented set of route handlers with no
 * requireUser() gate (CLAUDE.md's API routes section).
 *
 * DELIBERATE EXCEPTION to CLAUDE.md's "every route that reads a body does it
 * through readJsonObject/parseBody" rule: authenticity here is an HMAC
 * signature over the RAW request bytes, and re-serializing a parsed object
 * changes key order and whitespace, so the signature would never match. The
 * body is therefore read with `request.text()` and handed to
 * verifyWebhookEvent untouched; nothing in this route reads a field off the
 * body before that verification succeeds. consume() (the rate limiter) is
 * NOT and must not be treated as the security boundary -- it fails open when
 * Redis is unreachable, and an unauthenticated webhook that credits wallets
 * is a free-money endpoint.
 *
 * ## Status codes, re-decided for Stripe rather than copied from Asaas
 *
 * The deleted Asaas webhook answered 200 to absolutely everything except a
 * bad token, because Asaas pauses an account's ENTIRE webhook queue after 15
 * consecutive non-2xx responses. Stripe has no such cliff -- it retries a
 * failed delivery with exponential backoff for ~3 days -- so blanket-200 is
 * no longer the safe default; it would silently discard a credit that a
 * retry could have landed. The split:
 *
 *  - **400, never retried:** the signature is missing or invalid. This is
 *    not a Stripe event, so there is nothing to retry and answering 200
 *    would hide a misconfigured secret (or a probe) completely.
 *  - **200, do not retry:** the event is genuine but permanently
 *    unprocessable by this app -- an event type we don't act on, or one
 *    whose ids/metadata cannot be read honestly. Retrying cannot change any
 *    of those, so it is logged and acknowledged.
 *  - **500, please retry:** a transient failure on our side (the database
 *    is down, the invoice retrieve failed). This is the case Asaas's queue
 *    pause made unusable and Stripe's backoff makes correct.
 */
export async function POST(request: Request) {
  const config = loadStripeConfig();
  if (!config) {
    reportError(
      "billing-webhook",
      new Error("stripe webhook received but STRIPE_* secrets are unset"),
    );
    return apiError("checkout_unavailable", 503);
  }

  // Raw bytes, before anything else -- see the header comment.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: GatewayEvent;
  let eventId: string;
  try {
    const verified = verifyWebhookEvent(config, rawBody, signature);
    eventId = verified.id;
    event = parseGatewayEvent(verified);
  } catch (err) {
    // Logged, not echoed: the client learns only that the signature failed.
    reportError("billing-webhook-signature", err);
    return apiError("invalid_webhook_signature", 400);
  }

  if (event.kind === "ignored") {
    // Named no-op rather than silence, so an operator wondering why an
    // event did nothing finds the reason in the log.
    reportError(
      "billing-webhook-ignored",
      new Error(`ignored stripe event: ${event.reason}`),
      { eventId },
    );
    return NextResponse.json({ status: "ok" });
  }

  try {
    await handle(config, event, eventId);
  } catch (err) {
    if (err instanceof Unprocessable) {
      // Genuine event, permanently unactionable -- acknowledged so Stripe
      // stops retrying something no retry can fix.
      reportError("billing-webhook", err, { eventId, kind: event.kind });
      return NextResponse.json({ status: "ok" });
    }
    // Transient: let Stripe retry with backoff.
    reportError("billing-webhook", err, { eventId, kind: event.kind });
    return apiError("webhook_processing_failed", 500);
  }

  return NextResponse.json({ status: "ok" });
}

/**
 * Marks a failure as "do not retry" -- the event is real but this app can
 * never act on it (a missing id, metadata that doesn't name a known
 * account). Anything thrown that is NOT this becomes a 500 so Stripe retries.
 */
class Unprocessable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Unprocessable";
  }
}

/**
 * `ignored` is excluded from the parameter type rather than handled here:
 * POST already answered 200 for it, so the exhaustive `never` below is a
 * compile-time guarantee that every ACTIONABLE event kind has a handler --
 * a new GatewayEvent member becomes a type error instead of a silent no-op
 * on a money path.
 */
async function handle(
  config: StripeConfig,
  event: Exclude<GatewayEvent, { kind: "ignored" }>,
  eventId: string,
  deps: StripeDeps = {},
): Promise<void> {
  switch (event.kind) {
    case "topupPaid":
      // The credited amount always comes from applyPurchase's own fixed
      // figures, never from anything in the webhook payload -- a payment's
      // amount is not trusted as the number of credits to grant.
      await withWalletIdempotent(event.userId, event.paymentIntentId, (w) =>
        applyPurchase(w, { type: "topup" }, new Date()),
      );
      return;
    case "subscriptionStarted":
      await handleSubscriptionStarted(config, event, eventId, deps);
      return;
    case "subscriptionRenewed":
      await handleSubscriptionRenewed(config, event, deps);
      return;
    case "refunded":
      await handleRefunded(event);
      return;
    default: {
      const exhaustive: never = event;
      throw new Unprocessable(
        `unhandled gateway event: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

/**
 * The subscription's FIRST payment: a real plan change, so it routes through
 * applyPurchase like any other subscribe.
 */
async function handleSubscriptionStarted(
  config: StripeConfig,
  event: Extract<GatewayEvent, { kind: "subscriptionStarted" }>,
  eventId: string,
  deps: StripeDeps,
): Promise<void> {
  const paymentIntentId = await paymentIntentFor(config, event.invoiceId, deps);
  const now = new Date();
  // #193/#196: applyPurchase's own subscribe branch is what refuses a
  // downgrade/same-tier reapply (it never touches plan/total/renewsAt in
  // that case, folding the paid credits into `purchased` instead), and it
  // surfaces that outcome on the returned entry itself
  // (LedgerEntry.planChanged), so this closure just reads the decision back
  // rather than recomputing isPlanUpgrade. Captured in a box, not a bare
  // `let`: a `let` reassigned only from inside a closure passed as an
  // argument gets over-narrowed by TypeScript's CFA to `null` at every read
  // outside that closure.
  const superseded: {
    value: { plan: PaidPlanId; previousPlan: PlanId } | null;
  } = { value: null };
  await withWalletIdempotent(
    event.userId,
    paymentIntentId,
    (wallet) => {
      const previousPlan = wallet.plan;
      const entry = applyPurchase(
        wallet,
        { type: "subscribe", plan: event.plan },
        now,
      );
      if (entry.planChanged === false) {
        superseded.value = { plan: event.plan, previousPlan };
      }
      return entry;
    },
    // Committed WITH the credit, never after it -- see withWalletIdempotent's
    // own comment for why a lost subscription id is a double-renewal bug
    // rather than a cosmetic gap.
    event.subscriptionId,
  );
  if (superseded.value) {
    const { plan, previousPlan } = superseded.value;
    // Best-effort, after the transaction committed -- the credit already
    // landed (folded into `purchased`, per applyPurchase's own guard) and
    // must never be rolled back or blocked by this report failing. This is
    // the operator-visible trace the money itself doesn't carry: the
    // ledger row alone can't tell a human this payment arrived out of order
    // and was NOT applied as a plan change.
    reportError(
      "billing-webhook-subscribe-superseded",
      new Error(
        `subscribe payment for plan "${plan}" arrived after wallet was ` +
          `already on "${previousPlan}" (or better) -- credited as ` +
          `purchased credits instead of changing plan`,
      ),
      { userId: event.userId, eventId, plan, previousPlan },
    );
  }
}

/**
 * The monthly cycle. #206: this is renewWallet, NOT
 * applyPurchase({type:"subscribe"}), and the distinction is a money
 * invariant rather than a style choice.
 *
 * The deleted Asaas webhook ran EVERY confirmed payment -- first and
 * recurring alike -- through applyPurchase. For a recurring payment the plan
 * is unchanged, so isPlanUpgrade is false and the #193 monotonicity guard
 * folds the whole plan allowance into `purchased`: the carry-over pool a
 * renewal never resets. Since scripts/cron-renew.ts deliberately excludes
 * subscribed wallets (#161), that webhook was the ONLY renewal path for a
 * subscriber -- so instead of renewing, every month permanently added
 * PLAN_CREDITS[plan] to `purchased`, and `renewWallet`'s own
 * `total + purchased` then compounded it. That is exactly CLAUDE.md's
 * invariant 1 ("a renewal never touches `purchased`") violated by the path
 * meant to implement it. Never exercised in production (Asaas never ran
 * against a real account), and not inherited here.
 *
 * Dueness is deliberately NOT re-checked with isRenewalDue: Stripe's own
 * billing clock is what decided a new cycle was paid for, and the ledger's
 * unique externalId (this invoice's payment intent) is what makes a
 * duplicate delivery a no-op. Gating on our own renewsAt could refuse a
 * legitimately-paid cycle whose local date drifted.
 */
async function handleSubscriptionRenewed(
  config: StripeConfig,
  event: Extract<GatewayEvent, { kind: "subscriptionRenewed" }>,
  deps: StripeDeps,
): Promise<void> {
  // Prefer this app's OWN recorded fact (the subscription id written with
  // the first payment's credit) over the gateway-echoed metadata; the
  // metadata is the fallback for a subscription whose id write predates
  // this column, and vice versa.
  const userId =
    (await findWalletUserIdByStripeSubscriptionId(event.subscriptionId)) ??
    event.userId;
  if (!userId) {
    throw new Unprocessable(
      `renewal invoice for unknown subscription ${event.subscriptionId}`,
    );
  }
  const paymentIntentId = await paymentIntentFor(config, event.invoiceId, deps);
  const now = new Date();
  await withWalletIdempotent(userId, paymentIntentId, (wallet) =>
    renewWallet(wallet, now),
  );
}

async function handleRefunded(
  event: Extract<GatewayEvent, { kind: "refunded" }>,
): Promise<void> {
  if (!event.full) {
    // #206: reverseRefundedEntry reverses a ledger entry's WHOLE
    // contribution, so applying it to a partial refund would claw back more
    // credits than were actually given back. Partial refunds are not
    // modelled (nothing in this app can issue one -- every price is a fixed
    // whole-plan or whole-topup amount), so this is reported for manual
    // reconciliation rather than approximated. Acknowledged, not retried:
    // a retry would arrive just as partial.
    throw new Unprocessable(
      `partial refund for payment intent ${event.paymentIntentId} is not modelled`,
    );
  }
  const original = await findLedgerEntryByExternalId(event.paymentIntentId);
  if (!original) {
    // Nothing was ever credited under this id (e.g. a payment refunded
    // before its own credit ever landed) -- no clawback needed, matching
    // the settled "no clawback" decision for cancellation.
    return;
  }
  // A distinct externalId from the original credit's, so a duplicate
  // delivery is caught by the same unique-constraint idempotency instead of
  // double-debiting.
  //
  // reverseRefundedEntry (lib/billing/wallet.ts) is the one pure dispatch
  // for every shape a refund can name -- "topup"/"folded" (undo exactly the
  // purchased+balance the entry added), "reset" (this entry IS the wallet's
  // current plan source: full revert to free), "superseded" (it moved the
  // plan once, but a later upgrade has overwritten that, so there is
  // nothing left to claw back). The decision is made against the LOCKED
  // wallet inside this same callback.
  const outcome: { value: RefundedEntryOutcome | null } = { value: null };
  await withWalletIdempotent(
    original.userId,
    `${event.paymentIntentId}:refund`,
    (wallet) => {
      const result = reverseRefundedEntry(
        wallet,
        {
          type: original.type,
          amount: original.amount,
          planChanged: original.planChanged,
        },
        event.paymentIntentId,
      );
      outcome.value = result.outcome;
      return result.ledgerEntry;
    },
  );
  if (outcome.value === "superseded") {
    // Best-effort, after the transaction committed -- there is nothing to
    // roll back (the wallet was deliberately left untouched) and this must
    // never block the refund's own idempotent ledger row from landing. The
    // operator-visible trace the zero-amount row alone can't carry: WHY
    // nothing moved.
    reportError(
      "billing-webhook-refund-superseded",
      new Error(
        `refund for payment intent "${event.paymentIntentId}" targeted a ` +
          `subscribe entry that is no longer the wallet's plan source -- a ` +
          `later real upgrade already overwrote its contribution to ` +
          `plan/total, so there is nothing left to claw back; wallet ` +
          `left unchanged`,
      ),
      { userId: original.userId, paymentIntentId: event.paymentIntentId },
    );
  }
}

/**
 * Every credit is keyed on the payment-intent id, because that is the ONLY
 * id a refund and its original credit can both name -- see
 * resolveInvoicePaymentIntent's own comment. An invoice that cannot yield
 * one is unprocessable rather than credited under a guessed key: crediting
 * under an id a refund could never match would make the payment silently
 * irreversible.
 */
async function paymentIntentFor(
  config: StripeConfig,
  invoiceId: string,
  deps: StripeDeps,
): Promise<string> {
  // A StripeGatewayError from the retrieve propagates untouched: a failed
  // API call IS transient, so the route answers 500 and Stripe retries.
  const paymentIntentId = await resolveInvoicePaymentIntent(
    config,
    invoiceId,
    deps,
  );
  if (!paymentIntentId) {
    throw new Unprocessable(
      `invoice ${invoiceId} carried no payment intent to key its credit on`,
    );
  }
  return paymentIntentId;
}
