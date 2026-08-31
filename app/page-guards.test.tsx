import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Wallet } from "@/lib/billing/wallet";
import messages from "@/messages/pt-BR.json";

/**
 * #168: a decision on the `app/**\/page.tsx` server-component shells --
 * TESTED, not excluded. They looked like markup-only wiring, which is why
 * they sat at 0%, but they are actually where this app's authorization lives:
 * every one of them re-checks the session, most of them re-check that the
 * account still exists (#62 -- a JWT outlives account deletion by up to 30
 * days on any device that did not do the deleting), and the three
 * pattern-scoped ones re-check ownership. None of that is enforced anywhere
 * else for a page render: `requireUser()` guards the API routes only.
 *
 * The guard is therefore asserted as one property over one table rather than
 * per page, so a NEW screen added without its guard is a missing row here --
 * a test that would have failed for the #62 class of bug on every screen at
 * once, instead of once per screen after the fact.
 *
 * `redirect()` throws in Next (it never returns), so the mock throws too --
 * with it stubbed to return, execution would continue past the guard and the
 * test would pass for a page that renders a screen it should not.
 */

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect(${url})`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getUserById: vi.fn(),
  getOnboardingStatus: vi.fn(),
}));
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));
vi.mock("@/lib/db/pattern", () => ({ loadPattern: vi.fn() }));
vi.mock("@/lib/db/account", () => ({
  getLedgerHistory: vi.fn(async () => []),
}));
// Resolves against the REAL catalog rather than echoing keys, so a metadata
// title naming a key that does not exist fails here instead of passing with
// the key path as its value (next-intl itself does not throw on a miss).
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace];
    if (!ns) throw new Error(`unknown catalog namespace: ${namespace}`);
    return (key: string, values?: Record<string, unknown>) => {
      const value = ns[key];
      if (typeof value !== "string") {
        throw new Error(`missing catalog key: ${namespace}.${key}`);
      }
      // Only VersionsShell.tabTitle interpolates; a single {name} is all
      // any metadata string in this app needs resolved.
      return values
        ? value.replace(/\{(\w+)\}/g, (_m, k) => String(values[k]))
        : value;
    };
  }),
}));

// The screens themselves are covered by their own dom-project tests; mocked
// here so importing a page never pulls a whole client component tree into
// the DOM-free `node` project, and so a page's props stay inspectable.
vi.mock("@/components/settings/SettingsShell", () => ({
  SettingsShell: () => null,
}));
vi.mock("@/components/size-charts/SizeChartsShell", () => ({
  SizeChartsShell: () => null,
}));
vi.mock("@/components/slopers/SlopersShell", () => ({
  SlopersShell: () => null,
}));
vi.mock("@/components/import/ImportShell", () => ({ ImportShell: () => null }));
vi.mock("@/components/onboarding/OnboardingShell", () => ({
  OnboardingShell: () => null,
}));
vi.mock("@/components/editor/EditorShell", () => ({ EditorShell: () => null }));
vi.mock("@/components/export/ExportShell", () => ({ ExportShell: () => null }));
vi.mock("@/components/versions/VersionsShell", () => ({
  VersionsShell: () => null,
}));
vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: () => null,
}));
vi.mock("@/components/landing/LandingPage", () => ({
  LandingPage: () => null,
}));

import { auth } from "@/auth";
import { getUserById, getOnboardingStatus } from "@/lib/db/users";
import { loadWallet } from "@/lib/db/wallet";
import { loadPattern } from "@/lib/db/pattern";

import Home, { generateMetadata as homeMetadata } from "./page";
import SettingsPage, {
  generateMetadata as settingsMetadata,
} from "./settings/page";
import SizeChartsPage, {
  generateMetadata as sizeChartsMetadata,
} from "./size-charts/page";
import SlopersPage, {
  generateMetadata as slopersMetadata,
} from "./slopers/page";
import ImportPage, { generateMetadata as importMetadata } from "./import/page";
import OnboardingPage, {
  generateMetadata as onboardingMetadata,
} from "./onboarding/page";
import PatternPage, {
  generateMetadata as patternMetadata,
} from "./pattern/[id]/page";
import PatternExportPage, {
  generateMetadata as exportMetadata,
} from "./pattern/[id]/export/page";
import PatternVersionsPage, {
  generateMetadata as versionsMetadata,
} from "./pattern/[id]/versions/page";

// `auth` is one overload of NextAuth's exported function (also callable as
// middleware), which vi.mocked's overload resolution picks the wrong one for
// -- the app/planos/page.test.tsx precedent casts once here.
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: "u1", email: "ana@example.com" } };
const USER = {
  id: "u1",
  email: "ana@example.com",
  passwordHash: "H",
  name: "Ana",
  emailVerified: new Date("2026-08-01T00:00:00Z"),
};
const WALLET: Wallet = {
  plan: "free",
  balance: 30,
  total: 30,
  purchased: 0,
  renewsAt: null,
  planSourceExternalId: null,
};
const PATTERN_NAME = "Blusa da Ana";
const LOADED_PATTERN = {
  state: {
    pattern: { name: PATTERN_NAME, version: 3 },
    conflict: null,
  },
  updatedAt: new Date("2026-08-20T10:00:00Z"),
} as unknown as Awaited<ReturnType<typeof loadPattern>>;

/** Resolves to the url a page redirected to, or throws if it rendered. */
async function redirectedTo(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
  } catch (err) {
    if (err instanceof Redirected) return err.url;
    throw err;
  }
  throw new Error("the page rendered instead of redirecting");
}

interface PageCase {
  route: string;
  call: () => Promise<unknown>;
  /** Reads the account row and must redirect when it is gone (#62). */
  readsUser?: boolean;
  /** Reads the wallet and must redirect when it is gone (#62). */
  readsWallet?: boolean;
  /** Pattern-scoped: must redirect to ?missing=pattern when not owned. */
  readsPattern?: boolean;
  /**
   * Checks `session.user.email` only. True for /import alone, and correct
   * by need rather than an oversight: it reads no account-scoped data, so it
   * has no id to key a query on. Recorded as a flag rather than skipped, so
   * the difference is visible and a page that later starts reading the
   * account has to justify staying in this column.
   */
  emailOnly?: boolean;
}

const GATED_PAGES: PageCase[] = [
  {
    route: "/settings",
    call: () => SettingsPage({ searchParams: Promise.resolve({}) }),
    readsUser: true,
    readsWallet: true,
  },
  { route: "/size-charts", call: () => SizeChartsPage(), readsWallet: true },
  { route: "/slopers", call: () => SlopersPage(), readsWallet: true },
  // The one gated page that reads nothing but the session -- import has no
  // credits bar and no account-scoped data, so there is no #62 row for it.
  { route: "/import", call: () => ImportPage(), emailOnly: true },
  {
    route: "/pattern/[id]",
    call: () => PatternPage({ params: Promise.resolve({ id: "p1" }) }),
    readsUser: true,
    readsPattern: true,
  },
  {
    route: "/pattern/[id]/export",
    call: () => PatternExportPage({ params: Promise.resolve({ id: "p1" }) }),
    readsWallet: true,
    readsPattern: true,
  },
  {
    route: "/pattern/[id]/versions",
    call: () => PatternVersionsPage({ params: Promise.resolve({ id: "p1" }) }),
    readsUser: true,
    readsWallet: true,
    readsPattern: true,
  },
];

function happyPath() {
  mockAuth.mockResolvedValue(SESSION);
  vi.mocked(getUserById).mockResolvedValue(USER);
  vi.mocked(getOnboardingStatus).mockResolvedValue({
    onboardedAt: new Date("2026-08-02T00:00:00Z"),
  });
  vi.mocked(loadWallet).mockResolvedValue(WALLET);
  vi.mocked(loadPattern).mockResolvedValue(LOADED_PATTERN);
}

describe("app/**/page.tsx session guards", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(getOnboardingStatus).mockReset();
    vi.mocked(loadWallet).mockReset();
    vi.mocked(loadPattern).mockReset();
    happyPath();
  });

  it.each(GATED_PAGES.map((p) => [p.route, p] as const))(
    "%s redirects to /login with no session at all",
    async (_route, page) => {
      mockAuth.mockResolvedValue(null);
      expect(await redirectedTo(page.call)).toBe("/login");
    },
  );

  // A JWT missing either half is not a usable session: `email` is what the
  // header renders and `id` is what every ownership-scoped query keys on, so
  // a page must not proceed on one without the other.
  it.each(
    GATED_PAGES.filter((p) => !p.emailOnly).map((p) => [p.route, p] as const),
  )(
    "%s redirects to /login for a session missing the user id",
    async (_route, page) => {
      mockAuth.mockResolvedValue({ user: { email: "ana@example.com" } });
      expect(await redirectedTo(page.call)).toBe("/login");
    },
  );

  it.each(
    GATED_PAGES.filter((p) => p.readsUser).map((p) => [p.route, p] as const),
  )(
    "%s redirects to /login when the account row is gone (#62)",
    async (_route, page) => {
      vi.mocked(getUserById).mockResolvedValue(null);
      expect(await redirectedTo(page.call)).toBe("/login");
    },
  );

  it.each(
    GATED_PAGES.filter((p) => p.readsWallet).map((p) => [p.route, p] as const),
  )(
    "%s redirects to /login when the wallet is gone (#62)",
    async (_route, page) => {
      vi.mocked(loadWallet).mockResolvedValue(null);
      expect(await redirectedTo(page.call)).toBe("/login");
    },
  );

  // Deliberately one flag rather than distinguishing "deleted" from "not
  // yours": the latter would make the dashboard an existence oracle for
  // other accounts' pattern ids, which lib/db/pattern.ts's uniform null
  // exists to prevent.
  it.each(
    GATED_PAGES.filter((p) => p.readsPattern).map((p) => [p.route, p] as const),
  )(
    "%s redirects to /?missing=pattern for a pattern that is gone or not owned",
    async (_route, page) => {
      vi.mocked(loadPattern).mockResolvedValue(null);
      expect(await redirectedTo(page.call)).toBe("/?missing=pattern");
    },
  );

  it.each(
    GATED_PAGES.filter((p) => p.readsPattern).map((p) => [p.route, p] as const),
  )(
    "%s scopes the pattern read to the session's own user id",
    async (_route, page) => {
      await page.call();
      expect(loadPattern).toHaveBeenCalledWith("p1", "u1");
    },
  );

  it("covers every page.tsx under app/ that has a session guard", async () => {
    // The table is the thing that goes stale, so the filesystem is the
    // source of truth for what belongs in it. The five routes excluded here
    // are genuinely public and are asserted as such below.
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const found: string[] = [];
    const walk = (dir: string, route: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === "api") continue;
          walk(join(dir, entry.name), `${route}/${entry.name}`);
        } else if (entry.name === "page.tsx") {
          found.push(route === "" ? "/" : route);
        }
      }
    };
    walk(join(process.cwd(), "app"), "");

    const PUBLIC = [
      "/",
      "/planos",
      "/login",
      "/signup",
      "/verify",
      "/password-reset",
    ];
    const gated = GATED_PAGES.map((p) => p.route);
    // /onboarding has its own guard test below (its extra
    // already-onboarded redirect makes it a poor fit for the shared table).
    const accountedFor = new Set([...PUBLIC, ...gated, "/onboarding"]);
    expect(found.filter((r) => !accountedFor.has(r))).toEqual([]);
  });
});

describe("app/page.tsx (the dashboard, or the public landing)", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(getOnboardingStatus).mockReset();
    happyPath();
  });

  // #13: the one gated-looking route that is deliberately NOT gated -- a
  // signed-out visitor gets the marketing page, not a redirect to a bare
  // centered login card with no product explanation.
  it("renders the public landing for a signed-out visitor, with no db read", async () => {
    mockAuth.mockResolvedValue(null);
    const element = (await Home({
      searchParams: Promise.resolve({}),
    })) as React.ReactElement;

    expect(element.type).toBeTruthy();
    expect(getUserById).not.toHaveBeenCalled();
    expect(getOnboardingStatus).not.toHaveBeenCalled();
  });

  it("redirects to /login when the signed-in account row is gone (#62)", async () => {
    vi.mocked(getUserById).mockResolvedValue(null);
    expect(
      await redirectedTo(() => Home({ searchParams: Promise.resolve({}) })),
    ).toBe("/login");
  });

  // #14: an account that has never finished OR skipped the wizard is sent
  // there instead of the dashboard.
  it("redirects a never-onboarded account to /onboarding", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ onboardedAt: null });
    expect(
      await redirectedTo(() => Home({ searchParams: Promise.resolve({}) })),
    ).toBe("/onboarding");
  });

  // The ?missing=pattern flag /pattern/[id] sets is read here as plain data
  // (the ?section= precedent), so the dashboard can say why you landed on it
  // -- it used to be a bare redirect("/") with nothing to explain it.
  it("passes patternMissing through only for the exact ?missing=pattern flag", async () => {
    const missing = (await Home({
      searchParams: Promise.resolve({ missing: "pattern" }),
    })) as React.ReactElement<{ patternMissing: boolean }>;
    expect(missing.props.patternMissing).toBe(true);

    for (const value of [undefined, "", "Pattern", "sloper", "1"]) {
      const other = (await Home({
        searchParams: Promise.resolve({ missing: value }),
      })) as React.ReactElement<{ patternMissing: boolean }>;
      expect(other.props.patternMissing).toBe(false);
    }
  });
});

describe("app/onboarding/page.tsx", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(getOnboardingStatus).mockReset();
    vi.mocked(loadWallet).mockReset();
    happyPath();
  });

  it("redirects to /login with no session", async () => {
    mockAuth.mockResolvedValue(null);
    expect(await redirectedTo(() => OnboardingPage())).toBe("/login");
  });

  it.each([
    [
      "the account row",
      () => vi.mocked(getOnboardingStatus).mockResolvedValue(null),
    ],
    ["the wallet", () => vi.mocked(loadWallet).mockResolvedValue(null)],
  ])("redirects to /login when %s is gone (#62)", async (_name, breakIt) => {
    breakIt();
    expect(await redirectedTo(() => OnboardingPage())).toBe("/login");
  });

  // A stale bookmark or a back button must not re-show the wizard to an
  // account that already finished (or skipped) it.
  it("redirects an already-onboarded account back to /", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({
      onboardedAt: new Date("2026-08-02T00:00:00Z"),
    });
    expect(await redirectedTo(() => OnboardingPage())).toBe("/");
  });

  it("renders the wizard for an account that has never seen it", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ onboardedAt: null });
    const element = (await OnboardingPage()) as React.ReactElement<{
      credits: { plan: string };
    }>;
    expect(element.props.credits.plan).toBe("free");
  });
});

describe("app/settings/page.tsx section parsing", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(loadWallet).mockReset();
    happyPath();
  });

  async function sectionFor(section?: string) {
    const element = (await SettingsPage({
      searchParams: Promise.resolve({ section }),
    })) as React.ReactElement<{ activeSection: string }>;
    return element.props.activeSection;
  }

  it.each(["profile", "password", "danger", "usage", "plan"])(
    "honours ?section=%s",
    async (section) => {
      expect(await sectionFor(section)).toBe(section);
    },
  );

  // An unknown section must fall back rather than reach SettingsShell, whose
  // five `&&` panels would all be false and render an empty page.
  it.each([undefined, "", "PROFILE", "billing", "../danger"])(
    "falls back to profile for %o",
    async (section) => {
      expect(await sectionFor(section)).toBe("profile");
    },
  );

  it("passes an empty string, not undefined, for an account with no name", async () => {
    vi.mocked(getUserById).mockResolvedValue({ ...USER, name: null });
    const element = (await SettingsPage({
      searchParams: Promise.resolve({}),
    })) as React.ReactElement<{ initialName: string }>;
    // ProfileSection's input is controlled -- undefined would make it
    // uncontrolled and React would warn on the first keystroke.
    expect(element.props.initialName).toBe("");
  });
});

/**
 * The tab title is the one place a private pattern name escapes the page
 * body, and generateMetadata runs BEFORE (and independently of) the page's
 * own redirect. So each of these has to refuse on its own rather than lean
 * on the guard next door.
 */
describe("pattern-scoped generateMetadata never leaks a name it cannot authorize", () => {
  const METADATA = [
    ["/pattern/[id]", patternMetadata],
    ["/pattern/[id]/export", exportMetadata],
    ["/pattern/[id]/versions", versionsMetadata],
  ] as const;

  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(loadPattern).mockReset();
    happyPath();
  });

  it.each(METADATA)("%s returns {} with no session", async (_route, build) => {
    mockAuth.mockResolvedValue(null);
    expect(await build({ params: Promise.resolve({ id: "p1" }) })).toEqual({});
    // And never even asks: an unauthenticated request must not reach the db.
    expect(loadPattern).not.toHaveBeenCalled();
  });

  it.each(METADATA)(
    "%s returns {} for a pattern that is gone or not owned",
    async (_route, build) => {
      vi.mocked(loadPattern).mockResolvedValue(null);
      expect(await build({ params: Promise.resolve({ id: "p1" }) })).toEqual(
        {},
      );
    },
  );

  it.each(METADATA)(
    "%s puts the pattern name in the title once ownership is proven",
    async (_route, build) => {
      const metadata = await build({ params: Promise.resolve({ id: "p1" }) });
      expect(String(metadata.title)).toContain(PATTERN_NAME);
      expect(loadPattern).toHaveBeenCalledWith("p1", "u1");
    },
  );
});

/**
 * Every screen's tab title. Cheap, but not decorative: the browser tab and
 * the history entry are the only place a screen's identity shows once it is
 * one of twenty open tabs, and a `generateMetadata` naming a key that does
 * not exist renders the literal key path -- next-intl does not throw on a
 * miss, so nothing else in the app would notice. The mocked
 * `getTranslations` above resolves the real catalog and throws on a miss,
 * which is what makes these assertions non-vacuous.
 */
describe("gated-page metadata titles", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(getOnboardingStatus).mockReset();
    vi.mocked(loadWallet).mockReset();
    vi.mocked(loadPattern).mockReset();
    happyPath();
  });

  it.each([
    ["/settings", settingsMetadata, messages.SettingsShell.title],
    ["/size-charts", sizeChartsMetadata, messages.SizeCharts.title],
    ["/slopers", slopersMetadata, messages.Slopers.title],
    ["/import", importMetadata, messages.Import.title],
    ["/onboarding", onboardingMetadata, messages.Onboarding.pageTitle],
  ] as [string, () => Promise<{ title?: unknown }>, string][])(
    "%s titles its tab from its own catalog namespace",
    async (_route, build, expected) => {
      expect((await build()).title).toBe(expected);
    },
  );

  // #13: `/` is the one route whose metadata genuinely depends on session
  // state, because a signed-out visitor gets the public landing there.
  it("/ uses the landing's own title and description when signed out", async () => {
    mockAuth.mockResolvedValue(null);
    const metadata = await homeMetadata();
    expect(metadata.title).toBe(messages.Landing.metaTitle);
    expect(metadata.description).toBe(messages.Landing.metaDescription);
  });

  it("/ reuses the sidebar's own section label, brand-suffixed, when signed in", async () => {
    const metadata = await homeMetadata();
    // The suffix is spelled out in the page rather than left to
    // layout.tsx's title.template, which Next does not apply to a page in
    // the same route segment as the layout that defines it.
    expect(metadata.title).toBe(`${messages.Sidebar.myPatternsLabel} - MoldAI`);
    // A signed-out title would be the landing's -- these must not collide.
    expect(metadata.title).not.toBe(messages.Landing.metaTitle);
  });
});
