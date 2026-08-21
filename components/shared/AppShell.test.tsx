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
});
