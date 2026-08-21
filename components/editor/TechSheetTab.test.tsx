import { describe, it, expect } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { Pattern } from "@/lib/types";
import { TechSheetTab } from "./TechSheetTab";

function pattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: "p1",
    name: "Blusa",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["P", "M", "G"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: {},
    pieces: [],
    spec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    },
    ...overrides,
  };
}

describe("TechSheetTab", () => {
  // Which grade a pattern was drafted from was recorded nowhere the user could
  // see, which mattered most when generation had substituted a chart.
  it("names the size chart the pattern was drafted from", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({ sizeChartName: "Feminino adulto · ABNT" })}
      />,
    );

    expect(
      screen.getByText(ptBR.TechSheetTab.chipSizeChart),
    ).toBeInTheDocument();
    expect(screen.getByText("Feminino adulto · ABNT")).toBeInTheDocument();
  });

  // Patterns drafted before the field existed have no name to show; inventing
  // one would be worse than omitting the chip.
  it("omits the chip entirely when the pattern carries no chart name", () => {
    renderWithIntl(<TechSheetTab pattern={pattern()} />);

    expect(
      screen.queryByText(ptBR.TechSheetTab.chipSizeChart),
    ).not.toBeInTheDocument();
  });
});
