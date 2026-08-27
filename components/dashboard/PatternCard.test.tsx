import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import type { PatternListItem } from "@/lib/api-client";
import { PatternCard } from "./PatternCard";
import { useDashboardStore } from "@/lib/dashboardStore";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

const PATTERN: PatternListItem = {
  id: "p1",
  name: "Blusa manga longa",
  garmentType: "blouse",
  updatedAt: "2026-08-22T00:00:00.000Z",
  thumbnailSvg: "<svg />",
};

const rename = vi.fn();
const remove = vi.fn();

describe("PatternCard", () => {
  beforeEach(() => {
    rename.mockReset();
    remove.mockReset();
    useDashboardStore.setState({ rename, remove });
  });

  // #45: the thumbnail button was the ONLY way to open a pattern (the name
  // renders as a plain span, not a link) and its only child was an
  // unlabelled injected SVG -- a screen-reader user tabbing the grid heard
  // "botão" with no name, for every card.
  it("gives the open button an accessible name from the pattern name", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: PATTERN.name }));
    expect(onOpen).toHaveBeenCalledWith("p1");
  });

  it("hides the decorative thumbnail SVG from the accessibility tree", () => {
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={vi.fn()} />);
    const button = screen.getByRole("button", { name: PATTERN.name });
    const svgWrapper = button.querySelector("span[aria-hidden='true']");
    expect(svgWrapper).not.toBeNull();
  });

  it("still opens a blank pattern via its accessible fallback text", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const blank = { ...PATTERN, garmentType: null };
    renderWithIntl(<PatternCard pattern={blank} onOpen={onOpen} />);

    await user.click(screen.getByRole("button", { name: blank.name }));
    expect(onOpen).toHaveBeenCalledWith("p1");
    expect(screen.getByText(ptBR.PatternCard.blankLabel)).toBeVisible();
  });

  it("deletes only after the confirmation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.PatternCard.menuAriaLabel }),
    );
    await user.click(await screen.findByText(ptBR.PatternCard.deleteOption));
    expect(remove).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: ptBR.PatternCard.deleteConfirmButton,
      }),
    );
    expect(remove).toHaveBeenCalledWith("p1");
  });
});

// ---------------------------------------------------------------------------
// #168: the rename dialog. It replaced a `window.prompt` (#114), and the
// three guards it gained in the process are precisely the ones a prompt did
// not have -- and all three fail SILENTLY if dropped: an unchanged name
// still issues a PATCH (a pointless write, and an updatedAt bump that
// re-sorts the grid for no reason), a whitespace-only name reaches a route
// that rejects it, and a cancelled dialog leaves its draft behind so the
// next open starts from someone else's abandoned edit.
// ---------------------------------------------------------------------------

/** Opens the "⋯" menu and picks one of its two items. */
async function openMenu(
  user: ReturnType<typeof userEvent.setup>,
  option: string,
) {
  await user.click(
    screen.getByRole("button", { name: ptBR.PatternCard.menuAriaLabel }),
  );
  await user.click(screen.getByRole("menuitem", { name: option }));
}

function renameField() {
  return screen.getByLabelText(ptBR.PatternCard.renamePrompt);
}

function saveRename() {
  return screen.getByRole("button", {
    name: ptBR.PatternCard.renameSaveButton,
  });
}

describe("PatternCard rename", () => {
  beforeEach(() => {
    rename.mockReset();
    remove.mockReset();
    useDashboardStore.setState({ rename, remove });
  });

  it("opens the dialog prefilled with the current name", async () => {
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.PatternCard.renameOption);

    expect(screen.getByText(ptBR.PatternCard.renameTitle)).toBeVisible();
    expect(renameField()).toHaveValue(PATTERN.name);
  });

  it("caps the field at the same length the PATCH route enforces", async () => {
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.PatternCard.renameOption);

    // The field stops you here instead of the request failing after a round
    // trip -- MAX_PATTERN_NAME_LENGTH is read from lib/types, not pasted.
    expect(renameField()).toHaveAttribute(
      "maxLength",
      String(MAX_PATTERN_NAME_LENGTH),
    );
  });

  it("renames with the trimmed value and closes", async () => {
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.PatternCard.renameOption);
    await user.clear(renameField());
    await user.type(renameField(), "  Vestido midi  ");
    await user.click(saveRename());

    expect(rename).toHaveBeenCalledWith(PATTERN.id, "Vestido midi");
    expect(screen.queryByText(ptBR.PatternCard.renameTitle)).toBeNull();
  });

  // A no-op PATCH still bumps updatedAt, which re-sorts the grid under the
  // user for a rename they did not actually make.
  it("issues no request when the name is unchanged", async () => {
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.PatternCard.renameOption);
    await user.click(saveRename());

    expect(rename).not.toHaveBeenCalled();
    expect(screen.queryByText(ptBR.PatternCard.renameTitle)).toBeNull();
  });

  it("keeps save disabled for a blank or whitespace-only name", async () => {
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.PatternCard.renameOption);
    await user.clear(renameField());
    expect(saveRename()).toBeDisabled();

    await user.type(renameField(), "   ");
    expect(saveRename()).toBeDisabled();
    expect(rename).not.toHaveBeenCalled();
  });

  it("discards the draft on cancel and reopens from the stored name", async () => {
    renderWithIntl(<PatternCard pattern={PATTERN} onOpen={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.PatternCard.renameOption);
    await user.clear(renameField());
    await user.type(renameField(), "abandonado");
    await user.click(
      screen.getByRole("button", { name: ptBR.PatternCard.renameCancelButton }),
    );
    expect(rename).not.toHaveBeenCalled();

    // The open handler is what resets the draft, so this is the assertion
    // that it actually does.
    await openMenu(user, ptBR.PatternCard.renameOption);
    expect(renameField()).toHaveValue(PATTERN.name);
  });
});
