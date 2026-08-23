import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import type { SizeChartData, SizeChartListEntry } from "@/lib/types";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { SizeChartTable } from "./SizeChartTable";

const BASE: SizeChartData = {
  name: "Minha grade",
  gender: "female",
  bodyType: "straight",
  isSystem: false,
  sizes: ["P", "M", "G"],
  baseSizeIndex: 1,
  baseMeasurements: {
    bust: 92,
    waist: 74,
    hip: 100,
    hipHeight: 20.6,
    backLength: 41,
    shoulder: 18.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  progressionRule: { bust: 4 },
  overrides: {},
};

function seed(draft: Partial<SizeChartData> = {}) {
  const data = { ...BASE, ...draft };
  useSizeChartsStore.setState({
    draft: data,
    selectedId: "g1",
    editingRule: false,
    dirty: false,
    charts: [
      {
        id: "g1",
        updatedAt: "2026-08-21T00:00:00.000Z",
        isActive: false,
        ...data,
      } as SizeChartListEntry,
    ],
  });
}

/** The bust cell of the base column (M), whose value is 92. */
function bustBaseCell() {
  return screen
    .getAllByRole("spinbutton")
    .find((el) => (el as HTMLInputElement).value === "92") as HTMLInputElement;
}

describe("SizeChartTable measurement cells", () => {
  beforeEach(() => seed());

  // The inputs carried no bounds at all, so nothing told the user (or the
  // browser) what a plausible bust measurement even is.
  it("bounds each cell by its measurement's real range", () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();
    expect(cell).toHaveAttribute("min", String(MEASUREMENT_RANGES.bust.min));
    expect(cell).toHaveAttribute("max", String(MEASUREMENT_RANGES.bust.max));
  });

  // Number("") is 0, which was written straight into the chart and then
  // resolved back out clamped to the range minimum -- so clearing the bust cell
  // silently turned 92 into 70.
  it("does not turn a cleared cell into the range minimum", async () => {
    renderWithIntl(<SizeChartTable />);

    await userEvent.clear(bustBaseCell());

    expect(useSizeChartsStore.getState().draft!.baseMeasurements.bust).toBe(92);
  });

  it("shows the field empty while it is being cleared, not a substituted number", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);

    expect(cell).toHaveValue(null);
  });

  it("commits a valid edit", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.type(cell, "96");
    await userEvent.tab();

    expect(useSizeChartsStore.getState().draft!.baseMeasurements.bust).toBe(96);
  });

  // Typing 500 used to display 140 (the clamp) with no explanation.
  it("flags an out-of-range value instead of silently substituting one", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.type(cell, "500");

    expect(cell).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText(
        ptBR.SizeChartTable.rangeHint
          .replace("{min}", String(MEASUREMENT_RANGES.bust.min))
          .replace("{max}", String(MEASUREMENT_RANGES.bust.max)),
      ),
    ).toBeInTheDocument();
  });

  it("does not commit an out-of-range value to the chart", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.type(cell, "500");
    await userEvent.tab();

    expect(useSizeChartsStore.getState().draft!.baseMeasurements.bust).toBe(92);
  });

  it("restores the stored value when an abandoned edit loses focus", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.tab();

    expect(cell).toHaveValue(92);
  });
});

// #97: the size list is what gets resolved into sizeTable and frozen into
// every pattern's blob, then re-sent on every subsequent generation for that
// pattern -- so the UI has to stop the count from growing past the server's
// own cap, not just report the server's clamp after the fact.
describe("SizeChartTable size-list cap", () => {
  it("disables adding a size once the chart is at the cap, with a visible reason", () => {
    seed({ sizes: Array.from({ length: 40 }, (_, i) => `s${i}`) });
    renderWithIntl(<SizeChartTable />);

    expect(screen.getByText(ptBR.SizeChartTable.addSizeButton)).toBeDisabled();
    expect(
      screen.getByText(
        ptBR.SizeChartTable.maxSizesReachedHint.replace("{max}", "40"),
      ),
    ).toBeInTheDocument();
  });

  it("leaves adding a size enabled, with no reason shown, below the cap", () => {
    seed({ sizes: ["P", "M", "G"] });
    renderWithIntl(<SizeChartTable />);

    expect(screen.getByText(ptBR.SizeChartTable.addSizeButton)).toBeEnabled();
    expect(
      screen.queryByText(
        ptBR.SizeChartTable.maxSizesReachedHint.replace("{max}", "40"),
      ),
    ).not.toBeInTheDocument();
  });
});
