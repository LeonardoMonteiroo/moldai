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
  // #280: the mode toggle now lives inside the docked CutPlanSizePanel, not
  // in a toolbar of CutPlanTab's own -- but CutPlanTab always renders that
  // panel alongside the preview, so it's still reachable from here.
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
  // same empty-state message rather than a blank preview.
  it("an explicit all-zero cutQuantities map shows the empty-quantities message, not a blank preview", () => {
    const { container } = renderWithIntl(
      <CutPlanTab pattern={{ ...tshirtPattern(), cutQuantities: {} }} />,
    );
    expect(
      screen.getByText(ptBR.CutPlanTab.emptyQuantitiesState),
    ).toBeInTheDocument();
    // No CutPlanPreview renders while there's nothing to nest -- checked via
    // its own fabric-weave pattern id, not a bare "svg" query, since the
    // sidebar's fabric-width stepper icons are real <svg>s too.
    expect(
      container.querySelector("#cutPlanFabricWeave"),
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
    // "Tecido" legitimately renders twice now -- the legend swatch's own
    // label (Editor.dc.html:345) AND the sidebar's fabric-width section
    // eyebrow (Editor.dc.html:375) carry the identical catalog string, both
    // real per the design. getAllByText, not getByText.
    expect(screen.getAllByText(ptBR.CutPlanTab.legendFabric).length).toBe(2);
    expect(screen.getByText(ptBR.CutPlanTab.legendPiece)).toBeInTheDocument();
  });

  // #280: matches Editor.dc.html's own bottom-left "N peças · consumo
  // estimado X m" pill instead of the 3 metric cards this tab used to show.
  // Asserts against the catalog's own literal middle fragment -- the
  // interpolated numbers depend on the real draft the fixture's spec
  // produces, not on anything this test controls.
  it("renders the summary pill with the piece count and consumption", () => {
    renderWithIntl(<CutPlanTab pattern={tshirtPattern()} />);
    const literalFragment = ptBR.CutPlanTab.summaryLine
      .replace("{count}", "")
      .replace("{length}", "")
      .trim();
    expect(
      screen.getByText(literalFragment, { exact: false }),
    ).toBeInTheDocument();
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
