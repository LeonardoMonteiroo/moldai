import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import PlanosPage, { generateMetadata } from "./page";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import {
  PLAN_PRICE_CENTS,
  SELF_SERVE_PLAN_IDS,
  priceDecimalString,
} from "@/lib/billing/plans";

// `auth` is one overload of NextAuth's exported function (also callable as
// middleware), which vi.mocked's overload resolution picks the wrong one
// for -- the lib/auth/guard.test.ts precedent casts once here rather than
// at every call site.
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

// The page now returns a fragment: the JSON-LD <script> plus the PricingPage
// element. These helpers pull out whichever half a test is about, so a future
// third child does not silently shift an index and break every assertion.
type Child = { type: unknown; props: Record<string, unknown> };

function childrenOf(element: unknown): Child[] {
  return (element as { props: { children: Child[] } }).props.children;
}

function pricing(element: unknown): Child {
  const found = childrenOf(element).find((c) => c.type !== "script");
  if (!found) throw new Error("no PricingPage element rendered");
  return found;
}

function structuredData(element: unknown): Record<string, unknown> {
  const script = childrenOf(element).find((c) => c.type === "script");
  if (!script) throw new Error("no JSON-LD script rendered");
  const html = (script.props.dangerouslySetInnerHTML as { __html: string })
    .__html;
  return JSON.parse(html);
}

describe("app/planos/page", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(loadWallet).mockReset();
  });

  // #15: "the route is reachable without a session -- /planos does not
  // redirect to /login". Unlike every other full-page screen (all gated by
  // requireUser()/redirect), this route calls neither in any branch.
  it("renders for an anonymous visitor without loading a wallet", async () => {
    mockAuth.mockResolvedValue(null);
    const element = await PlanosPage();
    expect(pricing(element).props.signedIn).toBe(false);
    expect(pricing(element).props.currentPlan).toBeNull();
    expect(loadWallet).not.toHaveBeenCalled();
  });

  it("resolves the signed-in visitor's current plan from their wallet", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
    });
    vi.mocked(loadWallet).mockResolvedValue({
      plan: "studio",
      balance: 2000,
      total: 2000,
      purchased: 0,
      renewsAt: null,
      planInterval: "month",
      planSourceExternalId: null,
    });
    const element = await PlanosPage();
    expect(pricing(element).props.signedIn).toBe(true);
    expect(pricing(element).props.currentPlan).toBe("studio");
    expect(loadWallet).toHaveBeenCalledWith("u1");
  });

  it("has its own metadata.title, distinct from the app-wide default", async () => {
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("metaTitle");
  });

  it("declares a self-referencing canonical", async () => {
    const metadata = await generateMetadata();
    expect(metadata.alternates?.canonical).toBe("/planos");
  });

  describe("structured data", () => {
    it("prices every Offer from PLAN_PRICE_CENTS, in major units", async () => {
      mockAuth.mockResolvedValue(null);
      const graph = structuredData(await PlanosPage())["@graph"] as Record<
        string,
        never
      >[];
      const app = graph.find((n) => n["@type"] === "SoftwareApplication");
      expect(app).toBeDefined();

      const offers = app!.offers as { price: string; priceCurrency: string }[];
      expect(offers.map((o) => o.price)).toEqual(
        SELF_SERVE_PLAN_IDS.map((id) =>
          priceDecimalString(PLAN_PRICE_CENTS[id]),
        ),
      );
      for (const offer of offers) {
        expect(offer.priceCurrency).toBe("BRL");
      }
    });

    // An Offer is a machine-readable claim that something is for sale, and
    // Confeccao's CTA is permanently disabled -- there is no sales channel to
    // route it to. Emitting one would be the overclaim the pricing copy
    // already refuses to make, in the format a crawler actually parses.
    it("emits no Offer for the tier whose CTA has no destination", async () => {
      mockAuth.mockResolvedValue(null);
      const graph = structuredData(await PlanosPage())["@graph"] as Record<
        string,
        never
      >[];
      const app = graph.find((n) => n["@type"] === "SoftwareApplication");
      const offers = app!.offers as { name: string }[];

      expect(offers).toHaveLength(SELF_SERVE_PLAN_IDS.length);
      // The stubbed translator echoes the key it was given.
      expect(offers.map((o) => o.name)).not.toContain("plans.factory.name");
    });
  });
});
