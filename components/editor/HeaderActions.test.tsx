import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { HeaderActions } from "./HeaderActions";
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

describe("HeaderActions — salvar como base", () => {
  beforeEach(() => {
    saveAsSloper.mockReset().mockResolvedValue(true);
    useEditorStore.setState({ saveAsSloper });
  });

  it("saves the drafted pattern under the typed name", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <HeaderActions
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
      <HeaderActions
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
    renderWithIntl(<HeaderActions {...props} generating={false} />);
    expect(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseButton }),
    ).toBeDisabled();
  });
});

describe("HeaderActions — link para o histórico de versões", () => {
  it("links to the pattern's own history screen", () => {
    const pattern = draftedPattern();
    renderWithIntl(
      <HeaderActions
        pattern={pattern}
        conflictActive={false}
        generating={false}
      />,
    );
    const link = screen.getByRole("link", {
      name: ptBR.Footer.versionsHistoryButton,
    });
    expect(link).toHaveAttribute("href", `/pattern/${pattern.id}/versions`);
  });
});
