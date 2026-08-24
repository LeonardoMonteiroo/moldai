import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  waitFor,
  userEvent,
} from "@/components/test-utils";
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

// #114: the grid used to own its own `fill`-ed scroll region, stretching to
// the viewport's full height regardless of content and pinning the summary
// cards to the bottom edge, far from the (possibly empty) grid above them.
describe("DashboardShell empty-grid layout (#114)", () => {
  beforeEach(() => {
    listPatterns.mockResolvedValue([]);
    getAccountSummary.mockResolvedValue({
      credits: { plan: "free", balance: 30, total: 30, renewsInDays: 30 },
      recentUsage: [],
    });
  });

  it("wraps the grid and the summary cards in one scroll region", async () => {
    const { container } = renderWithIntl(
      <DashboardShell userEmail="user@example.com" />,
    );

    const empty = await screen.findByText(ptBR.PatternGrid.emptyTitle);
    const regions = container.querySelectorAll('[data-slot="scroll-area"]');
    expect(regions).toHaveLength(1);
    // Both the (empty) grid and the credits card are descendants of the same
    // single scroll region -- not the grid alone force-stretched with the
    // cards pinned outside it.
    expect(regions[0].contains(empty)).toBe(true);
    expect(
      regions[0].querySelector(`[data-slot="empty-content"]`),
    ).not.toBeNull();
  });

  it("wires the empty-state create action through to pattern creation", async () => {
    const { createPattern } = await import("@/lib/api-client");
    vi.mocked(createPattern).mockResolvedValue({ id: "new-1" });
    const user = userEvent.setup();

    renderWithIntl(<DashboardShell userEmail="user@example.com" />);

    const button = await screen.findByRole("button", {
      name: ptBR.PatternGrid.emptyAction,
    });
    await user.click(button);
    expect(createPattern).toHaveBeenCalledTimes(1);
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
