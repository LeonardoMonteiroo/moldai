import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const ROW_UPDATED_AT = new Date("2026-08-21T11:30:00.000Z");
let wallet: Wallet = seedWallet(NOW);

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
// A stateful-enough fake of withAsaasCustomerId: it actually remembers the
// id across calls (keyed per test user) so "reuses an existing customer"
// exercises real logic rather than a mock configured to already agree.
const asaasCustomerIds = new Map<string, string>();
vi.mock("@/lib/db/wallet", () => ({
  withWallet: vi.fn(
    async (
      _userId: string,
      fn: (w: Wallet) => { result: Wallet; entries: LedgerEntry[] },
    ) => fn(wallet).result,
  ),
  withAsaasCustomerId: vi.fn(
    async (userId: string, createCustomer: () => Promise<string>) => {
      const existing = asaasCustomerIds.get(userId);
      if (existing) return existing;
      const id = await createCustomer();
      asaasCustomerIds.set(userId, id);
      return id;
    },
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/db/pattern", () => ({
  loadPattern: vi.fn(async (patternId: string) =>
    patternId === "m1"
      ? { state: seedPatternState(t), updatedAt: ROW_UPDATED_AT }
      : null,
  ),
  patternNotFound: vi.fn(
    () =>
      new Response(JSON.stringify({ status: "not_found" }), { status: 404 }),
  ),
}));
// #6: this route previously had no rate-limit bucket at all -- mocked
// allowed-by-default here so the pre-existing tests below still exercise
// the mock-purchase behaviour unchanged; individual tests override this to
// exercise the 429 path.
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));
vi.mock("@/lib/billing/asaas", () => ({
  loadAsaasConfig: vi.fn(),
  createCustomer: vi.fn(),
  createCheckout: vi.fn(),
  buildExternalReference: vi.fn(
    (userId: string, type: string) => `${userId}:${type}`,
  ),
  AsaasError: class AsaasError extends Error {},
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { consume } from "@/lib/rate-limit/consume";
import { withWallet } from "@/lib/db/wallet";
import {
  loadAsaasConfig,
  createCustomer,
  createCheckout,
} from "@/lib/billing/asaas";

function req(body: unknown) {
  return new Request("http://test/api/billing/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/purchase", () => {
  const ORIGINAL_PROVIDER = process.env.PAYMENT_PROVIDER;

  beforeEach(() => {
    wallet = seedWallet(NOW);
    delete process.env.PAYMENT_PROVIDER;
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(withWallet).mockClear();
    vi.mocked(consume).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(loadAsaasConfig).mockReset();
    vi.mocked(createCustomer).mockReset();
    vi.mocked(createCheckout).mockReset();
    asaasCustomerIds.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIGINAL_PROVIDER === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = ORIGINAL_PROVIDER;
  });

  describe("mock provider (default, PAYMENT_PROVIDER unset)", () => {
    it("with a patternId, returns the full composed editor state", async () => {
      const res = await POST(req({ type: "topup", patternId: "m1" }));
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.state.pattern.version).toBe(0);
      expect(json.state.credits.balance).toBe(130);
      // Non-mutating reader: must use the row's stored updatedAt, not "now".
      expect(json.state.pattern.updatedAt).toBe(ROW_UPDATED_AT.toISOString());
    });

    it("without a patternId, returns just credits", async () => {
      const res = await POST(req({ type: "topup" }));
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.credits.balance).toBe(130);
      expect(json.state).toBeUndefined();
    });

    it("404s when patternId is given but not found/owned", async () => {
      const res = await POST(req({ type: "topup", patternId: "not-mine" }));
      expect(res.status).toBe(404);
    });

    // The wallet write used to commit before patternId was checked, so a bad
    // id credited the account and then answered 404 -- the client never saw
    // it.
    it("does not touch the wallet when patternId is not found/owned", async () => {
      const before = wallet.balance;
      const res = await POST(req({ type: "topup", patternId: "not-mine" }));
      expect(res.status).toBe(404);
      expect(wallet.balance).toBe(before);
    });

    // applyPurchase treated anything that was not literally "topup" as
    // "subscribe", so an unrecognised (or absent) type granted the Atelie
    // plan.
    it("rejects an unknown purchase type without touching the wallet", async () => {
      const res = await POST(req({ type: "not-a-real-kind" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_purchase_type");
      expect(wallet.plan).toBe("free");
      expect(wallet.balance).toBe(30);
    });

    it("rejects a missing purchase type without touching the wallet", async () => {
      const res = await POST(req({}));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_purchase_type");
      expect(wallet.plan).toBe("free");
      expect(wallet.balance).toBe(30);
    });

    it("still accepts the two real types", async () => {
      expect((await POST(req({ type: "topup" }))).status).toBe(200);
      wallet = seedWallet(NOW);
      const res = await POST(req({ type: "subscribe" }));
      expect(res.status).toBe(200);
      expect(wallet.plan).toBe("atelier");
    });

    it("no session returns 401", async () => {
      vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(401);
    });

    it("never calls the asaas client", async () => {
      await POST(req({ type: "topup" }));
      expect(createCheckout).not.toHaveBeenCalled();
    });
  });

  describe("rate limiting", () => {
    it("429s on the IP-keyed bucket without touching the wallet", async () => {
      vi.mocked(consume).mockImplementation(async (bucket) =>
        bucket === "purchase"
          ? { allowed: false, retryAfterSec: 30 }
          : { allowed: true, retryAfterSec: 0 },
      );
      const before = wallet.balance;
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(429);
      expect(wallet.balance).toBe(before);
    });

    it("429s on the user-keyed bucket without touching the wallet", async () => {
      vi.mocked(consume).mockImplementation(async (bucket) =>
        bucket === "purchase_user"
          ? { allowed: false, retryAfterSec: 30 }
          : { allowed: true, retryAfterSec: 0 },
      );
      const before = wallet.balance;
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(429);
      expect(wallet.balance).toBe(before);
    });
  });

  describe("asaas provider (PAYMENT_PROVIDER=asaas)", () => {
    beforeEach(() => {
      process.env.PAYMENT_PROVIDER = "asaas";
      vi.mocked(loadAsaasConfig).mockReturnValue({
        apiKey: "key",
        baseUrl: "https://api-sandbox.asaas.com/v3",
      });
      vi.mocked(createCheckout).mockResolvedValue({
        id: "chk_1",
        link: "https://pay.asaas.com/chk_1",
      });
      vi.mocked(createCustomer).mockResolvedValue({ id: "cus_new" });
    });

    it("returns a redirect and does not change the wallet balance", async () => {
      const before = wallet.balance;
      const res = await POST(req({ type: "topup" }));
      const json = await res.json();
      expect(json).toEqual({
        status: "redirect",
        url: "https://pay.asaas.com/chk_1",
      });
      expect(withWallet).not.toHaveBeenCalled();
      expect(wallet.balance).toBe(before);
    });

    it("invalid_purchase_type still 400s before any provider call", async () => {
      const res = await POST(req({ type: "nope" }));
      expect(res.status).toBe(400);
      expect(createCheckout).not.toHaveBeenCalled();
    });

    it("still 404s on an unowned/missing patternId before creating a checkout", async () => {
      const res = await POST(req({ type: "topup", patternId: "not-mine" }));
      expect(res.status).toBe(404);
      expect(createCheckout).not.toHaveBeenCalled();
    });

    it("creates an asaas customer on first purchase and reuses it after", async () => {
      await POST(req({ type: "topup" }));
      expect(createCustomer).toHaveBeenCalledTimes(1);

      await POST(req({ type: "topup" }));
      expect(createCustomer).toHaveBeenCalledTimes(1); // not called again
    });

    it("uses RECURRENT for subscribe and DETACHED for topup", async () => {
      await POST(req({ type: "subscribe" }));
      expect(createCheckout).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ chargeType: "RECURRENT" }),
      );
      vi.mocked(createCheckout).mockClear();
      await POST(req({ type: "topup" }));
      expect(createCheckout).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ chargeType: "DETACHED" }),
      );
    });

    it("sends the checkout item's price from CHECKOUT_PRICES and a catalog-resolved name, never a hardcoded literal", async () => {
      await POST(req({ type: "topup" }));
      expect(createCheckout).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: [{ name: "topupTitle", quantity: 1, value: 19 }],
        }),
      );
      vi.mocked(createCheckout).mockClear();
      await POST(req({ type: "subscribe" }));
      expect(createCheckout).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          items: [{ name: "subscribeTitle", quantity: 1, value: 59 }],
        }),
      );
    });

    it("answers checkout_unavailable when ASAAS_API_KEY is not configured", async () => {
      vi.mocked(loadAsaasConfig).mockReturnValue(null);
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("checkout_unavailable");
    });

    it("answers checkout_unavailable, never the provider's own error, when the gateway call fails", async () => {
      const { AsaasError } = await import("@/lib/billing/asaas");
      vi.mocked(createCheckout).mockRejectedValue(
        new AsaasError("asaas responded 500"),
      );
      const res = await POST(req({ type: "topup" }));
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toBe("checkout_unavailable");
    });
  });
});
