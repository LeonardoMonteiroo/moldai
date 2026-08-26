import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const CREDITS: Credits = {
  plan: "atelier",
  balance: 320,
  total: 500,
  renewsInDays: 12,
};

describe("AppShell", () => {
  it("renders the header title and the children", () => {
    renderWithIntl(
      <AppShell title="Configurações" credits={CREDITS} userEmail="a@b.com">
        <span>CONTENT</span>
      </AppShell>,
    );
    expect(screen.getByText("Configurações")).toBeInTheDocument();
    expect(screen.getByText("CONTENT")).toBeInTheDocument();
  });

  it("renders the sidebar and footer slots only when passed", () => {
    const { unmount } = renderWithIntl(
      <AppShell title="Blusa" credits={CREDITS} userEmail="a@b.com">
        <span>CONTENT</span>
      </AppShell>,
    );
    expect(screen.queryByText("SIDEBAR")).not.toBeInTheDocument();
    expect(screen.queryByText("FOOTER")).not.toBeInTheDocument();
    unmount();

    renderWithIntl(
      <AppShell
        title="Blusa"
        credits={CREDITS}
        userEmail="a@b.com"
        sidebar={<span>SIDEBAR</span>}
        footer={<span>FOOTER</span>}
      >
        <span>CONTENT</span>
      </AppShell>,
    );
    expect(screen.getByText("SIDEBAR")).toBeInTheDocument();
    expect(screen.getByText("FOOTER")).toBeInTheDocument();
  });

  it("passes a null credits through to the header without crashing", () => {
    renderWithIntl(
      <AppShell title="Meus moldes" credits={null} userEmail="a@b.com">
        <span>CONTENT</span>
      </AppShell>,
    );
    expect(screen.getByText("Meus moldes")).toBeInTheDocument();
  });

  // #48: no screen offered a banner/main landmark or an h1 -- a screen-reader
  // user had nothing to jump to and "list headings" returned nothing (or an
  // h2 with no h1 above it, since /settings sections already start at h2).
  describe("landmarks and heading (#48)", () => {
    it("exposes a banner and a main landmark", () => {
      renderWithIntl(
        <AppShell title="Configurações" credits={CREDITS} userEmail="a@b.com">
          <span>CONTENT</span>
        </AppShell>,
      );
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
    });

    it("promotes the title to an h1 when one is given", () => {
      renderWithIntl(
        <AppShell title="Configurações" credits={CREDITS} userEmail="a@b.com">
          <span>CONTENT</span>
        </AppShell>,
      );
      expect(
        screen.getByRole("heading", { level: 1, name: "Configurações" }),
      ).toBeInTheDocument();
    });

    // The dashboard is the one screen that renders no title (its sidebar
    // already names "Meus moldes") -- it must not gain an empty <h1>, and
    // must not duplicate that sidebar text into a second element, which
    // would break DashboardShell.test.tsx's pinned
    // getAllByText(ptBR.Sidebar.myPatternsLabel) -> length 1 assertion.
    it("renders no heading at all when no title is given, rather than an empty one", () => {
      renderWithIntl(
        <AppShell credits={CREDITS} userEmail="a@b.com">
          <span>CONTENT</span>
        </AppShell>,
      );
      expect(
        screen.queryByRole("heading", { level: 1 }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
    });

    it("wraps a passed footer in a footer landmark, and omits the landmark entirely when none is passed", () => {
      const { unmount } = renderWithIntl(
        <AppShell title="Blusa" credits={CREDITS} userEmail="a@b.com">
          <span>CONTENT</span>
        </AppShell>,
      );
      expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
      unmount();

      renderWithIntl(
        <AppShell
          title="Blusa"
          credits={CREDITS}
          userEmail="a@b.com"
          footer={<span>FOOTER</span>}
        >
          <span>CONTENT</span>
        </AppShell>,
      );
      const footer = screen.getByRole("contentinfo");
      expect(footer).toContainElement(screen.getByText("FOOTER"));
    });
  });

  // #119: below `lg` a passed sidebar becomes an off-canvas drawer, opened by
  // this toggle -- above `lg` it's the same permanent column it always was
  // (CSS-driven, not asserted here since jsdom doesn't evaluate media
  // queries; what's tested is the toggle's own accessible state).
  describe("collapsible sidebar (#119)", () => {
    it("renders no toggle when there is no sidebar to collapse", () => {
      renderWithIntl(
        <AppShell title="Blusa" credits={CREDITS} userEmail="a@b.com">
          <span>CONTENT</span>
        </AppShell>,
      );
      expect(
        screen.queryByRole("button", { name: ptBR.AppShell.openNavLabel }),
      ).not.toBeInTheDocument();
    });

    it("opens the drawer and exposes aria-expanded, then closes on toggle", async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <AppShell
          title="Blusa"
          credits={CREDITS}
          userEmail="a@b.com"
          sidebar={<span>SIDEBAR</span>}
        >
          <span>CONTENT</span>
        </AppShell>,
      );

      const toggle = screen.getByRole("button", {
        name: ptBR.AppShell.openNavLabel,
      });
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      await user.click(toggle);
      expect(
        screen.getByRole("button", { name: ptBR.AppShell.closeNavLabel }),
      ).toHaveAttribute("aria-expanded", "true");

      await user.click(
        screen.getByRole("button", { name: ptBR.AppShell.closeNavLabel }),
      );
      expect(
        screen.getByRole("button", { name: ptBR.AppShell.openNavLabel }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("closes the drawer on Escape", async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <AppShell
          title="Blusa"
          credits={CREDITS}
          userEmail="a@b.com"
          sidebar={<span>SIDEBAR</span>}
        >
          <span>CONTENT</span>
        </AppShell>,
      );

      await user.click(
        screen.getByRole("button", { name: ptBR.AppShell.openNavLabel }),
      );
      expect(
        screen.getByRole("button", { name: ptBR.AppShell.closeNavLabel }),
      ).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(
        screen.getByRole("button", { name: ptBR.AppShell.openNavLabel }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    // Escape (and a backdrop click) close from focus that wasn't on the
    // toggle -- without returning it, the next Tab restarted from the top of
    // the page instead of continuing from where the user was.
    it("returns focus to the toggle button after closing on Escape", async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <AppShell
          title="Blusa"
          credits={CREDITS}
          userEmail="a@b.com"
          sidebar={<span>SIDEBAR</span>}
        >
          <span>CONTENT</span>
        </AppShell>,
      );

      await user.click(
        screen.getByRole("button", { name: ptBR.AppShell.openNavLabel }),
      );
      await user.keyboard("{Escape}");

      expect(
        screen.getByRole("button", { name: ptBR.AppShell.openNavLabel }),
      ).toHaveFocus();
    });

    // Content sitting behind the dimmed overlay must not be keyboard/AT
    // reachable while the drawer is open, or Tab leaks from the drawer into
    // the page behind it.
    it("makes the main content region inert while the drawer is open", async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <AppShell
          title="Blusa"
          credits={CREDITS}
          userEmail="a@b.com"
          sidebar={<span>SIDEBAR</span>}
        >
          <span>CONTENT</span>
        </AppShell>,
      );

      const main = screen.getByRole("main");
      expect(main).not.toHaveAttribute("inert");

      await user.click(
        screen.getByRole("button", { name: ptBR.AppShell.openNavLabel }),
      );
      expect(main).toHaveAttribute("inert");
    });

    // #119 review: a same-route navigation (router.replace, e.g. the
    // settings sidebar's own `?section=` links) doesn't unmount AppShell the
    // way a real router.push does, so the drawer used to stay open (and its
    // scrim up) after picking a section on a narrow viewport.
    it("closes the drawer on any click inside it, not just the toggle", async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <AppShell
          title="Blusa"
          credits={CREDITS}
          userEmail="a@b.com"
          sidebar={
            <button type="button" onClick={() => {}}>
              NAV ITEM
            </button>
          }
        >
          <span>CONTENT</span>
        </AppShell>,
      );

      await user.click(
        screen.getByRole("button", { name: ptBR.AppShell.openNavLabel }),
      );
      expect(
        screen.getByRole("button", { name: ptBR.AppShell.closeNavLabel }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "NAV ITEM" }));
      expect(
        screen.getByRole("button", { name: ptBR.AppShell.openNavLabel }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("controls the sidebar drawer via aria-controls", () => {
      renderWithIntl(
        <AppShell
          title="Blusa"
          credits={CREDITS}
          userEmail="a@b.com"
          sidebar={<span>SIDEBAR</span>}
        >
          <span>CONTENT</span>
        </AppShell>,
      );

      const toggle = screen.getByRole("button", {
        name: ptBR.AppShell.openNavLabel,
      });
      const controlledId = toggle.getAttribute("aria-controls");
      expect(controlledId).toBeTruthy();
      expect(document.getElementById(controlledId!)).toContainElement(
        screen.getByText("SIDEBAR"),
      );
    });
  });
});
