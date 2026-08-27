import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { parseBody } from "@/lib/api/body";
import { AsaasWebhookBodySchema } from "@/lib/schemas/billing";
import { apiError } from "@/lib/api/errors";
import { reportError } from "@/lib/observability/report";
import { parseExternalReference } from "@/lib/billing/asaas";
import type { PaidPlanId } from "@/lib/billing/plans";
import type { PlanId } from "@/lib/types";
import {
  applyPurchase,
  debitWallet,
  reverseRefundedSubscription,
  type RefundedSubscriptionOutcome,
} from "@/lib/billing/wallet";
import {
  withWalletIdempotent,
  findLedgerEntryByExternalId,
  setAsaasSubscriptionId,
} from "@/lib/db/wallet";

/**
 * #6: unauthenticated by necessity -- Asaas cannot carry this app's session
 * cookie. Joins POST /api/signup, POST /api/verify-email(+/resend),
 * POST /api/password-reset/(request|confirm), and GET /api/health as the
 * small, deliberately documented set of route handlers with no
 * requireUser() gate (CLAUDE.md's API routes section).
 *
 * Authenticity comes entirely from the `asaas-access-token` header, checked
 * with a timing-safe comparison BEFORE any body parsing -- consume() (the
 * rate limiter) fails open when Redis is unreachable, so it is not, and
 * must not be treated as, the security boundary here. An unauthenticated
 * webhook that credits wallets is a free-money endpoint.
 *
 * Only PAYMENT_CONFIRMED is credited, matching the settled design decision:
 * confirmed means approved but not yet settled (for card, up to 32 days
 * behind PAYMENT_RECEIVED) -- crediting on RECEIVED would make a card buyer
 * wait a month for credits they already paid for. That accepts settlement
 * risk as the normal trade-off; refunds arrive as PAYMENT_REFUNDED and
 * reverse it.
 *
 * Every other event -- including ones this app doesn't act on, AND a body
 * that fails to parse -- answers 200. Asaas pauses an account's ENTIRE
 * webhook queue after 15 consecutive non-2xx responses, so nothing short of
 * the auth check above may ever produce a non-2xx here (the shared
 * parseBody 400 that every other route in this app returns as-is would
 * violate exactly that invariant, so this route deliberately does not
 * propagate it).
 */
export async function POST(request: Request) {
  const provided = request.headers.get("asaas-access-token");
  if (!isValidWebhookToken(provided)) {
    return apiError("invalid_webhook_token", 401);
  }

  const parsed = await parseBody(request, AsaasWebhookBodySchema);
  if (parsed instanceof NextResponse) {
    // See the header comment: a malformed/oversized body still counts
    // towards Asaas's 15-failure queue pause if this answers non-2xx, so it
    // is logged and swallowed rather than returned as the shared 400.
    reportError(
      "billing-webhook",
      new Error(`unparseable webhook body (status ${parsed.status})`),
    );
    return NextResponse.json({ status: "ok" });
  }
  const body = parsed;

  const event = typeof body.event === "string" ? body.event : "";
  const payment =
    typeof body.payment === "object" &&
    body.payment !== null &&
    !Array.isArray(body.payment)
      ? (body.payment as Record<string, unknown>)
      : null;
  const paymentId =
    payment && typeof payment.id === "string" ? payment.id : null;
  const externalReference =
    payment && typeof payment.externalReference === "string"
      ? payment.externalReference
      : null;
  const subscriptionId =
    payment && typeof payment.subscription === "string"
      ? payment.subscription
      : null;

  try {
    switch (event) {
      case "PAYMENT_CONFIRMED":
        await handleConfirmed(paymentId, externalReference, subscriptionId);
        break;
      case "PAYMENT_REFUNDED":
        await handleRefunded(paymentId);
        break;
      case "CHECKOUT_EXPIRED":
      case "CHECKOUT_CANCELED":
        // The wallet is never touched until PAYMENT_CONFIRMED, so there is
        // nothing to undo here -- these exist as named cases (rather than
        // falling into `default`) purely so a future reader doesn't have to
        // rediscover that this is intentional.
        break;
      default:
        break;
    }
  } catch (err) {
    // Never let a processing failure escape as a non-2xx -- see the header
    // comment above about Asaas's 15-failure queue pause. Logged for a human
    // to reconcile from the ledger / Asaas dashboard.
    reportError("billing-webhook", err, { event, paymentId });
  }

  return NextResponse.json({ status: "ok" });
}

function isValidWebhookToken(provided: string | null): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || !provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  // timingSafeEqual throws on a length mismatch rather than returning false
  // -- length is checked first (a `===` on lengths only, not on the secret's
  // content, so this does not reopen the timing side-channel the
  // timing-safe comparison exists to close).
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

async function handleConfirmed(
  paymentId: string | null,
  externalReference: string | null,
  subscriptionId: string | null,
): Promise<void> {
  if (!paymentId) {
    throw new Error("PAYMENT_CONFIRMED webhook missing payment.id");
  }
  const parsed = parseExternalReference(externalReference);
  if (!parsed) {
    throw new Error(
      "PAYMENT_CONFIRMED webhook missing or unparseable externalReference",
    );
  }
  const now = new Date();
  // The credited amount always comes from applyPurchase's own fixed
  // figures, never from anything in the webhook payload -- a payment's
  // `value` is not trusted as the number of credits to grant.
  //
  // #179: `parsed.purchase` is the SAME Purchase the checkout-creation
  // route built and validated (isPaidPlanId'd) before ever calling
  // buildExternalReference -- parseExternalReference re-validates it again
  // here (a subscribe reference's embedded plan must still be a real
  // PaidPlanId, or parseExternalReference itself returned null above), so
  // this handler applies whichever paid tier the checkout was actually
  // created for, never a hardcoded "atelier" and never an arbitrary string
  // a forged/tampered externalReference might otherwise have carried.
  // #193: applyPurchase's own subscribe branch is what actually refuses a
  // downgrade/same-tier reapply (it never touches plan/total/renewsAt in
  // that case, folding the paid credits into `purchased` instead). #196:
  // applyPurchase now surfaces exactly that outcome on the returned entry
  // itself (LedgerEntry.planChanged), so this closure just reads it back
  // rather than recomputing isPlanUpgrade a second time -- one function
  // decides what counts as an upgrade, this route only observes the
  // decision. Captured purely from data already in hand, so it can be
  // reported for operator visibility once the transaction has actually
  // committed. No I/O runs inside the callback itself: withWalletIdempotent's
  // contract requires `fn` to stay synchronous and side-effect-free, since
  // it can re-run against a freshly locked row on a transaction retry.
  // A box, not a bare `let`, because a `let` reassigned only from inside a
  // closure passed as an argument gets over-narrowed by TypeScript's CFA
  // to `null` at every read outside that closure -- a property access
  // doesn't carry that same (incorrect) narrowing.
  const superseded: {
    value: { plan: PaidPlanId; previousPlan: PlanId } | null;
  } = { value: null };
  await withWalletIdempotent(parsed.userId, paymentId, (wallet) => {
    const previousPlan = wallet.plan;
    const entry = applyPurchase(wallet, parsed.purchase, now);
    if (parsed.purchase.type === "subscribe" && entry.planChanged === false) {
      superseded.value = { plan: parsed.purchase.plan, previousPlan };
    }
    return entry;
  });
  if (superseded.value) {
    const { plan, previousPlan } = superseded.value;
    // Best-effort, after the transaction committed -- the credit already
    // landed (folded into `purchased`, per applyPurchase's own guard) and
    // must never be rolled back or blocked by this report failing. This is
    // the operator-visible trace the money itself doesn't carry: the
    // wallet's ledger row alone can't tell a human this payment arrived
    // out of order and was NOT applied as a plan change.
    reportError(
      "billing-webhook-subscribe-superseded",
      new Error(
        `subscribe payment for plan "${plan}" arrived after wallet was ` +
          `already on "${previousPlan}" (or better) -- credited as ` +
          `purchased credits instead of changing plan`,
      ),
      { userId: parsed.userId, paymentId, plan, previousPlan },
    );
  }

  if (subscriptionId) {
    try {
      await setAsaasSubscriptionId(parsed.userId, subscriptionId);
    } catch (err) {
      // Best-effort: the credit above already committed. Losing this field
      // only means a later cron-renewal split (issue #6 step 7) can't yet
      // recognise this wallet as subscribed -- it must never roll back or
      // block the credit that already landed.
      reportError("billing-webhook-subscription-id", err, {
        userId: parsed.userId,
        paymentId,
      });
    }
  }
}

async function handleRefunded(paymentId: string | null): Promise<void> {
  if (!paymentId) {
    throw new Error("PAYMENT_REFUNDED webhook missing payment.id");
  }
  const original = await findLedgerEntryByExternalId(paymentId);
  if (!original) {
    // Nothing was ever credited under this externalId (e.g. a payment that
    // was refunded before ever reaching PAYMENT_CONFIRMED) -- no clawback
    // needed, matching the settled "no clawback" decision for cancellation.
    return;
  }
  // A distinct externalId from the original credit's, so a duplicate
  // PAYMENT_REFUNDED delivery is caught by the same unique-constraint
  // idempotency instead of double-debiting.
  //
  // A refunded *subscribe* purchase might also have to revert plan/total --
  // but #196: only when THIS entry is actually what currently backs the
  // wallet's plan. reverseRefundedSubscription (lib/billing/wallet.ts) is
  // the pure decision, made against the locked wallet inside this same
  // callback: "reset" (this entry IS wallet.planSourceExternalId -- full
  // plan/total revert, the pre-#196 behaviour), "folded" (this entry never
  // changed the plan -- undo exactly the purchased/balance it added), or
  // "superseded" (this entry changed the plan when it ran, but a LATER real
  // upgrade has since overwritten that -- nothing survives to claw back,
  // wallet left untouched). A refunded *topup* never touched plan/total to
  // begin with, so it stays a plain debit, unchanged from before.
  const outcome: { value: RefundedSubscriptionOutcome | null } = {
    value: null,
  };
  await withWalletIdempotent(
    original.userId,
    `${paymentId}:refund`,
    (wallet) => {
      if (original.type !== "subscribe") {
        return debitWallet(wallet, original.amount, "asaas_refund");
      }
      const result = reverseRefundedSubscription(
        wallet,
        { amount: original.amount, planChanged: original.planChanged },
        paymentId,
      );
      outcome.value = result.outcome;
      return result.ledgerEntry;
    },
  );
  if (outcome.value === "superseded") {
    // Best-effort, after the transaction committed -- there is nothing to
    // roll back (the wallet was deliberately left untouched) and this must
    // never block the refund's own idempotent ledger row from landing. The
    // operator-visible trace the ledger's zero-amount row alone can't
    // carry: WHY nothing moved.
    reportError(
      "billing-webhook-refund-superseded",
      new Error(
        `refund for payment "${paymentId}" targeted a subscribe entry ` +
          `that is no longer the wallet's plan source -- a later real ` +
          `upgrade already overwrote its contribution to plan/total, so ` +
          `there is nothing left to claw back; wallet left unchanged`,
      ),
      { userId: original.userId, paymentId },
    );
  }
}
