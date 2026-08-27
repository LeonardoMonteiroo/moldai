import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { ConflictActions } from "./ConflictActions";

const catalog = ptBR.ConflictActions;

describe("ConflictActions", () => {
  it("offers only live actions — the difference is shown, not gated behind a button", () => {
    renderWithIntl(<ConflictActions onFix={() => {}} onIgnore={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      catalog.fixButton,
      catalog.ignoreButton,
    ]);
    for (const button of buttons) expect(button).toBeEnabled();
    expect(screen.getByText(catalog.freeNote)).toBeInTheDocument();
  });

  it("runs the fix and the ignore handlers", async () => {
    const onFix = vi.fn();
    const onIgnore = vi.fn();
    renderWithIntl(<ConflictActions onFix={onFix} onIgnore={onIgnore} />);
    await userEvent.click(
      screen.getByRole("button", { name: catalog.fixButton }),
    );
    expect(onFix).toHaveBeenCalledOnce();
    await userEvent.click(
      screen.getByRole("button", { name: catalog.ignoreButton }),
    );
    expect(onIgnore).toHaveBeenCalledOnce();
  });

  // #134: a conflict made entirely of non-armhole-cap divergences (e.g. the
  // dress waist-join gap) has no automatic fix -- offering "Corrigir manga"
  // there would silently do nothing for what's actually wrong.
  it("hides the fix button (and its free-note) when fixable is false", () => {
    renderWithIntl(
      <ConflictActions onFix={() => {}} onIgnore={() => {}} fixable={false} />,
    );
    expect(
      screen.queryByRole("button", { name: catalog.fixButton }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: catalog.ignoreButton }),
    ).toBeInTheDocument();
    expect(screen.queryByText(catalog.freeNote)).not.toBeInTheDocument();
  });
});
