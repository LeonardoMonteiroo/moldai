/**
 * #6: the one flag seam between the pre-existing mock purchase flow and the
 * real Asaas integration. There is no Asaas account and no API key in the
 * environment this was built in, so the real gateway ships disabled by
 * default -- flipping PAYMENT_PROVIDER to "asaas" is the one thing a real
 * deployment does differently.
 *
 * Read at call time (not cached at module load) so a route handler always
 * sees the current process env, and so a test can flip
 * process.env.PAYMENT_PROVIDER between calls without re-importing anything.
 *
 * Anything other than the literal string "asaas" -- unset, empty, a typo --
 * resolves to "mock". That is a deliberate fail-safe: a misconfigured
 * PAYMENT_PROVIDER must never accidentally enable real charges; the
 * opposite direction (an intended "asaas" silently falling back to "mock")
 * is the one that's safe to fail towards.
 */
export type PaymentProvider = "mock" | "asaas";

export function getPaymentProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === "asaas" ? "asaas" : "mock";
}
