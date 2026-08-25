import { describe, it, expect, beforeEach } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { SizeChartListEntry } from "@/lib/types";
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
});
