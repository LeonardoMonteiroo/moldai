import { describe, it, expect, afterEach } from "vitest";
import { getPaymentProvider } from "./provider";

const ORIGINAL = process.env.PAYMENT_PROVIDER;

describe("getPaymentProvider", () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = ORIGINAL;
  });

  it("defaults to mock when unset", () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(getPaymentProvider()).toBe("mock");
  });

  it("is stripe only for the exact literal value", () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    expect(getPaymentProvider()).toBe("stripe");
  });

  // A misconfigured flag must fail towards mock, never towards real charges.
  it.each(["Stripe", "STRIPE", "stripee", "asaas", "", "true", "1"])(
    "falls back to mock for an unrecognised value: %s",
    (value) => {
      process.env.PAYMENT_PROVIDER = value;
      expect(getPaymentProvider()).toBe("mock");
    },
  );
});
