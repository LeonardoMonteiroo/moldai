import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { parseBody } from "@/lib/api/body";
import { PurchaseBodySchema } from "@/lib/schemas/billing";
import { withWallet, withStripeCustomerId } from "@/lib/db/wallet";
import { loadPattern, patternNotFound } from "@/lib/db/pattern";
import {
  applyPurchase,
  isPurchaseType,
  type Purchase,
  type PurchaseType,
} from "@/lib/billing/wallet";
import {
  isPaidPlanId,
  isPlanOrIntervalUpgrade,
  isBillingInterval,
  PLAN_PRICE_CENTS,
  TOPUP_PRICE_CENTS,
  annualPriceCents,
} from "@/lib/billing/plans";
import { buildCredits, composeEditorState } from "@/lib/api/compose";
import { apiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";
import { getPaymentProvider } from "@/lib/billing/provider";
import {
  loadStripeConfig,
  createCustomer,
  createCheckoutSession,
  StripeGatewayError,
} from "@/lib/billing/stripe";
import { reportError } from "@/lib/observability/report";

// #179/#206: the checkout's *price* comes straight from
// lib/billing/plans.ts -- PLAN_PRICE_CENTS[purchase.plan] for a subscribe
// checkout, TOPUP_PRICE_CENTS for a topup -- rather than a second,
// route-local copy of the same numbers, and never from a Price object
// configured in the Stripe Dashboard (see createCheckoutSession's own
// comment for why inline price_data wins here). Duplicating the amounts
// anywhere would be exactly the drift CLAUDE.md documents for the deleted
// Wallet.planLabel/FREE_PLAN_CREDITS/FORMAT_KEYS facts. The *credit* a
// payment ultimately grants still always comes from applyPurchase -- never
// from anything a checkout or webhook payload carries.

type ResolvedPurchase =
  | { ok: true; purchase: Purchase }
  | { ok: false; error: "invalid_plan" | "invalid_interval" };

/**
 * #9/#179: an unusable "subscribe" plan or interval -- absent, unknown, or
 * (for plan) the literal "free" -- must never reach applyPurchase (mock
 * path) or become a real, plan-priced checkout charge (stripe path). Shared
 * by both provider branches so the same trust-boundary check guards both --
 * previously only the mock branch built a validated Purchase at all, and
 * the gateway branch never even read body.plan.
 */
function resolvePurchase(
  type: PurchaseType,
  plan: unknown,
  interval: unknown,
): ResolvedPurchase {
  if (type !== "subscribe") return { ok: true, purchase: { type: "topup" } };
  if (!isPaidPlanId(plan)) return { ok: false, error: "invalid_plan" };
  if (!isBillingInterval(interval)) {
    return { ok: false, error: "invalid_interval" };
  }
  return { ok: true, purchase: { type: "subscribe", plan, interval } };
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  // #6: this route had no rate-limit bucket at all -- under the mock
  // provider that meant unlimited free credits in a loop; under stripe it
  // means creating hosted checkouts against a real third party per request.
  // The two buckets are independent Redis round trips, run concurrently.
  const [byIp, byUser] = await Promise.all([
    consume("purchase", clientIp(request.headers)),
    consume("purchase_user", gate.id),
  ]);
  if (!byIp.allowed) {
    return apiError("rate_limited", 429, {
      "Retry-After": String(byIp.retryAfterSec),
    });
  }
  if (!byUser.allowed) {
    return apiError("rate_limited", 429, {
      "Retry-After": String(byUser.retryAfterSec),
    });
  }

  const body = await parseBody(request, PurchaseBodySchema);
  if (body instanceof NextResponse) return body;
  // Validate before any wallet or provider work: an unrecognised type must
  // not reach applyPurchase (mock path) or become a real checkout charge
  // (stripe path).
  if (!isPurchaseType(body.type)) {
    return apiError("invalid_purchase_type", 400);
  }
  const type = body.type;
  const patternId = typeof body.patternId === "string" ? body.patternId : null;
  const now = new Date();

  // The pattern is resolved *before* anything money-related happens, on
  // both provider paths. Charging first and then 404ing left the mock's
  // credits added but unreported to the client; the same discipline applies
  // to the stripe path so a checkout's successUrl never targets a pattern
  // this account doesn't own.
  const loaded = patternId ? await loadPattern(patternId, gate.id) : null;
  if (patternId && !loaded) return patternNotFound();

  if (getPaymentProvider() !== "stripe") {
    // #9: an unusable "subscribe" plan -- absent, unknown, or the literal
    // "free" -- must never reach applyPurchase, the same isPurchaseType
    // trust-boundary shape one level up. Built before the wallet is locked,
    // matching that same "validate before any wallet work" discipline.
    const resolved = resolvePurchase(type, body.plan, body.interval);
    if (!resolved.ok) {
      return apiError(resolved.error, 400);
    }
    const purchase = resolved.purchase;

    // #6: byte-for-byte the pre-existing mock behaviour -- instant credit,
    // no gateway, no checkout. This stays the default (PAYMENT_PROVIDER
    // unset or anything other than "stripe") until a real deployment opts
    // in.
    //
    // #9: response construction moves inside the callback (the graduate
    // route's own shape, app/api/patterns/[id]/graduate/route.ts) so the
    // upgrade-only check reads the current plan off the row *under its
    // lock* rather than a value read before it -- a race between two
    // subscribe requests must not let a downgrade or same-plan request
    // through just because it looked like an upgrade a moment earlier.
    // saveWallet still runs (writing unchanged values) on the refusal path,
    // exactly like the graduate route's own refusals.
    return await withWallet(gate.id, (wallet) => {
      if (
        purchase.type === "subscribe" &&
        !isPlanOrIntervalUpgrade(
          { plan: wallet.plan, interval: wallet.planInterval },
          { plan: purchase.plan, interval: purchase.interval },
        )
      ) {
        return { result: apiError("plan_not_upgradable", 400), entries: [] };
      }
      const entry = applyPurchase(wallet, purchase, now);
      const result = loaded
        ? NextResponse.json({
            status: "ok",
            state: composeEditorState(
              loaded.state,
              wallet,
              now,
              loaded.updatedAt,
            ),
          })
        : NextResponse.json({
            status: "ok",
            credits: buildCredits(wallet, now),
          });
      return { result, entries: [entry] };
    });
  }

  // --- stripe path: creates a hosted Checkout Session. The wallet is not
  // touched by this request at all -- crediting happens only from a later,
  // signature-verified webhook (app/api/billing/webhook). ---
  //
  // #179: an unusable plan must never become a real checkout charge either
  // -- checked before any provider call, matching the mock branch's own
  // "validate before any work" discipline.
  const resolved = resolvePurchase(type, body.plan, body.interval);
  if (!resolved.ok) {
    return apiError(resolved.error, 400);
  }
  const purchase = resolved.purchase;

  const config = loadStripeConfig();
  if (!config) {
    reportError(
      "billing-purchase",
      new Error(
        "PAYMENT_PROVIDER=stripe but STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET is unset",
      ),
    );
    return apiError("checkout_unavailable", 503);
  }

  try {
    // #206: both wallet-lock concerns in one transaction (see
    // withStripeCustomerId):
    //
    //  - the upgrade-only rule, decided against the LOCKED wallet. The
    //    deleted Asaas branch checked isPaidPlanId and nothing else, so a
    //    downgrade request created a REAL charge that applyPurchase's
    //    monotonicity guard then folded into `purchased` -- money taken for
    //    a plan change that never happened. CLAUDE.md always claimed
    //    downgrades were "refused server-side, decided inside the wallet
    //    lock"; that is now true of the gateway path too, not just the mock.
    //  - atomic get-or-create of the Stripe customer, so two concurrent
    //    first-purchase requests can't each create an orphaned customer.
    const prep = await withStripeCustomerId(
      gate.id,
      () =>
        createCustomer(config, {
          name: gate.name ?? gate.email,
          email: gate.email,
          userId: gate.id,
        }),
      (wallet) =>
        purchase.type === "subscribe" &&
        !isPlanOrIntervalUpgrade(
          { plan: wallet.plan, interval: wallet.planInterval },
          { plan: purchase.plan, interval: purchase.interval },
        )
          ? "plan_not_upgradable"
          : null,
    );
    if (!prep.ok) {
      return apiError(prep.error, 400);
    }

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const returnUrl = loaded
      ? `${appUrl}/pattern/${patternId}`
      : `${appUrl}/settings?section=usage`;
    // #179: a subscribe checkout's item name names the actual plan
    // requested ("Estúdio", "Confecção", ...) via the existing
    // PlanSection.plans.*.name catalog entries -- the same lookup
    // PageHeader already resolves a wallet's plan label from -- rather than
    // PaywallModal.subscribeTitle, which is hardcoded to "Ateliê" (that
    // modal only ever pitches the single Ateliê upgrade). A topup checkout
    // is plan-agnostic, so it keeps reading PaywallModal.topupTitle.
    let itemName: string;
    let amountCents: number;
    if (purchase.type === "subscribe") {
      const tPlan = await getTranslations("PlanSection");
      itemName = tPlan(`plans.${purchase.plan}.name`);
      amountCents =
        purchase.interval === "year"
          ? annualPriceCents(purchase.plan)
          : PLAN_PRICE_CENTS[purchase.plan];
    } else {
      const tPaywall = await getTranslations("PaywallModal");
      itemName = tPaywall("topupTitle");
      amountCents = TOPUP_PRICE_CENTS;
    }

    const session = await createCheckoutSession(config, {
      customerId: prep.customerId,
      purchase,
      userId: gate.id,
      itemName,
      amountCents,
      successUrl: returnUrl,
      cancelUrl: returnUrl,
    });

    return NextResponse.json({ status: "redirect", url: session.url });
  } catch (err) {
    reportError("billing-purchase", err, { userId: gate.id, type });
    const status = err instanceof StripeGatewayError ? 502 : 500;
    return apiError("checkout_unavailable", status);
  }
}
