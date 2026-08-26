import { describe, it, expect, vi } from "vitest";
import {
  createCustomer,
  createCheckout,
  getPayment,
  AsaasError,
  buildExternalReference,
  parseExternalReference,
  type AsaasConfig,
} from "./asaas";

const config: AsaasConfig = {
  apiKey: "test-key",
  baseUrl: "https://api-sandbox.asaas.com/v3",
};

function fakeFetch(
  impl: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn(impl) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("asaas client authentication", () => {
  it("createCustomer sends access_token, not Authorization: Bearer", async () => {
    let seenHeaders: Headers | undefined;
    const fetchImpl = fakeFetch((url, init) => {
      seenHeaders = new Headers(init?.headers);
      return jsonResponse(200, { id: "cus_1" });
    });
    await createCustomer(
      config,
      { name: "Ana", email: "ana@example.com", externalReference: "u1" },
      { fetchImpl },
    );
    expect(seenHeaders?.get("access_token")).toBe("test-key");
    expect(seenHeaders?.get("authorization")).toBeNull();
  });

  it("createCheckout sends access_token, not Authorization: Bearer", async () => {
    let seenHeaders: Headers | undefined;
    const fetchImpl = fakeFetch((url, init) => {
      seenHeaders = new Headers(init?.headers);
      return jsonResponse(200, { id: "chk_1", link: "https://pay/chk_1" });
    });
    await createCheckout(
      config,
      {
        customerId: "cus_1",
        chargeType: "DETACHED",
        items: [{ name: "Créditos", quantity: 1, value: 19 }],
        externalReference: "u1:topup",
        successUrl: "https://app/success",
        cancelUrl: "https://app/cancel",
        expiredUrl: "https://app/expired",
      },
      { fetchImpl },
    );
    expect(seenHeaders?.get("access_token")).toBe("test-key");
    expect(seenHeaders?.get("authorization")).toBeNull();
  });
});

describe("asaas client error handling", () => {
  it("a non-2xx response surfaces as AsaasError and never leaks the provider's own message", async () => {
    const secretProviderMessage = "invalid api key xyz-secret-123";
    const fetchImpl = fakeFetch(() =>
      jsonResponse(401, { errors: [{ description: secretProviderMessage }] }),
    );
    await expect(
      createCheckout(
        config,
        {
          customerId: "cus_1",
          chargeType: "DETACHED",
          items: [{ name: "Créditos", quantity: 1, value: 19 }],
          externalReference: "u1:topup",
          successUrl: "https://app/success",
          cancelUrl: "https://app/cancel",
          expiredUrl: "https://app/expired",
        },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ status: 401 });

    try {
      await createCheckout(
        config,
        {
          customerId: "cus_1",
          chargeType: "DETACHED",
          items: [{ name: "Créditos", quantity: 1, value: 19 }],
          externalReference: "u1:topup",
          successUrl: "https://app/success",
          cancelUrl: "https://app/cancel",
          expiredUrl: "https://app/expired",
        },
        { fetchImpl },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AsaasError);
      expect((err as Error).message).not.toContain(secretProviderMessage);
    }
  });

  it("a transport failure (network error) surfaces as AsaasError too", async () => {
    const fetchImpl = fakeFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      getPayment(config, "pay_1", { fetchImpl }),
    ).rejects.toBeInstanceOf(AsaasError);
  });

  it("attaches a request timeout signal so a stalled response cannot hang forever", async () => {
    let sawSignal: AbortSignal | null | undefined;
    const fetchImpl = fakeFetch((url, init) => {
      sawSignal = init?.signal;
      return jsonResponse(200, { id: "pay_1", status: "CONFIRMED" });
    });
    await getPayment(config, "pay_1", { fetchImpl });
    expect(sawSignal).toBeInstanceOf(AbortSignal);
  });
});

describe("external reference round trip", () => {
  it("round-trips userId and purchase type", () => {
    const ref = buildExternalReference("u1", "topup");
    expect(parseExternalReference(ref)).toEqual({
      userId: "u1",
      type: "topup",
    });
  });

  it("round-trips subscribe", () => {
    const ref = buildExternalReference("u2", "subscribe");
    expect(parseExternalReference(ref)).toEqual({
      userId: "u2",
      type: "subscribe",
    });
  });

  it("rejects an unrecognised embedded type -- trust boundary, not an assertion", () => {
    expect(parseExternalReference("u1:banana")).toBeNull();
  });

  it("rejects a malformed reference with no separator", () => {
    expect(parseExternalReference("not-a-reference")).toBeNull();
  });

  it("rejects null/undefined/empty", () => {
    expect(parseExternalReference(null)).toBeNull();
    expect(parseExternalReference(undefined)).toBeNull();
    expect(parseExternalReference("")).toBeNull();
  });

  it("rejects an empty userId", () => {
    expect(parseExternalReference(":topup")).toBeNull();
  });
});
