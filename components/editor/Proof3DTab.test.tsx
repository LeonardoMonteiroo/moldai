import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithIntl, ptBR, screen, act } from "@/components/test-utils";
import { useEditorStore } from "@/lib/store";
import type { Pattern, PatternRecord } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE, Measurements } from "@/lib/measurements";
import { t as stubT } from "@/lib/i18n/test-translate";
import { draftGarment } from "@/lib/draft/garment";
import { Proof3DTab } from "./Proof3DTab";

function draftedPattern(
  overrides: Partial<Pattern> = {},
  baseMeasurements: Measurements = SIZE_TABLE.M,
): PatternRecord {
  const spec = overrides.spec ?? {
    type: "blouse" as const,
    gender: "female" as const,
    measurementOverrides: {},
    style: {
      neckline: "round" as const,
      sleeve: "short" as const,
      darts: true,
    },
  };
  const { pieces } = draftGarment(spec, baseMeasurements, stubT);
  return {
    id: "p1",
    name: "Blusa",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["M"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: baseMeasurements },
    pieces,
    spec,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  useEditorStore.setState({ pattern: null });
});

// Finds the Metric card by its label and returns its own value text --
// several ease rows can legitimately share the same formatted value (e.g. a
// t-shirt's bust AND hip ease both land on "0,0 cm"), so a bare
// screen.getByText("0,0 cm") is ambiguous.
function metricValue(label: string): string | null {
  const labelEl = screen.getByText(label);
  const card = labelEl.closest("div");
  return card?.querySelector(".text-title")?.textContent ?? null;
}

describe("Proof3DTab", () => {
  it("shows the empty state and renders no SVG preview for a blank pattern (no pieces)", () => {
    useEditorStore.setState({
      pattern: draftedPattern({ pieces: [], spec: undefined }),
    });
    renderWithIntl(<Proof3DTab />);
    expect(screen.getByText(ptBR.Proof3DTab.emptyState)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the empty state when there is no pattern loaded at all", () => {
    renderWithIntl(<Proof3DTab />);
    expect(screen.getByText(ptBR.Proof3DTab.emptyState)).toBeInTheDocument();
  });

  it("renders the projected SVG, the three view toggles, and an 8,0cm bust ease for a woven fitted blouse", () => {
    useEditorStore.setState({ pattern: draftedPattern() });
    renderWithIntl(<Proof3DTab />);

    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: ptBR.Proof3DTab.view.front }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: ptBR.Proof3DTab.view.side }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: ptBR.Proof3DTab.view.back }),
    ).toBeInTheDocument();

    expect(metricValue(ptBR.Proof3DTab.ease.bust)).toBe("8,0 cm");
  });

  it("shows a 0,0cm bust ease for a knit t-shirt", () => {
    useEditorStore.setState({
      pattern: draftedPattern(
        {
          spec: {
            type: "tshirt",
            gender: "male",
            measurementOverrides: {},
            style: {},
          },
        },
        SIZE_TABLE_MALE.M,
      ),
    });
    renderWithIntl(<Proof3DTab />);
    expect(metricValue(ptBR.Proof3DTab.ease.bust)).toBe("0,0 cm");
  });

  it("does not show a waist-ease metric for an unfitted (no-darts) blouse", () => {
    useEditorStore.setState({
      pattern: draftedPattern({
        spec: {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: { neckline: "straight", sleeve: "none", darts: false },
        },
      }),
    });
    renderWithIntl(<Proof3DTab />);
    expect(
      screen.queryByText(ptBR.Proof3DTab.ease.waist),
    ).not.toBeInTheDocument();
  });

  it("re-renders with a new aria-label when the pattern (and its base measurements) change, without remounting (AC: follows a regenerated pattern)", () => {
    const first = draftedPattern();
    useEditorStore.setState({ pattern: first });
    renderWithIntl(<Proof3DTab />);
    const firstLabel = screen.getByRole("img").getAttribute("aria-label");
    expect(metricValue(ptBR.Proof3DTab.ease.bust)).toBe("8,0 cm");

    const biggerBase: Measurements = {
      ...SIZE_TABLE.M,
      bust: SIZE_TABLE.M.bust + 20,
    };
    const second = draftedPattern(
      { id: "p1", name: "Blusa maior", spec: first.spec },
      biggerBase,
    );
    // The store's own subscription re-renders the already-mounted
    // component -- no RTL rerender() needed (and calling it would drop the
    // NextIntlClientProvider wrapper renderWithIntl set up above).
    act(() => {
      useEditorStore.setState({ pattern: second });
    });

    // The bust ease itself stays 8cm (wearing ease doesn't depend on the
    // base measurement), but the aria-label carries the pattern's current
    // name, proving the preview picked up the new pattern object.
    const secondLabel = screen.getByRole("img").getAttribute("aria-label");
    expect(secondLabel).not.toBe(firstLabel);
    expect(secondLabel).toContain("Blusa maior");
    expect(metricValue(ptBR.Proof3DTab.ease.bust)).toBe("8,0 cm");
  });

  it("shows a distinct build-error alert (not the ordinary empty state) when buildProofMesh genuinely throws", () => {
    const drafted = draftedPattern();
    useEditorStore.setState({
      // pieces/spec are present (so the blank-pattern guard doesn't fire),
      // but the frozen sizeTable is missing the base size entirely -- a
      // legacy/corrupted blob, distinct from "nothing drafted yet".
      pattern: { ...drafted, sizeTable: {} },
    });
    renderWithIntl(<Proof3DTab />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      ptBR.Proof3DTab.buildError,
    );
    expect(
      screen.queryByText(ptBR.Proof3DTab.emptyState),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the approximation note's leading text", () => {
    useEditorStore.setState({ pattern: draftedPattern() });
    renderWithIntl(<Proof3DTab />);
    const leading = ptBR.Proof3DTab.approximationNote.split("<em>")[0].trim();
    expect(document.body.textContent).toContain(leading);
  });

  // #10 follow-up: continuous drag/keyboard rotation, on top of the three
  // fixed-angle presets above.
  describe("continuous rotation", () => {
    it("starts at yaw 0 with the front preset pressed", () => {
      useEditorStore.setState({ pattern: draftedPattern() });
      renderWithIntl(<Proof3DTab />);
      const slider = screen.getByRole("slider", {
        name: ptBR.Proof3DTab.rotateLabel,
      });
      expect(slider).toHaveAttribute("aria-valuenow", "0");
      expect(
        screen.getByRole("radio", { name: ptBR.Proof3DTab.view.front }),
      ).toHaveAttribute("aria-checked", "true");
    });

    it("ArrowRight/ArrowLeft nudge yaw by the 3-degree step, wrapping at the ends", () => {
      useEditorStore.setState({ pattern: draftedPattern() });
      renderWithIntl(<Proof3DTab />);
      const slider = screen.getByRole("slider", {
        name: ptBR.Proof3DTab.rotateLabel,
      });

      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(slider).toHaveAttribute("aria-valuenow", "3");

      fireEvent.keyDown(slider, { key: "ArrowLeft" });
      fireEvent.keyDown(slider, { key: "ArrowLeft" });
      expect(slider).toHaveAttribute("aria-valuenow", "357");
    });

    it("Shift+ArrowRight nudges by the coarse (5x) step and reaches the side preset", () => {
      useEditorStore.setState({ pattern: draftedPattern() });
      renderWithIntl(<Proof3DTab />);
      const slider = screen.getByRole("slider", {
        name: ptBR.Proof3DTab.rotateLabel,
      });

      // 6 coarse nudges of 15 degrees each == 90, the "side" preset.
      for (let i = 0; i < 6; i++) {
        fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
      }
      expect(slider).toHaveAttribute("aria-valuenow", "90");
      expect(
        screen.getByRole("radio", { name: ptBR.Proof3DTab.view.side }),
      ).toHaveAttribute("aria-checked", "true");
      expect(
        screen.getByRole("radio", { name: ptBR.Proof3DTab.view.front }),
      ).toHaveAttribute("aria-checked", "false");
    });

    it("dragging the preview rotates continuously and deselects the presets off-angle", () => {
      useEditorStore.setState({ pattern: draftedPattern() });
      renderWithIntl(<Proof3DTab />);
      const slider = screen.getByRole("slider", {
        name: ptBR.Proof3DTab.rotateLabel,
      });

      fireEvent.pointerDown(slider, { clientX: 0, pointerId: 1 });
      // 200px * 0.5deg/px = 100deg from yaw 0, quantized to the nearest
      // 3-degree step (99).
      fireEvent.pointerMove(slider, { clientX: 200, pointerId: 1 });
      expect(slider).toHaveAttribute("aria-valuenow", "99");
      // No preset sits at 99 degrees -- none of the three should read pressed.
      for (const view of ["front", "side", "back"] as const) {
        expect(
          screen.getByRole("radio", { name: ptBR.Proof3DTab.view[view] }),
        ).toHaveAttribute("aria-checked", "false");
      }

      fireEvent.pointerUp(slider, { clientX: 200, pointerId: 1 });
      // A further move after pointerUp must not keep rotating.
      fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1 });
      expect(slider).toHaveAttribute("aria-valuenow", "99");
    });

    it("clicking a preset after a drag snaps yaw back to that preset's fixed angle", () => {
      useEditorStore.setState({ pattern: draftedPattern() });
      renderWithIntl(<Proof3DTab />);
      const slider = screen.getByRole("slider", {
        name: ptBR.Proof3DTab.rotateLabel,
      });

      fireEvent.pointerDown(slider, { clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(slider, { clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(slider, { clientX: 200, pointerId: 1 });
      expect(slider).toHaveAttribute("aria-valuenow", "99");

      fireEvent.click(
        screen.getByRole("radio", { name: ptBR.Proof3DTab.view.back }),
      );
      expect(slider).toHaveAttribute("aria-valuenow", "180");
    });
  });
});
