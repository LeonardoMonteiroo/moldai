import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
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
  planLabel: "Ateliê",
  balance: 320,
  total: 500,
  renewsInDays: 12,
};

const t = ptBR.PageHeader;

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
