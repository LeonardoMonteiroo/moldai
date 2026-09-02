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
    renderWithIntl(<Sidebar active="patterns" onNewPattern={vi.fn()} />);

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
    renderWithIntl(<Sidebar active="slopers" onNewPattern={vi.fn()} />);

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
    renderWithIntl(<Sidebar active="patterns" onNewPattern={vi.fn()} />);

    const active = screen.getByRole("button", {
      name: ptBR.Sidebar.myPatternsLabel,
    });
    expect(active).toHaveAttribute("aria-current", "page");

    await user.tab();
    expect(active).toHaveFocus();
  });

  it("does not mark an inactive entry as the current page", () => {
    renderWithIntl(<Sidebar active="patterns" onNewPattern={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: ptBR.Sidebar.studioBasesLabel }),
    ).not.toHaveAttribute("aria-current");
  });

  it("delegates the new-pattern click to its owner screen", async () => {
    const onNewPattern = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="patterns" onNewPattern={onNewPattern} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.Sidebar.newPatternButton }),
    );
    expect(onNewPattern).toHaveBeenCalledTimes(1);
  });

  // Issue #11: the import entry used to be an inert dashed placeholder
  // advertising formats nothing parsed (Audaces/Molde.me native + .dxf). It
  // is now a real control navigating to the DXF import first pass, and its
  // label names only the format actually read.
  it("navigates to the import screen — the entry is no longer a placeholder", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="patterns" onNewPattern={vi.fn()} />);

    const entry = screen.getByRole("button", {
      name: ptBR.Sidebar.importLabel,
    });
    expect(entry).toBeEnabled();
    await user.click(entry);
    expect(push).toHaveBeenCalledWith("/import");
    // /import renders no sidebar, so this entry is never the active one.
    expect(entry).not.toHaveAttribute("aria-current");
  });

  it("marks the active section and navigates home from the size-charts screen", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="size-charts" onNewPattern={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: ptBR.Sidebar.measurementsLabel }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(
      screen.getByRole("button", { name: ptBR.Sidebar.myPatternsLabel }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  it("omits the new-pattern button when the screen owns no such action", () => {
    renderWithIntl(<Sidebar active="size-charts" />);

    expect(
      screen.queryByRole("button", { name: ptBR.Sidebar.newPatternButton }),
    ).not.toBeInTheDocument();
  });
});
