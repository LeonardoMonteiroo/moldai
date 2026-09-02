import { describe, it, expect, vi, beforeEach } from "vitest";

// #13/#14: app/page.tsx and app/onboarding/page.tsx are async Server
// Components that only call auth()/lib/db functions/redirect() -- none of
// next-intl's request-scoped translation resolution -- so, unlike
// generateMetadata (see app/page-titles.test.ts's comment), the default
// export itself can be executed directly here with mocked dependencies,
// which is a real behavioural test rather than a source-text assertion.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getUserById: vi.fn(),
  getOnboardingStatus: vi.fn(),
}));
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import { auth } from "@/auth";
import { getUserById, getOnboardingStatus } from "@/lib/db/users";
import { loadWallet } from "@/lib/db/wallet";
import { redirect } from "next/navigation";
import Home from "./page";
import OnboardingPage from "./onboarding/page";

// `auth` is one overload of NextAuth's exported function (also callable as
// middleware), which vi.mocked's overload resolution picks the wrong one
// for -- cast once here rather than at every call site (lib/auth/guard.test.ts
// precedent).
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

const SESSION = {
  user: { id: "u1", email: "dev@moldai.local" },
} as never;

function searchParams(value: Record<string, string> = {}) {
  return Promise.resolve(value);
}

describe("app/page.tsx (#13/#14)", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(getOnboardingStatus).mockReset();
    vi.mocked(redirect).mockClear();
  });

  it("renders the public landing for a signed-out visitor instead of redirecting to /login", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await Home({ searchParams: searchParams() });

    expect(getUserById).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    // A LandingPage element, not a redirect and not DashboardShell.
    expect((result as { type: { name?: string } }).type.name).toBe(
      "LandingPage",
    );
  });

  it("redirects a signed-in, never-onboarded account to /onboarding", async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.mocked(getUserById).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      passwordHash: "x",
      name: null,
      emailVerified: new Date(),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    vi.mocked(getOnboardingStatus).mockResolvedValue({ onboardedAt: null });

    await expect(Home({ searchParams: searchParams() })).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
  });

  it("renders the dashboard for a signed-in, already-onboarded account", async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.mocked(getUserById).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      passwordHash: "x",
      name: null,
      emailVerified: new Date(),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    vi.mocked(getOnboardingStatus).mockResolvedValue({
      onboardedAt: new Date("2026-01-01"),
    });

    const result = await Home({ searchParams: searchParams() });

    expect(redirect).not.toHaveBeenCalled();
    expect((result as { type: { name?: string } }).type.name).toBe(
      "DashboardShell",
    );
  });

  it("redirects to /login when the session user no longer exists (#62 precedent)", async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.mocked(getUserById).mockResolvedValue(null);
    vi.mocked(getOnboardingStatus).mockResolvedValue({ onboardedAt: null });

    await expect(Home({ searchParams: searchParams() })).rejects.toThrow(
      "REDIRECT:/login",
    );
  });
});

describe("app/onboarding/page.tsx (#14)", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(getOnboardingStatus).mockReset();
    vi.mocked(loadWallet).mockReset();
    vi.mocked(redirect).mockClear();
  });

  it("redirects to /login without a session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/login");
    expect(getOnboardingStatus).not.toHaveBeenCalled();
  });

  it("redirects an already-onboarded account to / instead of re-showing the wizard", async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.mocked(getOnboardingStatus).mockResolvedValue({
      onboardedAt: new Date("2026-01-01"),
    });
    vi.mocked(loadWallet).mockResolvedValue({
      plan: "free",
      balance: 30,
      total: 30,
      purchased: 0,
      renewsAt: null,
      planInterval: "month",
      planSourceExternalId: null,
    });

    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/");
  });

  it("renders the wizard for a never-onboarded account", async () => {
    mockAuth.mockResolvedValue(SESSION);
    vi.mocked(getOnboardingStatus).mockResolvedValue({ onboardedAt: null });
    vi.mocked(loadWallet).mockResolvedValue({
      plan: "free",
      balance: 30,
      total: 30,
      purchased: 0,
      renewsAt: null,
      planInterval: "month",
      planSourceExternalId: null,
    });

    const result = await OnboardingPage();

    expect(redirect).not.toHaveBeenCalled();
    expect((result as { type: { name?: string } }).type.name).toBe(
      "OnboardingShell",
    );
  });
});
