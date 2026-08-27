import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import PlanosPage, { generateMetadata } from "./page";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";

// `auth` is one overload of NextAuth's exported function (also callable as
// middleware), which vi.mocked's overload resolution picks the wrong one
// for -- the lib/auth/guard.test.ts precedent casts once here rather than
// at every call site.
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

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
    expect(element.props.signedIn).toBe(false);
    expect(element.props.currentPlan).toBeNull();
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
      planSourceExternalId: null,
    });
    const element = await PlanosPage();
    expect(element.props.signedIn).toBe(true);
    expect(element.props.currentPlan).toBe("studio");
    expect(loadWallet).toHaveBeenCalledWith("u1");
  });

  it("has its own metadata.title, distinct from the app-wide default", async () => {
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("metaTitle");
  });
});
