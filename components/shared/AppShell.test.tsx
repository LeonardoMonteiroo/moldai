import { describe, it, expect, vi } from "vitest";
import { renderWithIntl, screen } from "@/components/test-utils";
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
});
