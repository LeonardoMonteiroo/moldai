import { isPurchaseType, type Purchase } from "./wallet";
import { isPaidPlanId } from "./plans";

/**
 * #6: the one file that talks to Asaas's REST API -- mirrors lib/ai/index.ts
 * being the one file importing the Anthropic SDK. Reached only from the
 * "asaas" branch of app/api/billing/purchase/route.ts and from
 * app/api/billing/webhook/route.ts, both gated by
 * lib/billing/provider.ts's PAYMENT_PROVIDER flag (default "mock" -- this
 * module is never called at all in the default configuration).
 *
 * UNVERIFIED AGAINST THE REAL ASAAS API. There is no Asaas account and no API
 * key in the environment this shipped from. Built against docs.asaas.com as
 * read 2026-08-22 (issue #6's own "Asaas API facts" section) and exercised
 * only against a faked HTTP client in asaas.test.ts -- see the PR body for
 * what a human still has to verify against a real sandbox account.
 */

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = "https://api-sandbox.asaas.com/v3";

/** Null when ASAAS_API_KEY isn't set -- callers treat that as "unavailable". */
export function loadAsaasConfig(): AsaasConfig | null {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return null;
  return { apiKey, baseUrl: process.env.ASAAS_BASE_URL || DEFAULT_BASE_URL };
}

/**
 * Thrown for any transport failure or non-2xx response. `message` is
 * deliberately generic (status code only) -- the provider's own response
 * body is never forwarded into this error, because every catch site turns
 * this into a client-facing wire code, and a raw Asaas error message is not
 * something to hand back to whoever is hitting our API.
 */
export class AsaasError extends Error {
  status?: number;
  constructor(message: string, status?: number, cause?: unknown) {
    // Chains the ORIGINAL transport error (DNS failure, TLS error, abort)
    // via the standard Error `cause` option -- reportError logs this
    // wrapped error, and a lost cause would mean losing the real reason a
    // request failed the moment this module is actually exercised against
    // a live Asaas sandbox. `cause` is never anything Asaas sent back
    // (this.status only carries the HTTP status, never a response body),
    // so this doesn't reopen the "never leak the provider's own message"
    // rule above.
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "AsaasError";
    this.status = status;
  }
}

// #6: an unbounded provider call inside a request is a defect this backlog
// already tracks for the Anthropic path (lib/ai/index.ts's ANTHROPIC_OPTIONS
// timeout) -- same reasoning here, so a stalled Asaas response can never hang
// a request indefinitely.
export const ASAAS_TIMEOUT_MS = 10_000;

export interface AsaasFetchDeps {
  /** Injected for tests -- never a real network call outside this default. */
  fetchImpl?: typeof fetch;
}

async function asaasFetch<T>(
  config: AsaasConfig,
  path: string,
  init: RequestInit,
  deps: AsaasFetchDeps,
): Promise<T> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        // Asaas's own auth scheme -- NOT `Authorization: Bearer`.
        access_token: config.apiKey,
        ...init.headers,
      },
      signal: AbortSignal.timeout(ASAAS_TIMEOUT_MS),
    });
  } catch (err) {
    throw new AsaasError(
      err instanceof Error
        ? `asaas request to ${path} failed: ${err.message}`
        : `asaas request to ${path} failed`,
      undefined,
      err,
    );
  }
  if (!res.ok) {
    // Deliberately does not read/forward res.text() -- that's the
    // provider's own error message, which must never reach our client.
    throw new AsaasError(
      `asaas responded ${res.status} for ${path}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export interface CreateCustomerInput {
  name: string;
  email: string;
  /** MoldAI's own userId, so the customer can be traced back on Asaas's side. */
  externalReference: string;
}

export interface AsaasCustomer {
  id: string;
}

export async function createCustomer(
  config: AsaasConfig,
  input: CreateCustomerInput,
  deps: AsaasFetchDeps = {},
): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>(
    config,
    "/customers",
    { method: "POST", body: JSON.stringify(input) },
    deps,
  );
}

export type AsaasChargeType = "DETACHED" | "RECURRENT";

export interface CheckoutItem {
  name: string;
  quantity: number;
  value: number;
}

export interface CreateCheckoutInput {
  customerId: string;
  chargeType: AsaasChargeType;
  items: CheckoutItem[];
  /** Round-trips through every webhook event for this payment -- see
   * buildExternalReference/parseExternalReference below. Max 200 chars per
   * Asaas's own limit; well within it for our {userId}:{type}[:{plan}]
   * shape. */
  externalReference: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
}

export interface AsaasCheckout {
  id: string;
  link: string;
}

export async function createCheckout(
  config: AsaasConfig,
  input: CreateCheckoutInput,
  deps: AsaasFetchDeps = {},
): Promise<AsaasCheckout> {
  const body: Record<string, unknown> = {
    customer: input.customerId,
    billingTypes: ["PIX", "CREDIT_CARD"],
    chargeTypes: [input.chargeType],
    items: input.items,
    externalReference: input.externalReference,
    callback: {
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiredUrl: input.expiredUrl,
    },
    minutesToExpire: 60,
  };
  // A RECURRENT checkout additionally requires a `subscription` object per
  // the issue's own verified API facts; MONTHLY is the only cycle this app
  // currently sells (Ateliê renews every 30 days, matching renewWallet).
  if (input.chargeType === "RECURRENT") {
    body.subscription = { cycle: "MONTHLY" };
  }
  return asaasFetch<AsaasCheckout>(
    config,
    "/checkouts",
    { method: "POST", body: JSON.stringify(body) },
    deps,
  );
}

export interface AsaasPayment {
  id: string;
  status: string;
}

/**
 * Not called by the webhook route today -- the webhook trusts its own
 * authenticated payload for *which* payment/event fired, and credits a
 * fixed amount from applyPurchase rather than any `value` in the payload,
 * so there is no amount to double check here. Exported (and tested) as a
 * complete client, for a future caller that needs to poll payment status
 * directly (e.g. a "verify a stuck checkout" admin action).
 */
export async function getPayment(
  config: AsaasConfig,
  paymentId: string,
  deps: AsaasFetchDeps = {},
): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(
    config,
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
    deps,
  );
}

// externalReference is the one field Asaas echoes back unchanged on every
// webhook event for a payment/checkout -- encoding {userId, purchase} into
// it is what lets the webhook recover which wallet/purchase a payment was
// for without a second lookup table. Kept in this module because it's
// purely the wire shape Asaas itself defines; lib/db/wallet.ts and the
// webhook route only ever see the parsed, already-validated result.
//
// #179: a subscribe checkout also has to round-trip WHICH paid tier it was
// for -- the checkout route only ever sold one flat "atelier" price before
// this, so the webhook could safely hardcode plan:"atelier" too. Now that
// the checkout is priced per PaidPlanId, the plan travels alongside the
// type: {userId}:subscribe:{plan}, or {userId}:topup with no third segment.
// Building/parsing take a whole `Purchase` (lib/billing/wallet.ts) rather
// than a bare `type`+`plan` pair, so the shape can never drift from
// applyPurchase's own exhaustive union -- a new Purchase variant is a
// compile error here exactly like it already is there.
const REF_SEP = ":";

export function buildExternalReference(
  userId: string,
  purchase: Purchase,
): string {
  return purchase.type === "subscribe"
    ? `${userId}${REF_SEP}${purchase.type}${REF_SEP}${purchase.plan}`
    : `${userId}${REF_SEP}${purchase.type}`;
}

export interface ParsedExternalReference {
  userId: string;
  purchase: Purchase;
}

/**
 * Trust boundary: externalReference arrives inside an already
 * signature-verified webhook payload, but it is still gateway-echoed input,
 * not something this app computed itself in that request -- re-validated
 * the same way validateSpec/isPurchaseType re-validate anything else off
 * the wire. Never throws; an unparseable/invalid reference returns null so
 * the caller can log and no-op rather than crediting an unvalidated
 * type/plan. #179: a subscribe reference with a missing, unknown, or
 * "free" embedded plan is rejected here too -- the same isPaidPlanId
 * narrowing the checkout-creation route itself applies before ever
 * building the reference, so a forged/tampered externalReference still
 * cannot name an arbitrary tier; only a real PaidPlanId member ever
 * reaches applyPurchase.
 */
export function parseExternalReference(
  ref: string | null | undefined,
): ParsedExternalReference | null {
  if (!ref) return null;
  const parts = ref.split(REF_SEP);
  const [userId, type, plan] = parts;
  if (!userId || !isPurchaseType(type)) return null;
  if (type === "topup") {
    if (parts.length !== 2) return null;
    return { userId, purchase: { type: "topup" } };
  }
  // subscribe: exactly 3 segments, and the embedded plan must be a real
  // paid tier -- never an arbitrary string reaching applyPurchase.
  if (parts.length !== 3 || !isPaidPlanId(plan)) return null;
  return { userId, purchase: { type: "subscribe", plan } };
}
