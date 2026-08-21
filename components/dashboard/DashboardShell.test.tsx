import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithIntl, ptBR, screen, waitFor } from "@/components/test-utils";
import { useDashboardStore } from "@/lib/dashboardStore";
import { DashboardShell } from "./DashboardShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const { listPatterns, getAccountSummary } = vi.hoisted(() => ({
  listPatterns: vi.fn(),
  getAccountSummary: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  listPatterns,
  getAccountSummary,
  createPattern: vi.fn(),
  renamePattern: vi.fn(),
  deletePattern: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useDashboardStore.setState({
    ready: false,
    error: false,
    patterns: [],
    credits: null,
    recentUsage: [],
    search: "",
    typeFilter: "all",
  });
});

describe("DashboardShell", () => {
  it("paints the header and nav before the summary resolves", async () => {
    // Never resolves: the shell stays in its loading state.
    listPatterns.mockReturnValue(new Promise(() => {}));
    getAccountSummary.mockReturnValue(new Promise(() => {}));

    renderWithIntl(<DashboardShell userEmail="a@b.com" />);

    // Header: title present, no back button (the dashboard IS "/"), no credits
    // bar yet, but the account menu is already reachable.
    // Scoped by selector: DashboardShell.title and Sidebar.myPatternsLabel are
    // both "Meus moldes" (a genuine coincidence, not a bug), so a bare
    // getByText matches both the header title and the sidebar's active nav
    // item. Only the header title span carries font-semibold.
    expect(
      screen.getByText(ptBR.DashboardShell.title, {
        selector: ".font-semibold",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ptBR.PageHeader.backButton }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ptBR.PageHeader.buyCreditsButton }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.PageHeader.accountMenuLabel }),
    ).toBeInTheDocument();

    // Nav column is painted too, and the loading message is in the content
    // region rather than replacing the screen.
    expect(
      screen.getByText(ptBR.Sidebar.myPatternsLabel, {
        selector: ".font-medium",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.DashboardShell.loading)).toBeInTheDocument();
  });

  it("keeps the header when the fetch fails", async () => {
    listPatterns.mockRejectedValue(new Error("boom"));
    getAccountSummary.mockRejectedValue(new Error("boom"));

    renderWithIntl(<DashboardShell userEmail="a@b.com" />);

    await waitFor(() =>
      expect(
        screen.getByText(ptBR.DashboardShell.loadError),
      ).toBeInTheDocument(),
    );
    // Scoped by selector: DashboardShell.title and Sidebar.myPatternsLabel are
    // both "Meus moldes" (a genuine coincidence, not a bug), so a bare
    // getByText matches both the header title and the sidebar's active nav
    // item. Only the header title span carries font-semibold.
    expect(
      screen.getByText(ptBR.DashboardShell.title, {
        selector: ".font-semibold",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.Sidebar.myPatternsLabel, {
        selector: ".font-medium",
      }),
    ).toBeInTheDocument();
  });

  it("disables the create-pattern button while in the error state", async () => {
    listPatterns.mockRejectedValue(new Error("boom"));
    getAccountSummary.mockRejectedValue(new Error("boom"));

    renderWithIntl(<DashboardShell userEmail="a@b.com" />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: ptBR.Sidebar.newPatternButton }),
      ).toBeDisabled(),
    );
  });
});

describe("catalog after the header merge", () => {
  it("no longer carries a DashboardTopbar namespace", () => {
    expect("DashboardTopbar" in ptBR).toBe(false);
  });
});
