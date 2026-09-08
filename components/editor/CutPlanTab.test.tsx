import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { useEditorStore } from "@/lib/store";
import { CutPlanTab } from "./CutPlanTab";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE_MALE } from "@/lib/measurements";

function tshirtPattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE_MALE.M },
    pieces: [
      {
        id: "x",
        name: "x",
        qty: 1,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
    ],
    spec: {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: { seamAllowanceCm: 1 },
    },
  };
}

beforeEach(() => {
  useEditorStore.setState({
    cutFabricWidthCm: 150,
    nestingMode: "auto",
    cutPlacements: {},
  });
});

describe("CutPlanTab", () => {
  it("renders the mode toggle with the catalog's auto/manual labels", () => {
    renderWithIntl(<CutPlanTab pattern={tshirtPattern()} />);
    expect(
      screen.getByRole("radio", { name: ptBR.CutPlanTab.mode.auto }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: ptBR.CutPlanTab.mode.manual }),
    ).toBeInTheDocument();
  });

  it("choosing Manual reveals the manual hint and reset button", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CutPlanTab pattern={tshirtPattern()} />);
    await user.click(
      screen.getByRole("radio", { name: ptBR.CutPlanTab.mode.manual }),
    );
    expect(screen.getByText(ptBR.CutPlanTab.manualHint)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.CutPlanTab.resetManual }),
    ).toBeInTheDocument();
  });

  // #280: the size/quantity panel docks alongside the preview whenever a
  // plan exists -- a basic smoke test that CutPlanTab actually renders it,
  // not just that CutPlanSizePanel works standalone (its own test file).
  it("docks the size/quantity panel next to the preview", () => {
    renderWithIntl(<CutPlanTab pattern={tshirtPattern()} />);
    expect(
      screen.getByText(ptBR.CutPlanTab.quantityPanelTitle),
    ).toBeInTheDocument();
  });

  // #280: cutQuantities DEFINED but every size at 0 (the user explicitly
  // zeroed every stepper) must not fall back to the pre-#280 default nest --
  // planCutLayout returns a real, empty plan, and the tab has to show the
  // same empty-state card style as "no pieces drafted at all" rather than a
  // blank preview with live (but degenerate) metrics.
  it("an explicit all-zero cutQuantities map shows the empty-quantities message, not a blank preview", () => {
    renderWithIntl(
      <CutPlanTab pattern={{ ...tshirtPattern(), cutQuantities: {} }} />,
    );
    expect(
      screen.getByText(ptBR.CutPlanTab.emptyQuantitiesState),
    ).toBeInTheDocument();
    // metricEfficiencyLabel is unique to the metrics cards (unlike
    // "Peças no corte", which the always-visible size panel's own total row
    // also uses) -- its absence confirms the metrics/preview block itself
    // didn't render, not just that some particular string is missing.
    expect(
      screen.queryByText(ptBR.CutPlanTab.metricEfficiencyLabel),
    ).not.toBeInTheDocument();
    // The toggles stay usable -- the user still needs them to bring a
    // quantity back up.
    expect(
      screen.getByRole("radio", { name: ptBR.CutPlanTab.mode.auto }),
    ).toBeInTheDocument();
  });

  it("renders the plan's color legend from the catalog", () => {
    renderWithIntl(<CutPlanTab pattern={tshirtPattern()} />);
    expect(
      screen.getByText(ptBR.CutPlanTab.legendBackground),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.CutPlanTab.legendFabric)).toBeInTheDocument();
    expect(screen.getByText(ptBR.CutPlanTab.legendPiece)).toBeInTheDocument();
  });

  it("a seeded overlapping manual placement renders the overlap warning inside role=alert", () => {
    useEditorStore.setState({
      nestingMode: "manual",
      cutPlacements: {
        "body-front#1": { x: 4, y: 4 },
        "body-back#1": { x: 4, y: 4 },
      },
    });
    renderWithIntl(<CutPlanTab pattern={tshirtPattern()} />);
    const alerts = screen.getAllByRole("alert");
    const overlapAlert = alerts.find(
      (el) => el.textContent === ptBR.CutPlanTab.overlapWarning,
    );
    expect(overlapAlert).toBeDefined();
  });
});
