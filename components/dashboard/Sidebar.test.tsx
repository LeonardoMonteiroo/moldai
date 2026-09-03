import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import { Sidebar } from "./Sidebar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("Sidebar", () => {
  beforeEach(() => push.mockReset());

  it("navigates to the slopers screen — the entry is no longer coming soon", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="patterns" />);

    const entry = screen.getByRole("button", {
      name: ptBR.Sidebar.studioBasesLabel,
    });
    expect(entry).toBeEnabled();
    await user.click(entry);
    expect(push).toHaveBeenCalledWith("/slopers");
    expect(
      screen.queryByText(ptBR.Sidebar.comingSoonBadge),
    ).not.toBeInTheDocument();
  });

  it("marks the active section and navigates home from the slopers screen", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="slopers" />);

    expect(
      screen.getByRole("button", { name: ptBR.Sidebar.studioBasesLabel }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(
      screen.getByRole("button", { name: ptBR.Sidebar.myPatternsLabel }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  // #22: the active entry used to render as a plain <span> -- unreachable by
  // keyboard tabbing, and with no programmatic way to tell it's the current
  // page. It's a real button now, marked aria-current="page".
  it("makes the active entry focusable and exposes it as the current page", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="patterns" />);

    const active = screen.getByRole("button", {
      name: ptBR.Sidebar.myPatternsLabel,
    });
    expect(active).toHaveAttribute("aria-current", "page");

    await user.tab();
    expect(active).toHaveFocus();
  });

  it("does not mark an inactive entry as the current page", () => {
    renderWithIntl(<Sidebar active="patterns" />);

    expect(
      screen.getByRole("button", { name: ptBR.Sidebar.studioBasesLabel }),
    ).not.toHaveAttribute("aria-current");
  });

  // Dashboard.dc.html's sidebar is these three sections only. Importing a
  // .dxf is a way to START a pattern, not a section of the app, so it lives
  // in NewPatternDialog's chooser instead. The entry here (issue #11)
  // predated that chooser, when the grid card was still an inert "em breve"
  // placeholder and this was the only real way in.
  it("lists exactly the design's three sections, with no import entry", () => {
    renderWithIntl(<Sidebar active="patterns" />);

    const entries = screen.getAllByRole("button");
    expect(entries.map((e) => e.textContent?.trim())).toEqual([
      ptBR.Sidebar.myPatternsLabel,
      ptBR.Sidebar.measurementsLabel,
      ptBR.Sidebar.studioBasesLabel,
    ]);
  });

  it("marks the active section and navigates home from the size-charts screen", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="size-charts" />);

    expect(
      screen.getByRole("button", { name: ptBR.Sidebar.measurementsLabel }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(
      screen.getByRole("button", { name: ptBR.Sidebar.myPatternsLabel }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  // Dashboard.dc.html gives every nav entry its own lucide icon
  // (Folder/Ruler/Layers) -- a plain-text row was a real, confirmed gap
  // against that source markup, not a viewport artifact of the design
  // screenshots (which are captured narrower than this app and reflow).
  it("renders a distinct icon svg for every nav entry", () => {
    renderWithIntl(<Sidebar active="patterns" />);

    const labels = [
      ptBR.Sidebar.myPatternsLabel,
      ptBR.Sidebar.measurementsLabel,
      ptBR.Sidebar.studioBasesLabel,
    ];
    for (const name of labels) {
      const entry = screen.getByRole("button", { name });
      expect(entry.querySelector("svg")).toBeInTheDocument();
    }
  });

  // Dashboard.dc.html's sidebar is nav-only -- no persistent "＋ Novo molde"
  // button below the nav list (that action now lives in PatternGrid's own
  // heading row, matching the design's own DOM order).
  it("renders no new-pattern button of its own", () => {
    renderWithIntl(<Sidebar active="patterns" />);

    expect(
      screen.queryByRole("button", { name: /novo molde/i }),
    ).not.toBeInTheDocument();
  });
});
