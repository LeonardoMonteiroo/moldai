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

  it("is asaas only for the exact literal value", () => {
    process.env.PAYMENT_PROVIDER = "asaas";
    expect(getPaymentProvider()).toBe("asaas");
  });

  // A misconfigured flag must fail towards mock, never towards real charges.
  it.each(["Asaas", "ASAAS", "asaass", "", "true", "1"])(
    "falls back to mock for an unrecognised value: %s",
    (value) => {
      process.env.PAYMENT_PROVIDER = value;
      expect(getPaymentProvider()).toBe("mock");
    },
  );
});
