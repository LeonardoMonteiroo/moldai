import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
  translatorFor,
} from "@/components/test-utils";
import type { PatternListItem } from "@/lib/api-client";
import { useDashboardStore } from "@/lib/dashboardStore";
import { PatternGrid } from "./PatternGrid";

const PATTERN: PatternListItem = {
  id: "p1",
  name: "Blusa manga longa",
  garmentType: "blouse",
  updatedAt: "2026-08-22T00:00:00.000Z",
  thumbnailSvg: "<svg />",
};

beforeEach(() => {
  useDashboardStore.setState({
    patterns: [],
    search: "",
    typeFilter: "all",
  });
});

describe("PatternGrid", () => {
  // #114: the truly-empty state (no patterns at all, as opposed to a
  // search/filter with no matches) is the one that offers a primary create
  // action -- the only "novo molde" affordance used to be the sidebar button,
  // diagonally opposite where the eye lands on first load.
  it("offers a primary create action when there are no patterns at all", async () => {
    const onNewPattern = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <PatternGrid onOpen={vi.fn()} onNewPattern={onNewPattern} />,
    );

    const button = screen.getByRole("button", {
      name: ptBR.PatternGrid.emptyAction,
    });
    await user.click(button);
    expect(onNewPattern).toHaveBeenCalledTimes(1);
  });

  it("does not offer the create action once a pattern exists", () => {
    useDashboardStore.setState({ patterns: [PATTERN] });
    renderWithIntl(<PatternGrid onOpen={vi.fn()} onNewPattern={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: ptBR.PatternGrid.emptyAction }),
    ).not.toBeInTheDocument();
  });

  // A search/filter with no matches is not the same state as a genuinely
  // empty account -- offering "create your first pattern" there would be
  // misleading (patterns already exist, just not visible under this filter).
  it("does not offer the create action when a filter simply has no matches", () => {
    useDashboardStore.setState({ patterns: [PATTERN], search: "vestido" });
    renderWithIntl(<PatternGrid onOpen={vi.fn()} onNewPattern={vi.fn()} />);

    expect(
      screen.getByText(ptBR.PatternGrid.noMatchesTitle),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ptBR.PatternGrid.emptyAction }),
    ).not.toBeInTheDocument();
  });

  // #114: PatternGrid used to own its own `fill`-ed ScrollArea, which forced
  // it to stretch to the viewport's full height regardless of content --
  // DashboardShell now owns the single scroll region instead, so this
  // component renders as plain natural-flow content.
  it("renders no scroll region of its own", () => {
    const { container } = renderWithIntl(
      <PatternGrid onOpen={vi.fn()} onNewPattern={vi.fn()} />,
    );
    expect(container.querySelector('[data-slot="scroll-area"]')).toBeNull();
  });

  // #106: CLDR puts 0 in pt's "one" plural category, so the count label
  // read "0 molde" on an empty dashboard -- correct by CLDR, wrong in
  // Brazilian usage. Covers 0 (the explicit =0 branch), 1 and 2.
  it("reads 'Nenhum molde' for zero, and pluralizes correctly at 1 and 2", () => {
    const tGrid = translatorFor("PatternGrid");

    useDashboardStore.setState({ patterns: [] });
    const zero = renderWithIntl(
      <PatternGrid onOpen={vi.fn()} onNewPattern={vi.fn()} />,
    );
    expect(
      screen.getByText(tGrid("countLabel", { count: 0 })),
    ).toBeInTheDocument();
    expect(tGrid("countLabel", { count: 0 })).toBe("Nenhum molde");
    zero.unmount();

    useDashboardStore.setState({ patterns: [PATTERN] });
    const one = renderWithIntl(
      <PatternGrid onOpen={vi.fn()} onNewPattern={vi.fn()} />,
    );
    expect(
      screen.getByText(tGrid("countLabel", { count: 1 })),
    ).toBeInTheDocument();
    one.unmount();

    useDashboardStore.setState({
      patterns: [PATTERN, { ...PATTERN, id: "p2" }],
    });
    const two = renderWithIntl(
      <PatternGrid onOpen={vi.fn()} onNewPattern={vi.fn()} />,
    );
    expect(
      screen.getByText(tGrid("countLabel", { count: 2 })),
    ).toBeInTheDocument();
    two.unmount();
  });
});
