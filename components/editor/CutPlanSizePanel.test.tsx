import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return {
    ...actual,
    updateCutQuantities: vi.fn().mockResolvedValue(undefined),
  };
});

import { useEditorStore } from "@/lib/store";
import { updateCutQuantities } from "@/lib/api-client";
import { CutPlanSizePanel } from "./CutPlanSizePanel";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE_MALE } from "@/lib/measurements";

const mockUpdate = updateCutQuantities as unknown as ReturnType<typeof vi.fn>;
const noop = () => {};

function tshirtPattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: "p1",
    name: "Camiseta",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: ["G"],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE_MALE.M, G: SIZE_TABLE_MALE.G },
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
    ...overrides,
  };
}

beforeEach(() => {
  mockUpdate.mockClear();
  useEditorStore.setState({ cutFabricWidthCm: 150 });
});

describe("CutPlanSizePanel", () => {
  it("renders one grid cell per baseSize + sizesApplied", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="auto"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("defaults baseSize to quantity 1 and every other size to 0 when cutQuantities is untouched", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="auto"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    expect(
      screen.getByRole("spinbutton", {
        name: ptBR.CutPlanTab.quantityForSizeAriaLabel.replace("{size}", "M"),
      }),
    ).toHaveValue(1);
    expect(
      screen.getByRole("spinbutton", {
        name: ptBR.CutPlanTab.quantityForSizeAriaLabel.replace("{size}", "G"),
      }),
    ).toHaveValue(0);
  });

  it("increase/decrease quantity buttons carry both aria-label and title, resolved per size", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="auto"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    const increaseM = screen.getByRole("button", {
      name: ptBR.CutPlanTab.increaseQuantityAriaLabel.replace("{size}", "M"),
    });
    expect(increaseM).toHaveAttribute(
      "title",
      ptBR.CutPlanTab.increaseQuantityAriaLabel.replace("{size}", "M"),
    );
  });

  it("clicking + calls setCutQuantity -> api.updateCutQuantities with the incremented, merged map", async () => {
    const user = userEvent.setup();
    const pattern = tshirtPattern();
    useEditorStore.setState({
      patternId: "p1",
      pattern: { ...pattern, updatedAt: new Date().toISOString() },
    });
    renderWithIntl(
      <CutPlanSizePanel
        pattern={pattern}
        nestingMode="auto"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.CutPlanTab.increaseQuantityAriaLabel.replace("{size}", "G"),
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith("p1", { G: 1 });
    expect(useEditorStore.getState().pattern?.cutQuantities).toEqual({
      G: 1,
    });
  });

  it("the quantity − button is disabled at quantity 0", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="auto"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: ptBR.CutPlanTab.decreaseQuantityAriaLabel.replace("{size}", "G"),
      }),
    ).toBeDisabled();
  });

  // #280: the sidebar's own total is garments produced (sum of quantities),
  // distinct from the bottom pill's total CUT PIECES (garments × pieces per
  // garment) that CutPlanTab renders -- Editor.dc.html's "1 peça produzida"
  // caption under the quantity grid.
  it("renders the garments-produced caption, pluralized off the summed quantities", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="auto"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    // untouched cutQuantities -> baseSize defaults to 1, so total = 1,
    // resolving the catalog's ICU "one" branch: "1 peça produzida".
    expect(screen.getByText("1 peça produzida")).toBeInTheDocument();
  });

  it("renders the fabric width presets and a real −/+ stepper", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="auto"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    expect(
      screen.getByText(
        ptBR.CutPlanTab.fabricWidthStepLabel.replace("{cm}", "150"),
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: ptBR.CutPlanTab.increaseFabricWidthAriaLabel,
      }),
    );
    expect(useEditorStore.getState().cutFabricWidthCm).toBe(155);
  });

  it("renders the auto/manual mode toggle and calls onModeChange", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="auto"
        onModeChange={onModeChange}
        onResetManual={noop}
      />,
    );
    await user.click(
      screen.getByRole("radio", { name: ptBR.CutPlanTab.mode.manual }),
    );
    expect(onModeChange).toHaveBeenCalledWith("manual");
  });

  it("hides the manual hint and reset button in auto mode", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="auto"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    expect(
      screen.queryByText(ptBR.CutPlanTab.manualHint),
    ).not.toBeInTheDocument();
  });

  it("shows the manual hint and reset button in manual mode", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        nestingMode="manual"
        onModeChange={noop}
        onResetManual={noop}
      />,
    );
    expect(screen.getByText(ptBR.CutPlanTab.manualHint)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.CutPlanTab.resetManual }),
    ).toBeInTheDocument();
  });
});
