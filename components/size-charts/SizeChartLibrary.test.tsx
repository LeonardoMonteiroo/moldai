import { describe, it, expect, beforeEach } from "vitest";
import { renderWithIntl, ptBR, screen, within } from "@/components/test-utils";
import type { SizeChartListEntry } from "@/lib/types";
import { SIZE_TABLE } from "@/lib/measurements";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { SizeChartLibrary } from "./SizeChartLibrary";

function chart(overrides: Partial<SizeChartListEntry>): SizeChartListEntry {
  return {
    id: "g1",
    updatedAt: "2026-08-21T00:00:00.000Z",
    name: "Feminino adulto · ABNT",
    gender: "female",
    bodyType: "straight",
    isSystem: false,
    isActive: false,
    sizes: ["P", "M", "G"],
    baseSizeIndex: 1,
    baseMeasurements: { ...SIZE_TABLE.M },
    progressionRule: {},
    overrides: {},
    ...overrides,
  };
}

describe("SizeChartLibrary", () => {
  beforeEach(() => {
    useSizeChartsStore.setState({ selectedId: null });
  });

  // Marking a chart "ativa" implied it would be used for everything, but
  // generation silently falls back whenever the garment's gender differs. The
  // badge has to carry that limit.
  it("says what the active chart's scope is", () => {
    useSizeChartsStore.setState({
      charts: [
        chart({
          id: "m1",
          name: "Masculino adulto",
          gender: "male",
          isActive: true,
        }),
      ],
    });

    renderWithIntl(<SizeChartLibrary />);

    const expected = ptBR.SizeChartLibrary.activeScope.replace(
      "{gender}",
      ptBR.SizeChartLibrary.gender.male,
    );
    expect(screen.getByText(expected, { exact: false })).toBeInTheDocument();
  });

  it("does not put a scope note on charts that are not active", () => {
    useSizeChartsStore.setState({
      charts: [chart({ id: "g1", gender: "female", isActive: false })],
    });

    renderWithIntl(<SizeChartLibrary />);

    const expected = ptBR.SizeChartLibrary.activeScope.replace(
      "{gender}",
      ptBR.SizeChartLibrary.gender.female,
    );
    expect(
      screen.queryByText(expected, { exact: false }),
    ).not.toBeInTheDocument();
  });

  // #133: "padrão do sistema" alone didn't say the numbers aren't a
  // certified standard -- the seeded chart's own name used to claim ABNT
  // provenance the repo can't back.
  it("says a system chart is a house standard, not a certified one", () => {
    useSizeChartsStore.setState({
      charts: [chart({ id: "g1", isSystem: true })],
    });

    renderWithIntl(<SizeChartLibrary />);

    expect(
      screen.getByText(ptBR.SizeChartLibrary.houseStandardNote),
    ).toBeInTheDocument();
  });

  it("does not put the house-standard note on a custom chart", () => {
    useSizeChartsStore.setState({
      charts: [chart({ id: "g1", isSystem: false })],
    });

    renderWithIntl(<SizeChartLibrary />);

    expect(
      screen.queryByText(ptBR.SizeChartLibrary.houseStandardNote),
    ).not.toBeInTheDocument();
  });

  // The design groups system vs. custom charts under two labeled sections
  // instead of one flat list -- both derive from the isSystem flag the
  // cards already branch on, so a mixed list has to split correctly.
  it("groups charts under labeled system/custom sections", () => {
    useSizeChartsStore.setState({
      charts: [
        chart({ id: "sys1", name: "Feminino adulto", isSystem: true }),
        chart({ id: "mine1", name: "Grade do ateliê", isSystem: false }),
      ],
    });

    renderWithIntl(<SizeChartLibrary />);

    expect(
      screen.getByText(ptBR.SizeChartLibrary.systemSectionLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.SizeChartLibrary.myChartsSectionLabel),
    ).toBeInTheDocument();
    // The note renders once per group, not once per card.
    expect(
      screen.getAllByText(ptBR.SizeChartLibrary.houseStandardNote),
    ).toHaveLength(1);
  });

  it("omits a section header for a group with no charts", () => {
    useSizeChartsStore.setState({
      charts: [chart({ id: "sys1", isSystem: true })],
    });

    renderWithIntl(<SizeChartLibrary />);

    expect(
      screen.queryByText(ptBR.SizeChartLibrary.myChartsSectionLabel),
    ).not.toBeInTheDocument();
  });

  // The design places "＋ Nova grade" before the import trigger; the two
  // used to be swapped.
  it("renders the new-chart button before the import trigger", () => {
    useSizeChartsStore.setState({ charts: [] });

    renderWithIntl(<SizeChartLibrary />);

    const buttons = screen.getAllByRole("button");
    const newChartIndex = buttons.findIndex(
      (b) => b.textContent === ptBR.SizeCharts.newSizeChartButton,
    );
    const importIndex = buttons.findIndex((b) =>
      b.textContent?.includes("Importar"),
    );
    expect(newChartIndex).toBeGreaterThanOrEqual(0);
    expect(importIndex).toBeGreaterThan(newChartIndex);
  });

  // Verifier gap (L-012): SZCH-04/SZCH-08 had no assertion at all -- the
  // width and the card's selection accent bar were correct by inspection
  // but evidence-free per the evidence-or-zero rule.
  // The 252px is the side-by-side width only. Below `lg` the two panels stack
  // (#119) and the column goes full-width -- it used to stay pinned at 252px
  // there, leaving a narrow column with the table underneath it.
  it("renders the library column at the design's 252px width beside the table", () => {
    useSizeChartsStore.setState({ charts: [] });
    const { container } = renderWithIntl(<SizeChartLibrary />);

    expect(container.firstChild).toHaveClass("lg:w-[252px]", "w-full");
  });

  // Regression guard for the real defect this structure exists to prevent:
  // as one flow, the footer's position was decided by the table's height and
  // landed ~400px below the fold. The list is the only scrolling region, and
  // the footer is a flex-none sibling of it, so it cannot be pushed away.
  it("scrolls only the chart list, keeping the footer actions in the panel", () => {
    useSizeChartsStore.setState({ charts: [] });
    const { container } = renderWithIntl(<SizeChartLibrary />);
    const panel = container.firstChild as HTMLElement;
    const [, list, footer] = Array.from(panel.children) as HTMLElement[];

    expect(list).toHaveClass("lg:overflow-y-auto", "lg:flex-1");
    expect(footer).toHaveClass("flex-none", "border-t");
    expect(panel).not.toHaveClass("overflow-y-auto");
  });

  it("shows an olive accent bar on the selected card, transparent otherwise", () => {
    useSizeChartsStore.setState({
      selectedId: "sel",
      charts: [
        chart({ id: "sel", name: "Selecionada" }),
        chart({ id: "other", name: "Não selecionada" }),
      ],
    });

    renderWithIntl(<SizeChartLibrary />);

    const selectedCard = screen.getByRole("button", { name: /Selecionada/ });
    const selectedBar = within(selectedCard).getByText("", {
      selector: "span[aria-hidden]",
    });
    expect(selectedBar).toHaveClass("bg-olive");

    const otherCard = screen.getByRole("button", {
      name: /Não selecionada/,
    });
    const otherBar = within(otherCard).getByText("", {
      selector: "span[aria-hidden]",
    });
    expect(otherBar).toHaveClass("bg-transparent");
  });
});
