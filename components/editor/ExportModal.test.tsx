import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  screen,
  ptBR,
  userEvent,
} from "@/components/test-utils";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec, PatternRecord } from "@/lib/types";
import { ExportModal } from "./ExportModal";

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

function draftedPattern(): PatternRecord {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  return { ...state.pattern, updatedAt: "2026-01-01T00:00:00.000Z" };
}

// exportPattern reaches document.createElement("a")/URL.createObjectURL --
// real jsdom has neither meaningfully implemented, so the 2d/corte download
// path is stubbed the same way lib/export/index.test.ts's own suite does.
vi.mock("@/lib/export/download", () => ({
  downloadFile: vi.fn(),
  slug: (s: string) => s.toLowerCase(),
}));

describe("ExportModal", () => {
  it("renders the 2D title/format list on the pattern2d variant", () => {
    renderWithIntl(
      <ExportModal
        pattern={draftedPattern()}
        variant="2d"
        conflictActive={false}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: ptBR.ExportModal.title2d }),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.Footer.formatSvg)).toBeInTheDocument();
  });

  it("renders the corte title and a fabric consumption estimate", () => {
    renderWithIntl(
      <ExportModal
        pattern={draftedPattern()}
        variant="corte"
        conflictActive={false}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: ptBR.ExportModal.titleCorte }),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.Footer.formatPdfA4)).toBeInTheDocument();
  });

  it("disables the download button while a conflict is active, on every variant", () => {
    renderWithIntl(
      <ExportModal
        pattern={draftedPattern()}
        variant="2d"
        conflictActive={true}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: ptBR.ExportModal.downloadDefault }),
    ).toBeDisabled();
    expect(screen.getByText(ptBR.ExportModal.conflictNote)).toBeInTheDocument();
  });

  it("ficha variant: real items are checked and toggleable, unbacked items are disabled+unchecked", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ExportModal
        pattern={draftedPattern()}
        variant="ficha"
        conflictActive={false}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    const measurements = screen.getByRole("checkbox", {
      name: ptBR.ExportModal.includeMeasurements,
    });
    const materials = screen.getByRole("checkbox", {
      name: ptBR.ExportModal.includeMaterials,
    });
    expect(measurements).toBeChecked();
    expect(measurements).toBeEnabled();
    expect(materials).not.toBeChecked();
    expect(materials).toBeDisabled();

    await user.click(measurements);
    expect(measurements).not.toBeChecked();
  });

  it("calls onOpenChange(false) from the Cancelar button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithIntl(
      <ExportModal
        pattern={draftedPattern()}
        variant="2d"
        conflictActive={false}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.ExportModal.cancelButton }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
