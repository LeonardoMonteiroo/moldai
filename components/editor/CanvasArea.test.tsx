import { describe, it, expect } from "vitest";
import {
  renderWithIntl,
  screen,
  ptBR,
  userEvent,
  translatorFor,
} from "@/components/test-utils";
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

// ---------------------------------------------------------------------------
// #168: the canvas's own state machine. CanvasArea decides what the editor's
// main region shows, and the rule CLAUDE.md records for it is an
// EXCLUSIVITY: PieceDetailsPanel and ConflictInfoCard share one top-right
// slot and a conflict always wins it. That is exactly the kind of rule five
// independent `&&` expressions lose quietly -- two overlapping cards, or a
// details panel that hides the seam warning the user needs to act on.
//
// The generating state is the second half: while a generation is in flight
// every chrome affordance has to go, or the user can pan, measure and
// graduate against a drawing that is about to be replaced.
// ---------------------------------------------------------------------------

/** A blouse whose armhole is deepened without refitting the sleeve -- the one
 *  divergence the drafting matrix can actually produce today, so this is a
 *  real conflict from the real detector rather than a hand-built blob. */
function conflictedPattern() {
  const state = seedPatternState(t);
  applyGarmentSpec(
    state,
    { ...BLOUSE, style: { sleeve: "short", armholeDeepenCm: 5 } },
    t,
  );
  return {
    pattern: { ...state.pattern, updatedAt: "2026-01-01T00:00:00.000Z" },
    conflict: state.conflict,
  };
}

function blankPattern() {
  const state = seedPatternState(t);
  return { ...state.pattern, updatedAt: "2026-01-01T00:00:00.000Z" };
}

function seedCanvas(overrides: Record<string, unknown>) {
  useEditorStore.setState({
    conflict: null,
    selectedPieceId: null,
    detailsPanelOpen: true,
    activeTool: "cursor",
    activeTab: "pattern2d",
    generationStatus: "idle",
    generationStepIndex: 0,
    measurements: [],
    graduating: false,
    ...overrides,
  });
}

describe("CanvasArea blank state", () => {
  it("shows the blank-pattern empty state and hides the toolbar", () => {
    seedCanvas({ pattern: blankPattern() });
    renderWithIntl(<CanvasArea />);

    expect(screen.getByText(ptBR.CanvasArea.emptyStateTitle)).toBeVisible();
    expect(
      screen.getByText(ptBR.CanvasArea.emptyStateDescription),
    ).toBeVisible();
    // No pieces means nothing to measure or zoom, so the floating chrome is
    // absent rather than present-and-inert.
    expect(
      screen.queryByText(ptBR.CanvasArea.measurePointerOnlyNote),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: ptBR.FloatingToolbar.measureTool }),
    ).toBeNull();
  });

  it("drops the empty state once a generation has drafted pieces", () => {
    seedCanvas({ pattern: draftedPattern() });
    renderWithIntl(<CanvasArea />);

    expect(screen.queryByText(ptBR.CanvasArea.emptyStateTitle)).toBeNull();
    expect(
      screen.getByRole("button", { name: ptBR.FloatingToolbar.measureTool }),
    ).toBeVisible();
  });
});

describe("CanvasArea overlay exclusivity", () => {
  it("gives the top-right slot to the conflict card, never both", () => {
    const { pattern, conflict } = conflictedPattern();
    // A piece IS selected and the details panel IS open -- the details panel
    // must still lose the slot.
    seedCanvas({
      pattern,
      conflict,
      selectedPieceId: pattern.pieces[0].id,
      detailsPanelOpen: true,
    });
    renderWithIntl(<CanvasArea />);

    expect(conflict).not.toBeNull();
    expect(screen.getByText(ptBR.ConflictInfoCard.sectionLabel)).toBeVisible();
    expect(screen.queryByText(ptBR.PieceDetailsPanel.sectionLabel)).toBeNull();
  });

  it("gives the slot to the details panel when there is no conflict", () => {
    const pattern = draftedPattern();
    seedCanvas({
      pattern,
      selectedPieceId: pattern.pieces[0].id,
      detailsPanelOpen: true,
    });
    renderWithIntl(<CanvasArea />);

    expect(screen.getByText(ptBR.PieceDetailsPanel.sectionLabel)).toBeVisible();
    expect(screen.queryByText(ptBR.ConflictInfoCard.sectionLabel)).toBeNull();
  });

  it("leaves the slot empty with a closed panel or no selection", () => {
    const pattern = draftedPattern();

    seedCanvas({
      pattern,
      selectedPieceId: pattern.pieces[0].id,
      detailsPanelOpen: false,
    });
    const closed = renderWithIntl(<CanvasArea />);
    expect(screen.queryByText(ptBR.PieceDetailsPanel.sectionLabel)).toBeNull();
    closed.unmount();

    seedCanvas({ pattern, selectedPieceId: null, detailsPanelOpen: true });
    renderWithIntl(<CanvasArea />);
    expect(screen.queryByText(ptBR.PieceDetailsPanel.sectionLabel)).toBeNull();
  });
});

describe("CanvasArea while generating", () => {
  it("replaces the tab bar with the single progress live region", () => {
    seedCanvas({
      pattern: draftedPattern(),
      generationStatus: "generating",
      generationStepIndex: 1,
    });
    renderWithIntl(<CanvasArea />);

    // GeneratingOverlay is role="status" and is deliberately the ONLY live
    // region announcing progress -- ChatPanel renders the same step text
    // silently, or every step would be read twice.
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.GeneratingOverlay.cancelButton }),
    ).toBeVisible();
  });

  it("hides every canvas affordance that would act on the outgoing drawing", () => {
    const pattern = draftedPattern();
    seedCanvas({
      pattern,
      generationStatus: "generating",
      selectedPieceId: pattern.pieces[0].id,
      detailsPanelOpen: true,
      measurements: [{ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }],
    });
    renderWithIntl(<CanvasArea />);

    expect(
      screen.queryByRole("button", { name: ptBR.FloatingToolbar.measureTool }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: ptBR.CanvasArea.clearMeasurementsButton,
      }),
    ).toBeNull();
    expect(screen.queryByText(ptBR.PieceDetailsPanel.sectionLabel)).toBeNull();
  });

  it("hides the conflict card too, rather than warning about a superseded draft", () => {
    const { pattern, conflict } = conflictedPattern();
    seedCanvas({ pattern, conflict, generationStatus: "generating" });
    renderWithIntl(<CanvasArea />);

    expect(screen.queryByText(ptBR.ConflictInfoCard.sectionLabel)).toBeNull();
  });
});

describe("CanvasArea measurements", () => {
  it("offers the clear action only once a measurement exists", () => {
    const pattern = draftedPattern();

    seedCanvas({ pattern, measurements: [] });
    const empty = renderWithIntl(<CanvasArea />);
    expect(
      screen.queryByRole("button", {
        name: ptBR.CanvasArea.clearMeasurementsButton,
      }),
    ).toBeNull();
    empty.unmount();

    seedCanvas({
      pattern,
      measurements: [{ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }],
    });
    renderWithIntl(<CanvasArea />);
    expect(
      screen.getByRole("button", {
        name: ptBR.CanvasArea.clearMeasurementsButton,
      }),
    ).toBeVisible();
  });

  // EDCH-09: shares FloatingToolbar's top-left stack (top-[54px] left-4) --
  // the old bottom-5 left-5 corner now belongs to the status pill.
  it("stacks with FloatingToolbar at top-[54px], not the status pill's corner", () => {
    seedCanvas({
      pattern: draftedPattern(),
      measurements: [{ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }],
    });
    renderWithIntl(<CanvasArea />);
    const button = screen.getByRole("button", {
      name: ptBR.CanvasArea.clearMeasurementsButton,
    });
    const stack = button.closest('[class*="top-[54px]"]');
    expect(stack).not.toBeNull();
    expect(stack).toHaveClass("left-4");
    expect(stack).not.toHaveClass("bottom-5");
  });

  it("clears every measurement through the store", async () => {
    seedCanvas({
      pattern: draftedPattern(),
      measurements: [{ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }],
    });
    renderWithIntl(<CanvasArea />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", {
        name: ptBR.CanvasArea.clearMeasurementsButton,
      }),
    );
    expect(useEditorStore.getState().measurements).toEqual([]);
  });
});

describe("CanvasArea tabs", () => {
  it("renders nothing at all before a pattern is loaded", () => {
    useEditorStore.setState({ pattern: null });
    const { container } = renderWithIntl(<CanvasArea />);
    // An early return, not an empty state: EditorShell owns the loading
    // screen for this screen, because the header's title IS the pattern name.
    expect(container).toBeEmptyDOMElement();
  });

  it("switches the active tab through the store", async () => {
    seedCanvas({ pattern: draftedPattern() });
    renderWithIntl(<CanvasArea />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: ptBR.TabBar.tabCutplan }));
    expect(useEditorStore.getState().activeTab).toBe("cutplan");
  });
});

// EDCH-03: every tab panel needs the same 58px clearance the floating tab
// bar requires (Editor.dc.html:227/288/337) -- confirmed by a killed sensor
// mutation reverting CanvasArea.tsx's pattern2d inset to the pre-restructure
// top-[22px] (moldai-verify-scratch, redesign-editor validation.md).
describe("CanvasArea floating-tab-bar clearance (EDCH-03)", () => {
  it("gives the pattern2d canvas a top-[58px] inset", () => {
    seedCanvas({ pattern: draftedPattern() });
    const { container } = renderWithIntl(<CanvasArea />);
    const inset = container.querySelector('[class*="top-[58px]"]');
    expect(inset).not.toBeNull();
    expect(inset).not.toHaveClass("top-[22px]");
  });

  it.each([
    ["proof3d", ptBR.TabBar.tabProof3d],
    ["techsheet", ptBR.TabBar.tabTechsheet],
    ["cutplan", ptBR.TabBar.tabCutplan],
  ] as const)("gives the %s panel a pt-[58px] inset", (activeTab, _label) => {
    seedCanvas({ pattern: draftedPattern(), activeTab });
    renderWithIntl(<CanvasArea />);
    expect(screen.getByRole("tabpanel")).toHaveClass("pt-[58px]");
  });
});

// EDCH-04: the status pill moved here from Footer.tsx (#106's pluralization
// guard included) -- same Footer.* keys, new floating render location.
describe("CanvasArea status pill (moved from Footer)", () => {
  const tFooter = translatorFor("Footer");

  it("reads ready with the copy count, base size and unit", () => {
    const pattern = draftedPattern();
    seedCanvas({ pattern });
    renderWithIntl(<CanvasArea />);
    const copyCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);
    expect(
      screen.getByText(
        tFooter("statusReady", {
          copyCount,
          baseSize: pattern.baseSize,
          unit: pattern.unit,
        }),
      ),
    ).toBeInTheDocument();
  });

  it("reads the conflict variant, citing the pattern version", () => {
    const { pattern, conflict } = conflictedPattern();
    seedCanvas({ pattern, conflict });
    renderWithIntl(<CanvasArea />);
    expect(
      screen.getByText(tFooter("statusConflict", { version: pattern.version })),
    ).toBeInTheDocument();
  });

  it("pluralizes the copy count at 0, 1 and 2", () => {
    for (const qty of [0, 1, 2]) {
      const pattern = draftedPattern();
      pattern.pieces = [
        {
          id: "x",
          name: "x",
          qty,
          outline: { kind: "polygon", points: "0,0" },
          label: { x: 0, y: 0 },
          detailRows: [],
        },
      ];
      seedCanvas({ pattern });
      const { unmount } = renderWithIntl(<CanvasArea />);
      expect(
        screen.getByText(
          tFooter("statusReady", {
            copyCount: qty,
            baseSize: pattern.baseSize,
            unit: pattern.unit,
          }),
        ),
      ).toBeInTheDocument();
      unmount();
    }
  });
});

// EDCH-02: Exportar's gating now flows from CanvasArea into TabBar (#17/#116
// moved from Footer.tsx). Round 2 (redesign-fidelity-pass): Exportar opens
// ExportModal in-editor instead of linking to the dedicated /export screen.
describe("CanvasArea Exportar wiring (moved from Footer)", () => {
  it("opens the export modal when drafted and conflict-free", async () => {
    const user = userEvent.setup();
    const pattern = draftedPattern();
    seedCanvas({ pattern });
    renderWithIntl(<CanvasArea />);
    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.exportButton }),
    );
    expect(
      screen.getByRole("dialog", { name: ptBR.ExportModal.title2d }),
    ).toBeInTheDocument();
  });

  it("disables with the blank-pattern reason before anything is drafted", () => {
    seedCanvas({ pattern: blankPattern() });
    renderWithIntl(<CanvasArea />);
    expect(
      screen.getByRole("button", { name: ptBR.Footer.exportButton }),
    ).toHaveAttribute("title", ptBR.Footer.exportDisabledBlankTitle);
  });

  it("disables with the conflict reason while a seam conflict is open", () => {
    const { pattern, conflict } = conflictedPattern();
    seedCanvas({ pattern, conflict });
    renderWithIntl(<CanvasArea />);
    expect(
      screen.getByRole("button", { name: ptBR.Footer.exportButton }),
    ).toHaveAttribute("title", ptBR.Footer.exportDisabledConflictTitle);
  });
});
