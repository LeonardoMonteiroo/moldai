import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  translatorFor,
} from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { PageHeader } from "./PageHeader";

const { push, signOut } = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signOut }));

const CREDITS: Credits = {
  plan: "atelier",
  balance: 320,
  total: 500,
  renewsInDays: 12,
};

const t = ptBR.PageHeader;
const tPageHeader = translatorFor("PageHeader");

beforeEach(() => {
  push.mockClear();
  signOut.mockClear();
});

describe("PageHeader", () => {
  it("omits the back button when no backHref is given", () => {
    renderWithIntl(
      <PageHeader title="Meus moldes" credits={CREDITS} userEmail="a@b.com" />,
    );
    expect(
      screen.queryByRole("button", { name: t.backButton }),
    ).not.toBeInTheDocument();
  });

  it("renders the back button and navigates to backHref", async () => {
    renderWithIntl(
      <PageHeader
        title="Blusa"
        backHref="/"
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: t.backButton }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("renders the title and subtitle", () => {
    renderWithIntl(
      <PageHeader
        title="Blusa"
        subtitle="há 2 min · v3"
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    expect(screen.getByText("Blusa")).toBeInTheDocument();
    expect(screen.getByText("há 2 min · v3")).toBeInTheDocument();
  });

  // #48: the header row was an anonymous div and the title a bare span --
  // a screen-reader user had no banner landmark to jump to, and "list
  // headings" found nothing at all on the dashboard's own header.
  it("is a banner landmark, and the title is an h1", () => {
    renderWithIntl(
      <PageHeader title="Blusa" credits={CREDITS} userEmail="a@b.com" />,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Blusa" }),
    ).toBeInTheDocument();
  });

  it("renders no title block, and no separator, when title is omitted", () => {
    // The dashboard's case: its sidebar already names the section, so a header
    // title would print the same words twice. With neither title nor backHref
    // the separator has nothing to divide and must not dangle.
    const { container } = renderWithIntl(
      <PageHeader credits={CREDITS} userEmail="a@b.com" />,
    );
    expect(
      container.querySelector("[data-slot='separator']"),
    ).not.toBeInTheDocument();
    // Everything else still renders.
    expect(
      screen.getByRole("button", { name: t.buyCreditsButton }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t.accountMenuLabel }),
    ).toBeInTheDocument();
  });

  it("keeps the separator when there is a back button but no title", () => {
    const { container } = renderWithIntl(
      <PageHeader backHref="/" credits={CREDITS} userEmail="a@b.com" />,
    );
    expect(
      container.querySelector("[data-slot='separator']"),
    ).toBeInTheDocument();
  });

  it("omits the credits bar and buy button while credits are null", () => {
    renderWithIntl(
      <PageHeader title="Meus moldes" credits={null} userEmail="a@b.com" />,
    );
    expect(
      screen.queryByRole("button", { name: t.buyCreditsButton }),
    ).not.toBeInTheDocument();
    // The account menu is always available, credits or not.
    expect(
      screen.getByRole("button", { name: t.accountMenuLabel }),
    ).toBeInTheDocument();
  });

  it("shows the balance and sends the buy button to the usage section", async () => {
    renderWithIntl(
      <PageHeader title="Blusa" credits={CREDITS} userEmail="a@b.com" />,
    );
    expect(screen.getByText(/320/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: t.buyCreditsButton }),
    );
    expect(push).toHaveBeenCalledWith("/settings?section=usage");
  });

  // #37: a top-up raises balance without raising total (purchased credits
  // carry over independently of the plan allowance), so balance can exceed
  // total — the bar must clamp at 100% instead of overflowing its track.
  it("clamps the credits bar at 100% when balance exceeds total (purchased top-up credits)", () => {
    const { container } = renderWithIntl(
      <PageHeader
        title="Blusa"
        credits={{ plan: "free", balance: 130, total: 30, renewsInDays: 1 }}
        userEmail="a@b.com"
      />,
    );
    const bar = container.querySelector(".bg-olive") as HTMLElement;
    expect(bar.style.width).toBe("100%");
  });

  it("resolves the plan label from PlanSection's catalog names, for every PlanId", () => {
    // Regression guard for the planLabel column removal: PageHeader must read
    // `PlanSection.plans.{plan}.name` via a template-built key, not a
    // hardcoded two-key { free, atelier } block — a wallet on "studio" or
    // "factory" (applyPurchase can't issue them yet, but the type allows
    // them) would fail to resolve against a two-key block, either throwing
    // or rendering the raw key path instead of the real plan name. Asserting
    // the exact resolved string (not a substring) is what makes that failure
    // visible here.
    (["studio", "factory"] as const).forEach((plan) => {
      const { unmount } = renderWithIntl(
        <PageHeader
          title="Blusa"
          credits={{ plan, balance: 750, total: 2000, renewsInDays: 5 }}
          userEmail="a@b.com"
        />,
      );
      const expected = tPageHeader("creditsLabel", {
        planLabel: ptBR.PlanSection.plans[plan].name,
        balance: 750,
      });
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    });
  });

  // #106: {balance} créditos was a hardcoded plural noun -- a balance of 1
  // (unusual, but Ateliê wallets can drain to exactly 1) rendered "1
  // créditos". Covers the plural boundary at 0, 1 and 2 directly against
  // the catalog's own ICU resolution, not a pasted literal.
  it("pluralizes the credits label correctly at 0, 1 and 2", () => {
    for (const balance of [0, 1, 2]) {
      const { unmount } = renderWithIntl(
        <PageHeader
          title="Blusa"
          credits={{ plan: "free", balance, total: 30, renewsInDays: 5 }}
          userEmail="a@b.com"
        />,
      );
      const expected = tPageHeader("creditsLabel", {
        planLabel: ptBR.PlanSection.plans.free.name,
        balance,
      });
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("reaches every settings section from the account menu", async () => {
    renderWithIntl(
      <PageHeader title="Blusa" credits={CREDITS} userEmail="a@b.com" />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: t.accountMenuLabel }),
    );

    expect(
      await screen.findByRole("menuitem", { name: t.usageMenuItem }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: t.preferencesMenuItem }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("menuitem", { name: t.planMenuItem }),
    );
    expect(push).toHaveBeenCalledWith("/settings?section=plan");
  });

  it("signs out from the account menu", async () => {
    renderWithIntl(
      <PageHeader title="Blusa" credits={CREDITS} userEmail="a@b.com" />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: t.accountMenuLabel }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: t.signOutButton }),
    );
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});

describe("PageHeader catalog", () => {
  it("carries the account-menu keys absorbed from DashboardTopbar", () => {
    expect(t.accountMenuLabel).toBeTruthy();
    expect(t.usageMenuItem).toBeTruthy();
    expect(t.planMenuItem).toBeTruthy();
    expect(t.preferencesMenuItem).toBeTruthy();
  });
});
