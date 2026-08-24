import { describe, it, expect } from "vitest";
import { renderWithIntl, screen, ptBR } from "@/components/test-utils";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";
import { useEditorStore } from "@/lib/store";
import { CanvasArea } from "./CanvasArea";

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

function draftedPattern() {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  return { ...state.pattern, updatedAt: "2026-01-01T00:00:00.000Z" };
}

// #51: the measure tool is keyboard-reachable (FloatingToolbar's toggle is a
// real button), but placing a measurement point still requires a pointer
// click on the canvas -- CLAUDE.md's "surface limitations on-screen, never
// silently" rule, applied to the one piece of #51 that a focusable <g> can't
// fix on its own.
describe("CanvasArea measure tool", () => {
  it("surfaces the pointer-only limitation while the measure tool is active", () => {
    useEditorStore.setState({
      pattern: draftedPattern(),
      activeTool: "measure",
    });
    renderWithIntl(<CanvasArea />);
    expect(
      screen.getByText(ptBR.CanvasArea.measurePointerOnlyNote),
    ).toBeInTheDocument();
  });

  it("shows no such note while the cursor tool is active", () => {
    useEditorStore.setState({
      pattern: draftedPattern(),
      activeTool: "cursor",
    });
    renderWithIntl(<CanvasArea />);
    expect(
      screen.queryByText(ptBR.CanvasArea.measurePointerOnlyNote),
    ).not.toBeInTheDocument();
  });
});
