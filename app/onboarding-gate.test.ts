import { describe, it, expect, vi, beforeEach } from "vitest";

// #13/#14: app/page.tsx and app/onboarding/page.tsx are async Server
// Components whose only dependencies are auth(), lib/db functions,
// redirect() and -- since the landing page began emitting FAQPage
// structured data -- getTranslations. All four are mocked here, so the
// default export itself can be executed directly, which is a real
// behavioural test rather than a source-text assertion.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
// Resolves dotted paths against the REAL catalog, the same stub
// app/page-guards.test.tsx uses: a key that does not exist throws here
// rather than silently rendering its own key path (next-intl does not throw
// on a miss, so an echoing stub would make every assertion vacuous).
vi.mock("next-intl/server", async () => {
  const messages = (await import("@/messages/pt-BR.json")).default as Record<
    string,
    unknown
  >;
  return {
    getTranslations: vi.fn(async (namespace: string) => {
      const ns = messages[namespace];
      if (!ns) throw new Error(`unknown catalog namespace: ${namespace}`);
      return (key: string, values?: Record<string, unknown>) => {
        const value = key
          .split(".")
          .reduce<unknown>(
            (node, part) =>
              node && typeof node === "object"
                ? (node as Record<string, unknown>)[part]
                : undefined,
            ns,
          );
        if (typeof value !== "string") {
          throw new Error(`missing catalog key: ${namespace}.${key}`);
        }
        return values
          ? value.replace(/\{(\w+)\}/g, (_m, k) => String(values[k]))
          : value;
      };
    }),
  };
});
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
import { FAQ_KEYS } from "@/lib/landing/faq";

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

    // The signed-out branch is a Fragment now: the FAQPage structured data
    // alongside the page itself. Assert on the children rather than on the
    // root's own name, which a Fragment does not have.
    const children = (
      result as { props: { children: { type: { name?: string } }[] } }
    ).props.children;
    // A LandingPage element, not a redirect and not DashboardShell.
    expect(children.map((c) => c.type.name ?? c.type)).toContain("LandingPage");
  });

  // A7 (AEO): the landing page's FAQ is emitted as FAQPage structured data
  // built from the same catalog the section renders, so a search engine and
  // a reader are told the same thing. It now travels in an @graph alongside
  // the Organization and WebSite nodes that say who publishes the site.
  it("emits an Organization/WebSite/FAQPage graph alongside the landing page", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await Home({ searchParams: searchParams() });
    const children = (
      result as {
        props: {
          children: {
            type: string;
            props: { dangerouslySetInnerHTML?: { __html: string } };
          }[];
        };
      }
    ).props.children;

    const script = children.find((c) => c.type === "script");
    expect(script).toBeDefined();

    const ld = JSON.parse(script!.props.dangerouslySetInnerHTML!.__html);
    expect(ld["@context"]).toBe("https://schema.org");
    const graph = ld["@graph"] as Record<string, unknown>[];
    expect(graph.map((node) => node["@type"])).toEqual([
      "Organization",
      "WebSite",
      "FAQPage",
    ]);

    // The WebSite hangs off the Organization by @id rather than repeating it.
    const [org, site, faq] = graph;
    expect(site.publisher).toEqual({ "@id": org["@id"] });

    const entries = faq.mainEntity as {
      name: string;
      acceptedAnswer: { text: string };
    }[];
    expect(entries).toHaveLength(FAQ_KEYS.length);
    for (const entry of entries) {
      expect(entry.name).toBeTruthy();
      expect(entry.acceptedAnswer.text).toBeTruthy();
      // A placeholder that reached the schema unresolved would be a real
      // defect a truthiness check alone would miss.
      expect(entry.acceptedAnswer.text).not.toMatch(/\{\w+\}/);
    }
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
