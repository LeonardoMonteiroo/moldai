import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { readJsonObject } from "@/lib/api/body";
import { withWallet, withAsaasCustomerId } from "@/lib/db/wallet";
import { loadPattern, patternNotFound } from "@/lib/db/pattern";
import {
  applyPurchase,
  isPurchaseType,
  type PurchaseType,
} from "@/lib/billing/wallet";
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

// #6: the checkout's *price*, sent to Asaas as inline items. Deliberately
// NOT lib/billing/plans.ts -- issue #6 reserves that module for a later unit
// (#9 plan switching / #15 the public pricing screen) to create. Kept in
// sync with applyPurchase's own hardcoded credit amounts by comment, not by
// import, since wallet.ts stays a pure module with no notion of price. The
// *credit* a payment ultimately grants always comes from applyPurchase --
// never from anything a checkout or webhook payload carries. Only the price
// (a number, not display text) lives here; the item *name* the payer sees
// on the Asaas checkout page is resolved from the existing PaywallModal
// catalog entries below, per the no-hardcoded-display-text convention --
// "Créditos avulsos"/"Ateliê" already exist as PaywallModal.topupTitle/
// subscribeTitle, so this reuses them rather than adding a new key.
const CHECKOUT_PRICES: Record<PurchaseType, number> = {
  topup: 19,
  subscribe: 59,
};

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

  const body = await readJsonObject(request);
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
    // #6: byte-for-byte the pre-existing mock behaviour -- instant credit,
    // no gateway, no checkout. This stays the default (PAYMENT_PROVIDER
    // unset or anything other than "asaas") until a real deployment opts
    // in.
    const wallet = await withWallet(gate.id, (wallet) => {
      const entry = applyPurchase(wallet, type, now);
      return { result: wallet, entries: [entry] };
    });

    if (loaded) {
      return NextResponse.json({
        status: "ok",
        state: composeEditorState(loaded.state, wallet, now, loaded.updatedAt),
      });
    }
    return NextResponse.json({
      status: "ok",
      credits: buildCredits(wallet, now),
    });
  }

  // --- asaas path: creates a hosted checkout. The wallet is not touched by
  // this request at all -- crediting happens only from a later,
  // authenticated PAYMENT_CONFIRMED webhook (app/api/billing/webhook). ---
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
    const tPaywall = await getTranslations("PaywallModal");
    const itemName =
      type === "subscribe"
        ? tPaywall("subscribeTitle")
        : tPaywall("topupTitle");
    const chargeType: AsaasChargeType =
      type === "subscribe" ? "RECURRENT" : "DETACHED";

    const checkout = await createCheckout(config, {
      customerId,
      chargeType,
      items: [{ name: itemName, quantity: 1, value: CHECKOUT_PRICES[type] }],
      externalReference: buildExternalReference(gate.id, type),
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
