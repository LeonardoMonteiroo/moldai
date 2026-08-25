import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
  translatorFor,
} from "@/components/test-utils";
import {
  seedPatternState,
  applyGarmentSpec,
  applySizes,
} from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { Footer } from "./Footer";
import { useEditorStore } from "@/lib/store";
import { exportPattern } from "@/lib/export";

vi.mock("@/lib/export", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/export")>("@/lib/export");
  return { ...actual, exportPattern: vi.fn() };
});

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

// #59: a pattern with at least one graduated size (base "M" is seeded with
// "G" also pending, per the system female chart's PP/P/M/G/GG list).
function gradedPattern(): Pattern {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  applySizes(state, ["G"]);
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

// #59: export now redrafts from a chosen size's own measurements instead of
// always the base -- the picker only appears once there's something besides
// the base to choose from.
describe("Footer — seletor de tamanho para exportar (#59)", () => {
  beforeEach(() => {
    vi.mocked(exportPattern).mockClear();
  });

  it("hides the size picker for a pattern with nothing graded", () => {
    renderWithIntl(
      <Footer
        pattern={draftedPattern()}
        conflictActive={false}
        generating={false}
      />,
    );
    expect(
      screen.queryByRole("combobox", { name: ptBR.Footer.exportSizeLabel }),
    ).not.toBeInTheDocument();
  });

  it("shows the size picker once a size is graduated, defaulting to the base size", () => {
    renderWithIntl(
      <Footer
        pattern={gradedPattern()}
        conflictActive={false}
        generating={false}
      />,
    );
    const picker = screen.getByRole("combobox", {
      name: ptBR.Footer.exportSizeLabel,
    });
    expect(picker).toHaveTextContent(
      ptBR.Footer.exportSizeBaseOption.replace("{size}", "M"),
    );
  });

  it("exports the base size by default, and the picked size after selecting one", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <Footer
        pattern={gradedPattern()}
        conflictActive={false}
        generating={false}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.exportButton }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: ptBR.Footer.formatSvg }),
    );
    expect(exportPattern).toHaveBeenLastCalledWith(
      expect.anything(),
      "svg",
      expect.anything(),
      expect.any(Function),
      "M",
    );

    await user.click(
      screen.getByRole("combobox", { name: ptBR.Footer.exportSizeLabel }),
    );
    await user.click(await screen.findByRole("option", { name: "G" }));

    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.exportButton }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: ptBR.Footer.formatSvg }),
    );
    expect(exportPattern).toHaveBeenLastCalledWith(
      expect.anything(),
      "svg",
      expect.anything(),
      expect.any(Function),
      "G",
    );
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
