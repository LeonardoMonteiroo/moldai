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
});

describe("CutPlanSizePanel", () => {
  it("renders one row per baseSize + sizesApplied", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        totalInstances={3}
        totalLengthCm={120}
      />,
    );
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("defaults baseSize to quantity 1 and every other size to 0 when cutQuantities is untouched", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        totalInstances={3}
        totalLengthCm={120}
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

  it("increase/decrease buttons carry both aria-label and title, resolved per size", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        totalInstances={3}
        totalLengthCm={120}
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
        totalInstances={3}
        totalLengthCm={120}
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

  it("the − button is disabled at quantity 0", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        totalInstances={3}
        totalLengthCm={120}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: ptBR.CutPlanTab.decreaseQuantityAriaLabel.replace("{size}", "G"),
      }),
    ).toBeDisabled();
  });

  it("renders the total pieces and fabric consumption labels", () => {
    renderWithIntl(
      <CutPlanSizePanel
        pattern={tshirtPattern()}
        totalInstances={7}
        totalLengthCm={250}
      />,
    );
    expect(
      screen.getByText(ptBR.CutPlanTab.quantityTotalPiecesLabel),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.CutPlanTab.quantityTotalFabricLabel),
    ).toBeInTheDocument();
    expect(screen.getByText("2,50 m")).toBeInTheDocument();
  });
});
