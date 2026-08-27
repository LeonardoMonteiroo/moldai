import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { parseBody } from "@/lib/api/body";
import { PurchaseBodySchema } from "@/lib/schemas/billing";
import { withWallet, withAsaasCustomerId } from "@/lib/db/wallet";
import { loadPattern, patternNotFound } from "@/lib/db/pattern";
import {
  applyPurchase,
  isPurchaseType,
  type Purchase,
  type PurchaseType,
} from "@/lib/billing/wallet";
import {
  isPaidPlanId,
  isPlanUpgrade,
  PLAN_PRICES,
  TOPUP_PRICE,
} from "@/lib/billing/plans";
import { buildCredits, composeEditorState } from "@/lib/api/compose";
import { apiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";
import { getPaymentProvider } from "@/lib/billing/provider";
import {
  loadAsaasConfig,
  createCustomer,
  createCheckout,
  buildExternalReference,
  AsaasError,
  type AsaasChargeType,
} from "@/lib/billing/asaas";
import { reportError } from "@/lib/observability/report";

// #179: the checkout's *price* now comes straight from lib/billing/plans.ts
// -- PLAN_PRICES[purchase.plan] for a subscribe checkout, TOPUP_PRICE for a
// topup -- rather than a second, route-local copy of the same numbers. A
// prior version of this route kept its own flat CHECKOUT_PRICES.subscribe
// specifically because it only ever created ONE subscribe checkout
// (atelier, hardcoded); now that the checkout is priced per the requested
// PaidPlanId (see resolvePurchase below), duplicating PLAN_PRICES here
// would be exactly the drift CLAUDE.md documents for the deleted
// Wallet.planLabel/FREE_PLAN_CREDITS/FORMAT_KEYS facts. The *credit* a
// payment ultimately grants still always comes from applyPurchase -- never
// from anything a checkout or webhook payload carries.

/**
 * #9/#179: an unusable "subscribe" plan -- absent, unknown, or the literal
 * "free" -- must never reach applyPurchase (mock path) or become a real,
 * plan-priced checkout charge (asaas path). Shared by both provider
 * branches so the same isPaidPlanId trust-boundary check guards both --
 * previously only the mock branch built a validated Purchase at all, and
 * the asaas branch never even read body.plan.
 */
function resolvePurchase(type: PurchaseType, plan: unknown): Purchase | null {
  if (type !== "subscribe") return { type: "topup" };
  return isPaidPlanId(plan) ? { type: "subscribe", plan } : null;
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  // #6: this route had no rate-limit bucket at all -- under the mock
  // provider that meant unlimited free credits in a loop; under asaas it
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
  // (asaas path).
  if (!isPurchaseType(body.type)) {
    return apiError("invalid_purchase_type", 400);
  }
  const type = body.type;
  const patternId = typeof body.patternId === "string" ? body.patternId : null;
  const now = new Date();

  // The pattern is resolved *before* anything money-related happens, on
  // both provider paths. Charging first and then 404ing left the mock's
  // credits added but unreported to the client; the same discipline applies
  // to the asaas path so a checkout's successUrl never targets a pattern
  // this account doesn't own.
  const loaded = patternId ? await loadPattern(patternId, gate.id) : null;
  if (patternId && !loaded) return patternNotFound();

  if (getPaymentProvider() !== "asaas") {
    // #9: an unusable "subscribe" plan -- absent, unknown, or the literal
    // "free" -- must never reach applyPurchase, the same isPurchaseType
    // trust-boundary shape one level up. Built before the wallet is locked,
    // matching that same "validate before any wallet work" discipline.
    const purchase = resolvePurchase(type, body.plan);
    if (!purchase) {
      return apiError("invalid_plan", 400);
    }

    // #6: byte-for-byte the pre-existing mock behaviour -- instant credit,
    // no gateway, no checkout. This stays the default (PAYMENT_PROVIDER
    // unset or anything other than "asaas") until a real deployment opts
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
        !isPlanUpgrade(wallet.plan, purchase.plan)
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

  // --- asaas path: creates a hosted checkout. The wallet is not touched by
  // this request at all -- crediting happens only from a later,
  // authenticated PAYMENT_CONFIRMED webhook (app/api/billing/webhook). ---
  //
  // #179: an unusable plan must never become a real checkout charge either
  // -- checked before any provider call, matching the mock branch's own
  // "validate before any work" discipline.
  const purchase = resolvePurchase(type, body.plan);
  if (!purchase) {
    return apiError("invalid_plan", 400);
  }

  const config = loadAsaasConfig();
  if (!config) {
    reportError(
      "billing-purchase",
      new Error("PAYMENT_PROVIDER=asaas but ASAAS_API_KEY is unset"),
    );
    return apiError("checkout_unavailable", 503);
  }

  try {
    // Atomic get-or-create: the wallet row is locked for the duration of
    // createCustomer, so two concurrent first-purchase requests from this
    // account can't both see "no customer id yet" and each create a
    // separate, orphaned Asaas customer.
    const customerId = await withAsaasCustomerId(gate.id, async () => {
      const customer = await createCustomer(config, {
        name: gate.name ?? gate.email,
        email: gate.email,
        externalReference: gate.id,
      });
      return customer.id;
    });

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const returnUrl = loaded
      ? `${appUrl}/pattern/${patternId}`
      : `${appUrl}/settings?section=usage`;
    // #179: a subscribe checkout's item name now names the actual plan
    // requested ("Estúdio", "Confecção", ...) via the existing
    // PlanSection.plans.*.name catalog entries -- the same lookup
    // PageHeader already resolves a wallet's plan label from -- rather than
    // PaywallModal.subscribeTitle, which is hardcoded to "Ateliê" (that
    // modal only ever pitches the single Ateliê upgrade). A topup checkout
    // is plan-agnostic, so it keeps reading PaywallModal.topupTitle.
    let itemName: string;
    let price: number;
    if (purchase.type === "subscribe") {
      const tPlan = await getTranslations("PlanSection");
      itemName = tPlan(`plans.${purchase.plan}.name`);
      price = PLAN_PRICES[purchase.plan];
    } else {
      const tPaywall = await getTranslations("PaywallModal");
      itemName = tPaywall("topupTitle");
      price = TOPUP_PRICE;
    }
    const chargeType: AsaasChargeType =
      purchase.type === "subscribe" ? "RECURRENT" : "DETACHED";

    const checkout = await createCheckout(config, {
      customerId,
      chargeType,
      items: [{ name: itemName, quantity: 1, value: price }],
      externalReference: buildExternalReference(gate.id, purchase),
      successUrl: returnUrl,
      cancelUrl: returnUrl,
      expiredUrl: returnUrl,
    });

    return NextResponse.json({ status: "redirect", url: checkout.link });
  } catch (err) {
    reportError("billing-purchase", err, { userId: gate.id, type });
    const status = err instanceof AsaasError ? 502 : 500;
    return apiError("checkout_unavailable", status);
  }
}
