import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
  translatorFor,
} from "@/components/test-utils";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { Footer } from "./Footer";
import { useEditorStore } from "@/lib/store";

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

function draftedPattern(): Pattern {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  return state.pattern;
}

const saveAsSloper = vi.fn();

describe("Footer — salvar como base", () => {
  beforeEach(() => {
    saveAsSloper.mockReset().mockResolvedValue(true);
    useEditorStore.setState({ saveAsSloper });
  });

  it("saves the drafted pattern under the typed name", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <Footer
        pattern={draftedPattern()}
        conflictActive={false}
        generating={false}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseButton }),
    );
    const field = screen.getByLabelText(ptBR.Footer.saveAsBasePrompt);
    await user.clear(field);
    await user.type(field, "base corpo reto");
    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseSaveButton }),
    );

    expect(saveAsSloper).toHaveBeenCalledWith("base corpo reto");
    expect(await screen.findByText(ptBR.Footer.saveAsBaseSaved)).toBeVisible();
  });

  it("shows an inline notice when the save fails, keeping the screen usable", async () => {
    saveAsSloper.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithIntl(
      <Footer
        pattern={draftedPattern()}
        conflictActive={false}
        generating={false}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseButton }),
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseSaveButton }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      ptBR.Footer.saveAsBaseError,
    );
  });

  it.each([
    [
      "a blank pattern",
      { pattern: seedPatternState(t).pattern, conflictActive: false },
    ],
    ["an active conflict", { pattern: draftedPattern(), conflictActive: true }],
  ])("is disabled for %s", (_label, props) => {
    renderWithIntl(<Footer {...props} generating={false} />);
    expect(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseButton }),
    ).toBeDisabled();
  });
});

// #116: the export button used to disable silently, with no reason -- unlike
// its "salvar como base" sibling, which already carried a title.
describe("Footer — motivo do botão Exportar desabilitado (#116)", () => {
  it.each([
    [
      "a blank pattern",
      {
        pattern: seedPatternState(t).pattern,
        conflictActive: false,
        generating: false,
      },
      ptBR.Footer.exportDisabledBlankTitle,
    ],
    [
      "an active conflict",
      { pattern: draftedPattern(), conflictActive: true, generating: false },
      ptBR.Footer.exportDisabledConflictTitle,
    ],
    [
      "a regeneration in progress",
      { pattern: draftedPattern(), conflictActive: false, generating: true },
      ptBR.Footer.exportDisabledGeneratingTitle,
    ],
  ])("states why for %s", (_label, props, expectedTitle) => {
    renderWithIntl(<Footer {...props} />);
    expect(
      screen.getByRole("button", { name: ptBR.Footer.exportButton }),
    ).toHaveAttribute("title", expectedTitle);
  });

  it("carries no title once the pattern is drafted and conflict-free", () => {
    renderWithIntl(
      <Footer
        pattern={draftedPattern()}
        conflictActive={false}
        generating={false}
      />,
    );
    // #17: an enabled Exportar is now a link to the dedicated export
    // screen (Button asChild renders the Link's own <a>, not a <button>),
    // so it carries no "title" at all -- there is nothing left to explain.
    expect(
      screen.getByRole("link", { name: ptBR.Footer.exportButton }),
    ).not.toHaveAttribute("title");
  });
});

// #17: the dropdown that used to live here was removed in favor of a
// dedicated /pattern/[id]/export screen -- Exportar just navigates there.
describe("Footer — link para a tela de exportação (#17)", () => {
  it("links to the pattern's dedicated export screen when enabled", () => {
    const pattern = draftedPattern();
    renderWithIntl(
      <Footer pattern={pattern} conflictActive={false} generating={false} />,
    );
    expect(
      screen.getByRole("link", { name: ptBR.Footer.exportButton }),
    ).toHaveAttribute("href", `/pattern/${pattern.id}/export`);
  });

  it("renders no link at all while disabled — there is nothing to navigate to yet", () => {
    renderWithIntl(
      <Footer
        pattern={seedPatternState(t).pattern}
        conflictActive={false}
        generating={false}
      />,
    );
    expect(
      screen.queryByRole("link", { name: ptBR.Footer.exportButton }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.Footer.exportButton }),
    ).toBeDisabled();
  });
});

// #106: {copyCount} cópias was a hardcoded plural noun -- a single-copy
// garment (or the pre-generation moment before any piece exists) rendered
// "1 cópias"/"0 cópias". Covers the plural boundary directly against the
// catalog's own ICU resolution.
describe("Footer — status text pluralization (#106)", () => {
  const tFooter = translatorFor("Footer");

  function patternWithPieceCount(qty: number) {
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
    return pattern;
  }

  it("pluralizes the copy count correctly at 0, 1 and 2", () => {
    for (const qty of [0, 1, 2]) {
      const { unmount } = renderWithIntl(
        <Footer
          pattern={patternWithPieceCount(qty)}
          conflictActive={false}
          generating={false}
        />,
      );
      const expected = tFooter("statusReady", {
        copyCount: qty,
        baseSize: "M",
        unit: "cm",
      });
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });
});
