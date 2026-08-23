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

  // #125: a woven garment shows the fit class + resulting bust ease; a
  // pattern with no sizeTable row for its own baseSize (an unrealistic
  // fixture, but the existing tests above use exactly that) must not crash
  // computing it -- the ease chip is simply omitted, the chipSizeChart
  // precedent.
  it("shows the fit class and resulting bust ease for a woven garment", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({
          sizeTable: { M: { bust: 92 } as never },
          spec: {
            type: "blouse",
            gender: "female",
            measurementOverrides: {},
            style: { fit: "loose" },
          },
        })}
      />,
    );

    expect(screen.getByText(ptBR.TechSheetTab.chipFit)).toBeInTheDocument();
    expect(screen.getByText(ptBR.PatternData.fit.loose)).toBeInTheDocument();
    expect(screen.getByText(ptBR.TechSheetTab.chipEase)).toBeInTheDocument();
    expect(screen.getByText("16,0 cm")).toBeInTheDocument();
  });

  it("shows the fabric stretch class and negative ease for a knit garment", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({
          sizeTable: { M: { bust: 100 } as never },
          spec: {
            type: "tshirt",
            gender: "female",
            measurementOverrides: {},
            style: { stretch: "high" },
          },
        })}
      />,
    );

    expect(screen.getByText(ptBR.TechSheetTab.chipFabric)).toBeInTheDocument();
    expect(screen.getByText(ptBR.PatternData.stretch.high)).toBeInTheDocument();
    expect(screen.getByText("-12,0 cm")).toBeInTheDocument();
  });

  it("omits the fit/fabric and ease chips for a pattern with no bodice (skirt only)", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({
          sizeTable: { M: { bust: 92 } as never },
          spec: {
            type: "skirt",
            gender: "female",
            measurementOverrides: {},
            style: {},
          },
        })}
      />,
    );

    expect(
      screen.queryByText(ptBR.TechSheetTab.chipFit),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.TechSheetTab.chipFabric),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.TechSheetTab.chipEase),
    ).not.toBeInTheDocument();
  });

  it("omits the ease chip (but not the fit chip) when the pattern's sizeTable has no row for its own baseSize", () => {
    renderWithIntl(<TechSheetTab pattern={pattern()} />);

    expect(screen.getByText(ptBR.TechSheetTab.chipFit)).toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.TechSheetTab.chipEase),
    ).not.toBeInTheDocument();
  });
});
