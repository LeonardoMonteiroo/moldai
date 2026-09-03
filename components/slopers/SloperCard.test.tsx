import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import type { SloperListItem } from "@/lib/types";
import { SloperCard } from "./SloperCard";
import { useSlopersStore } from "@/lib/slopersStore";

const SLOPER: SloperListItem = {
  id: "s1",
  name: "base corpo reto",
  garmentType: "blouse",
  baseSize: "M",
  sizeChartName: "Feminino adulto · ABNT",
  updatedAt: "2026-08-22T00:00:00.000Z",
  thumbnailSvg: "<svg />",
};

const remove = vi.fn();
const rename = vi.fn();

describe("SloperCard", () => {
  beforeEach(() => {
    remove.mockReset();
    rename.mockReset();
    useSlopersStore.setState({ remove, rename });
  });

  it("shows the garment, base size and source chart", () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    expect(screen.getByText(SLOPER.name)).toBeVisible();
    expect(
      screen.getByText(
        `${ptBR.TechSheetTab.garmentType.blouse} · base ${SLOPER.baseSize}`,
      ),
    ).toBeVisible();
    expect(screen.getByText(SLOPER.sizeChartName!)).toBeVisible();
  });

  // The design overlays a garment-type badge on the thumbnail itself, in
  // addition to the meta line below the name.
  it("badges the thumbnail with the garment type", () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    expect(
      screen.getByText(ptBR.TechSheetTab.garmentType.blouse, {
        selector: "span[data-slot='badge']",
      }),
    ).toBeVisible();
  });

  it("omits the chart line when the base carries no chart name", () => {
    const { sizeChartName: _drop, ...noChart } = SLOPER;
    renderWithIntl(<SloperCard sloper={noChart} onUse={vi.fn()} />);
    expect(screen.queryByText(SLOPER.sizeChartName!)).not.toBeInTheDocument();
  });

  it("uses the base", async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={onUse} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.SloperCard.useButton }),
    );
    expect(onUse).toHaveBeenCalledWith("s1");
  });

  it("deletes only after the confirmation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.SloperCard.menuAriaLabel }),
    );
    await user.click(await screen.findByText(ptBR.SloperCard.deleteOption));
    expect(remove).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: ptBR.SloperCard.deleteConfirmButton }),
    );
    expect(remove).toHaveBeenCalledWith("s1");
  });
});

// ---------------------------------------------------------------------------
// #168: the rename dialog, the same shape (and the same three silent
// failure modes) as PatternCard's -- an unchanged name still issuing a
// PATCH, a whitespace-only name reaching a route that rejects it, and a
// cancelled draft surviving into the next open. Asserted here separately
// rather than shared, because the two cards read different stores and
// different catalog namespaces: a rename recorded on the dashboard's store
// would surface its error on a screen that isn't showing.
// ---------------------------------------------------------------------------

async function openMenu(
  user: ReturnType<typeof userEvent.setup>,
  option: string,
) {
  await user.click(
    screen.getByRole("button", { name: ptBR.SloperCard.menuAriaLabel }),
  );
  await user.click(screen.getByRole("menuitem", { name: option }));
}

function renameField() {
  return screen.getByLabelText(ptBR.SloperCard.renamePrompt);
}

function saveRename() {
  return screen.getByRole("button", {
    name: ptBR.SloperCard.renameSaveButton,
  });
}

describe("SloperCard rename", () => {
  beforeEach(() => {
    rename.mockReset();
    remove.mockReset();
    useSlopersStore.setState({ rename, remove });
  });

  it("opens the dialog prefilled with the current name", async () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.SloperCard.renameOption);

    expect(screen.getByText(ptBR.SloperCard.renameTitle)).toBeVisible();
    expect(renameField()).toHaveValue(SLOPER.name);
  });

  it("renames with the trimmed value on this screen's own store", async () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.SloperCard.renameOption);
    await user.clear(renameField());
    await user.type(renameField(), "  base blusa  ");
    await user.click(saveRename());

    expect(rename).toHaveBeenCalledWith(SLOPER.id, "base blusa");
    expect(screen.queryByText(ptBR.SloperCard.renameTitle)).toBeNull();
  });

  it("issues no request when the name is unchanged", async () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.SloperCard.renameOption);
    await user.click(saveRename());

    expect(rename).not.toHaveBeenCalled();
  });

  it("keeps save disabled for a blank or whitespace-only name", async () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.SloperCard.renameOption);
    await user.clear(renameField());
    expect(saveRename()).toBeDisabled();

    await user.type(renameField(), "   ");
    expect(saveRename()).toBeDisabled();
  });

  it("discards the draft on cancel and reopens from the stored name", async () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    const user = userEvent.setup();

    await openMenu(user, ptBR.SloperCard.renameOption);
    await user.clear(renameField());
    await user.type(renameField(), "abandonado");
    await user.click(
      screen.getByRole("button", { name: ptBR.SloperCard.renameCancelButton }),
    );
    expect(rename).not.toHaveBeenCalled();

    await openMenu(user, ptBR.SloperCard.renameOption);
    expect(renameField()).toHaveValue(SLOPER.name);
  });
});

describe("SloperCard use action", () => {
  beforeEach(() => {
    useSlopersStore.setState({ remove, rename });
  });

  // The design gives this the outline treatment. Every tile in the grid
  // carries the same action, so a solid fill turns a four-across grid into a
  // wall of olive and stops reading as emphasis at all.
  it("renders the use action as an outline button, not a solid fill", () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    const button = screen.getByRole("button", {
      name: ptBR.SloperCard.useButton,
    });
    expect(button).toHaveAttribute("data-variant", "outline");
  });

  it("still invokes onUse with the sloper id", async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={onUse} />);
    await user.click(
      screen.getByRole("button", { name: ptBR.SloperCard.useButton }),
    );
    expect(onUse).toHaveBeenCalledWith("s1");
  });
});
