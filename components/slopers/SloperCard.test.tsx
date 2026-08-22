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
