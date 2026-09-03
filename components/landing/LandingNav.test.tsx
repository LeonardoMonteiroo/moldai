import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  screen,
  ptBR,
  userEvent,
} from "@/components/test-utils";
import { LandingNav } from "./LandingNav";

// LandingNav reads usePathname() to mark the current page; outside an App
// Router context there is no pathname to read. The specifier is the one the
// component itself imports, per CLAUDE.md's rule that a mismatched mock
// specifier fails silently rather than loudly.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// B7's fluid island nav, and the parts of it that only exist on a narrow
// viewport. jsdom applies no media queries, so `md:hidden` and `hidden
// md:flex` are inert here and BOTH the desktop row and the overlay are in the
// DOM once opened -- which is why every assertion below scopes itself to the
// overlay by id instead of querying globally.
describe("LandingNav · island menu", () => {
  it("starts closed, with the toggle named and not expanded", () => {
    renderWithIntl(<LandingNav />);

    const toggle = screen.getByRole("button", {
      name: ptBR.Landing.nav.menuOpen,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("title", ptBR.Landing.nav.menuOpen);
    expect(document.getElementById("landing-menu")).toBeNull();
  });

  it("opens the overlay, renames the toggle, and offers every nav link", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LandingNav />);

    await user.click(
      screen.getByRole("button", { name: ptBR.Landing.nav.menuOpen }),
    );

    const overlay = document.getElementById("landing-menu");
    expect(overlay).not.toBeNull();

    const toggle = screen.getByRole("button", {
      name: ptBR.Landing.nav.menuClose,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "landing-menu");

    for (const [label, href] of [
      [ptBR.Landing.nav.howItWorks, "/#how-it-works"],
      [ptBR.Landing.nav.faq, "/#faq"],
      [ptBR.Landing.nav.plans, "/planos"],
      [ptBR.Landing.nav.login, "/login"],
      [ptBR.Landing.nav.signup, "/signup"],
    ] as const) {
      const link = Array.from(overlay!.querySelectorAll("a")).find(
        (a) => a.textContent?.trim() === label,
      );
      expect(link, `${label} missing from the overlay`).toBeTruthy();
      expect(link).toHaveAttribute("href", href);
    }
  });

  // The overlay covers the page, so it must not be dismissable by pointer
  // alone.
  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LandingNav />);

    await user.click(
      screen.getByRole("button", { name: ptBR.Landing.nav.menuOpen }),
    );
    expect(document.getElementById("landing-menu")).not.toBeNull();

    await user.keyboard("{Escape}");
    expect(document.getElementById("landing-menu")).toBeNull();
  });

  // A menu left open would sit over the destination it just navigated to.
  it("closes when a link inside it is followed", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LandingNav />);

    await user.click(
      screen.getByRole("button", { name: ptBR.Landing.nav.menuOpen }),
    );
    const overlay = document.getElementById("landing-menu")!;
    const plans = Array.from(overlay.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === ptBR.Landing.nav.plans,
    )!;

    await user.click(plans);
    expect(document.getElementById("landing-menu")).toBeNull();
  });

  // #218: reused by /planos while signed in, where "Entrar"/"Testar grátis"
  // would be nonsense.
  it("swaps the auth pair for a dashboard link when signed in", () => {
    renderWithIntl(<LandingNav signedIn />);

    expect(
      screen.getAllByRole("link", { name: ptBR.Landing.nav.dashboard })[0],
    ).toHaveAttribute("href", "/");
    expect(
      screen.queryByRole("link", { name: ptBR.Landing.nav.login }),
    ).toBeNull();
  });
});
