/**
 * #6/#206: the one flag seam between the pre-existing mock purchase flow
 * and the real Stripe integration.
 *
 * Read at call time (not cached at module load) so a route handler always
 * sees the current process env, and so a test can flip
 * process.env.PAYMENT_PROVIDER between calls without re-importing anything.
 *
 * Anything other than the literal string "stripe" -- unset, empty, a typo,
 * or the now-removed "asaas" -- resolves to "mock". That is a deliberate
 * fail-safe: a misconfigured PAYMENT_PROVIDER must never accidentally
 * enable real charges; the opposite direction (an intended "stripe"
 * silently falling back to "mock") is the one that's safe to fail towards.
 * It also means a deployment still carrying PAYMENT_PROVIDER=asaas from
 * before #206 degrades to the harmless mock rather than half-booting a
 * gateway whose module no longer exists.
 */
export type PaymentProvider = "mock" | "stripe";

export function getPaymentProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === "stripe" ? "stripe" : "mock";
}
