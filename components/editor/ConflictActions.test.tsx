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
});
