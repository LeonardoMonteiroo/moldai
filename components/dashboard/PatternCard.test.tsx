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
