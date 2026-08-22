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

    // Header: no back button and no title (the dashboard IS "/", and its
    // sidebar already names the section), no credits bar yet, but the account
    // menu is already reachable.
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
    // region rather than replacing the screen. getAllByText pins the COUNT:
    // "Meus moldes" must appear exactly once. A header title would make it two,
    // which is the duplication this screen deliberately avoids.
    expect(screen.getAllByText(ptBR.Sidebar.myPatternsLabel)).toHaveLength(1);
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
    // The header and nav survive the error — still exactly one "Meus moldes".
    expect(
      screen.getByRole("button", { name: ptBR.PageHeader.accountMenuLabel }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(ptBR.Sidebar.myPatternsLabel)).toHaveLength(1);
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

// Opening a deleted or someone else's pattern redirected to "/" with no
// explanation at all — you just landed on the dashboard wondering why.
describe("DashboardShell missing-pattern notice", () => {
  beforeEach(() => {
    listPatterns.mockResolvedValue([]);
    getAccountSummary.mockResolvedValue({
      credits: { plan: "free", balance: 30, total: 30, renewsInDays: 30 },
      recentUsage: [],
    });
  });

  it("explains why you were sent back to the dashboard", async () => {
    renderWithIntl(
      <DashboardShell userEmail="user@example.com" patternMissing />,
    );

    expect(
      await screen.findByText(ptBR.DashboardShell.patternMissing),
    ).toBeInTheDocument();
  });

  it("says nothing on a normal visit", async () => {
    renderWithIntl(<DashboardShell userEmail="user@example.com" />);

    await waitFor(() => expect(useDashboardStore.getState().ready).toBe(true));
    expect(
      screen.queryByText(ptBR.DashboardShell.patternMissing),
    ).not.toBeInTheDocument();
  });
});
