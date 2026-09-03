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

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const { listPatterns, getAccountSummary, listSizeCharts, generate } =
  vi.hoisted(() => ({
    listPatterns: vi.fn(),
    getAccountSummary: vi.fn(),
    listSizeCharts: vi.fn(),
    generate: vi.fn(),
  }));

vi.mock("@/lib/api-client", () => ({
  listPatterns,
  getAccountSummary,
  listSizeCharts,
  generate,
  createPattern: vi.fn(),
  renamePattern: vi.fn(),
  deletePattern: vi.fn(),
  recordChecklistEvent: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useDashboardStore.setState({
    ready: false,
    error: false,
    patterns: [],
    credits: null,
    checklist: null,
    recentUsage: [],
    search: "",
    typeFilter: "all",
    actionError: null,
    creatingFromForm: false,
    pendingPatternId: null,
  });
  listSizeCharts.mockResolvedValue([]);
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
      screen.queryByRole("button", { name: ptBR.PageHeader.backTitle }),
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

  // The "＋ Novo molde" button moved from the (always-rendered) sidebar into
  // PatternGrid's own heading row, matching Dashboard.dc.html's DOM order —
  // that row is part of the content region, which a load error replaces
  // outright, so the button is genuinely absent now rather than merely
  // disabled.
  it("has no create-pattern button while in the error state", async () => {
    listPatterns.mockRejectedValue(new Error("boom"));
    getAccountSummary.mockRejectedValue(new Error("boom"));

    renderWithIntl(<DashboardShell userEmail="a@b.com" />);

    await waitFor(() =>
      expect(
        screen.getByText(ptBR.DashboardShell.loadError),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: ptBR.PatternGrid.newPatternButton }),
    ).not.toBeInTheDocument();
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
      checklist: {
        hasCustomSizeChart: false,
        hasExported: false,
        hasImported: false,
      },
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

  // Every "new pattern" affordance now opens Dashboard.dc.html's chooser
  // first, rather than creating a blank pattern outright -- so the empty
  // state's action reaches creation through the chooser's own prompt option,
  // not directly.
  it("wires the empty-state action through the chooser to pattern creation", async () => {
    const { createPattern } = await import("@/lib/api-client");
    vi.mocked(createPattern).mockResolvedValue({ id: "new-1" });
    const user = userEvent.setup();

    renderWithIntl(<DashboardShell userEmail="user@example.com" />);

    await user.click(
      await screen.findByRole("button", {
        name: ptBR.PatternGrid.emptyAction,
      }),
    );
    // Nothing created yet: the chooser is the first thing that happens.
    expect(createPattern).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(ptBR.NewPatternDialog.promptOption.title),
      }),
    );
    expect(createPattern).toHaveBeenCalledTimes(1);
  });
});

describe("DashboardShell — the form step", () => {
  const tForm = ptBR.NewPatternForm;

  async function openForm() {
    const user = userEvent.setup();
    renderWithIntl(<DashboardShell userEmail="user@example.com" />);
    await user.click(
      await screen.findByRole("button", {
        name: ptBR.PatternGrid.emptyAction,
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(ptBR.NewPatternDialog.formOption.title),
      }),
    );
    return user;
  }

  async function submitForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: tForm.submit }));
  }

  // PFORM-06
  it("opens the editor for the pattern a successful submit produced", async () => {
    const { createPattern } = await import("@/lib/api-client");
    vi.mocked(createPattern).mockResolvedValue({ id: "form-1" });
    generate.mockResolvedValue({ status: "ok" });

    const user = await openForm();
    await submitForm(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/pattern/form-1"));
    expect(push).toHaveBeenCalledTimes(1);
  });

  // The spec's own assumption: ask and decline are successes. The chat holds
  // the model's question or refusal, and the editor is where it is answered.
  it.each([["clarify"], ["declined"]])(
    "still opens the editor when the model answered %s",
    async (status) => {
      const { createPattern } = await import("@/lib/api-client");
      vi.mocked(createPattern).mockResolvedValue({ id: "form-2" });
      generate.mockResolvedValue({ status });

      const user = await openForm();
      await submitForm(user);

      await waitFor(() => expect(push).toHaveBeenCalledWith("/pattern/form-2"));
    },
  );

  // PFORM-09: the dialog stays open, holding everything that was filled in.
  it("keeps the dialog open with the failure's own message when a submit fails", async () => {
    const { createPattern } = await import("@/lib/api-client");
    vi.mocked(createPattern).mockResolvedValue({ id: "form-3" });
    generate.mockResolvedValue({ status: "error" });

    const user = await openForm();
    await user.type(screen.getByLabelText(tForm.field.name), "Blusa");
    await submitForm(user);

    await waitFor(() =>
      expect(screen.getByText(tForm.errors.create_failed)).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
    // Still filled in, so the retry costs the user nothing to re-enter.
    expect(screen.getByLabelText(tForm.field.name)).toHaveValue("Blusa");
    // And the screen's own shared notice is there behind it.
    expect(
      screen.getByText(ptBR.ActionErrorNotice.message),
    ).toBeInTheDocument();
  });

  // PFORM-08. The store keeps pendingPatternId alive precisely so the retry
  // resumes the same blank Pattern instead of leaving one orphaned per
  // attempt.
  it("reuses the same pattern when a submit is retried after a 402", async () => {
    const { createPattern } = await import("@/lib/api-client");
    vi.mocked(createPattern).mockResolvedValue({ id: "form-4" });
    generate.mockResolvedValue({
      status: "insufficient_credits",
      required: 1,
      balance: 0,
    });

    const user = await openForm();
    await submitForm(user);
    await waitFor(() =>
      expect(
        screen.getByText(tForm.errors.insufficient_credits),
      ).toBeInTheDocument(),
    );

    generate.mockResolvedValue({ status: "ok" });
    await submitForm(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/pattern/form-4"));
    expect(createPattern).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  // PFORM-07
  it("disables the form and refuses to close while the round trip is in flight", async () => {
    const user = await openForm();
    useDashboardStore.setState({ creatingFromForm: true });

    await waitFor(() =>
      expect(screen.getByLabelText(tForm.field.name)).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: tForm.back })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(screen.getByLabelText(tForm.field.name)).toBeInTheDocument();
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
      checklist: {
        hasCustomSizeChart: false,
        hasExported: false,
        hasImported: false,
      },
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

describe("DashboardShell onboarding checklist (#232)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    listPatterns.mockResolvedValue([]);
    getAccountSummary.mockResolvedValue({
      credits: { plan: "free", balance: 30, total: 30, renewsInDays: 30 },
      recentUsage: [],
      checklist: {
        hasCustomSizeChart: false,
        hasExported: false,
        hasImported: false,
      },
    });
  });

  it("renders the checklist once the summary loads", async () => {
    renderWithIntl(<DashboardShell userEmail="user@example.com" />);
    expect(
      await screen.findByText(ptBR.OnboardingChecklistCard.title, {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("stays hidden when already dismissed", async () => {
    window.localStorage.setItem("moldai.onboardingChecklistDismissed", "1");
    renderWithIntl(<DashboardShell userEmail="user@example.com" />);
    await waitFor(() => expect(useDashboardStore.getState().ready).toBe(true));
    expect(
      screen.queryByText(ptBR.OnboardingChecklistCard.title, { exact: false }),
    ).not.toBeInTheDocument();
  });
});

// DASH-05/06: docs/design/screens/Dashboard.dc.html:104 wraps the whole
// content column in one `padding: 22px` box with a flat `gap: 16px` between
// its children -- the 22px top inset must apply exactly once, not stack with
// PatternGrid's own top padding into a 38px gap under the checklist card.
describe("DashboardShell content spacing (redesign)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    listPatterns.mockResolvedValue([]);
    getAccountSummary.mockResolvedValue({
      credits: { plan: "free", balance: 30, total: 30, renewsInDays: 30 },
      recentUsage: [],
      checklist: {
        hasCustomSizeChart: false,
        hasExported: false,
        hasImported: false,
      },
    });
  });

  it("gives the content column a single 22px top inset, not a doubled one under the checklist", async () => {
    renderWithIntl(<DashboardShell userEmail="user@example.com" />);
    const title = await screen.findByText(ptBR.OnboardingChecklistCard.title, {
      exact: false,
    });

    // The scrollable content column owns the 22px top inset exactly once...
    const column = title.closest('[class*="pt-[22px]"]');
    expect(column).not.toBeNull();

    // ...so the pattern grid below the checklist must not add a second one
    // (distinguished from the credits/usage row, which shares the same
    // px-[22px]/pb-[22px] pair but also carries sm:flex-row).
    const gridRoot = column!.querySelector(
      '[class*="px-[22px]"][class*="pb-[22px]"]:not([class*="sm:flex-row"])',
    );
    expect(gridRoot).not.toBeNull();
    expect(gridRoot).not.toHaveClass("pt-[22px]");
    expect(gridRoot).not.toHaveClass("p-[22px]");
  });

  // P2 AC2: with the checklist dismissed, the wrapper's pt-[22px] is the
  // ONLY source of the pattern grid's top inset -- PatternGrid itself must
  // not compensate by re-adding its own top padding.
  it("still gives the pattern grid a 22px top inset when the checklist is dismissed", async () => {
    window.localStorage.setItem("moldai.onboardingChecklistDismissed", "1");
    const { container } = renderWithIntl(
      <DashboardShell userEmail="user@example.com" />,
    );

    const empty = await screen.findByText(ptBR.PatternGrid.emptyTitle);
    expect(
      screen.queryByText(ptBR.OnboardingChecklistCard.title, {
        exact: false,
      }),
    ).not.toBeInTheDocument();

    const column = container.querySelector('[class*="pt-[22px]"]');
    expect(column).not.toBeNull();
    expect(column!.contains(empty)).toBe(true);

    const gridRoot = column!.querySelector(
      '[class*="px-[22px]"][class*="pb-[22px]"]:not([class*="sm:flex-row"])',
    );
    expect(gridRoot).not.toBeNull();
    expect(gridRoot).not.toHaveClass("pt-[22px]");
    expect(gridRoot).not.toHaveClass("p-[22px]");
  });
});
