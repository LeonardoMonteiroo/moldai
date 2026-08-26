import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
  waitFor,
} from "@/components/test-utils";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { Credits, GarmentSpec, PatternRecord } from "@/lib/types";
import { ExportShell } from "./ExportShell";
import { exportPattern } from "@/lib/export";

// PageHeader (rendered via AppShell) calls useRouter() for the avatar menu's
// sign-out; jsdom has no App Router mounted, matching every other
// AppShell/PageHeader shell test in this repo.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

function draftedPattern(): PatternRecord {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  return { ...state.pattern, updatedAt: new Date().toISOString() };
}

function blankPattern(): PatternRecord {
  return {
    ...seedPatternState(t).pattern,
    updatedAt: new Date().toISOString(),
  };
}

const CREDITS: Credits = {
  plan: "free",
  balance: 30,
  total: 30,
  renewsInDays: 30,
};

// A format row's accessible name is its label PLUS any note span rendered
// alongside it (e.g. formatDxfAama's beta caveat) — an exact-string
// getByRole match only works for the note-free rows, so every lookup goes
// through this partial (regex) match instead.
function byLabel(label: string) {
  return new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

describe("ExportShell — molde em branco", () => {
  it("shows an empty state instead of format/options/checklist for a blank pattern", () => {
    renderWithIntl(
      <ExportShell
        pattern={blankPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    expect(screen.getByText(ptBR.Export.emptyTitle)).toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: ptBR.Export.formatsHeading }),
    ).not.toBeInTheDocument();
  });
});

describe("ExportShell — lista de formatos", () => {
  it("renders the five real formats as selectable and the three unbuilt ones disabled and badged", () => {
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );

    for (const labelKey of [
      "formatSvg",
      "formatDxf",
      "formatDxfAama",
      "formatPdfA4",
      "formatPdfSingle",
    ] as const) {
      const row = screen.getByRole("radio", {
        name: byLabel(ptBR.Footer[labelKey]),
      });
      expect(row).toBeEnabled();
    }

    for (const id of ["moldeme", "plotter", "techsheet"] as const) {
      const row = screen.getByRole("radio", {
        name: byLabel(ptBR.Export.format[id]),
      });
      expect(row).toBeDisabled();
    }
    expect(
      screen.getAllByText(ptBR.Export.comingSoonBadge).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("selects dxf-aama by default, in the accent (olive) styling", () => {
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    const dxfAama = screen.getByRole("radio", {
      name: byLabel(ptBR.Footer.formatDxfAama),
    });
    expect(dxfAama).toHaveAttribute("aria-checked", "true");
  });

  it("switches the selected format on click", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    const svgRow = screen.getByRole("radio", { name: ptBR.Footer.formatSvg });
    await user.click(svgRow);
    expect(svgRow).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: byLabel(ptBR.Footer.formatDxfAama) }),
    ).toHaveAttribute("aria-checked", "false");
  });
});

// #17 AC: "An active seam conflict blocks the download and says so" plus the
// three reasons a "download is blocked" must each be stated somewhere the
// user meets them: conflict is the only one that actually blocks the
// download button (blank/generating are handled by the Footer link and the
// empty state above, respectively).
describe("ExportShell — conflito de costura bloqueia o download", () => {
  it("disables Baixar arquivo and states why when a conflict is active", () => {
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={true}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    const downloadButton = screen.getByRole("button", {
      name: ptBR.Export.downloadButton,
    });
    expect(downloadButton).toBeDisabled();
    expect(downloadButton).toHaveAttribute(
      "title",
      ptBR.Export.downloadDisabledConflictTitle,
    );
    expect(
      screen.getByText(ptBR.Export.checklistConflictFail),
    ).toBeInTheDocument();
  });

  it("enables Baixar arquivo once there is no conflict", () => {
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    const downloadButton = screen.getByRole("button", {
      name: ptBR.Export.downloadButton,
    });
    expect(downloadButton).toBeEnabled();
    expect(downloadButton).not.toHaveAttribute("title");
  });
});

describe("ExportShell — opções desabilitadas com motivo (#17)", () => {
  it("states a reason on every inert select: margem, piques, nome das peças", () => {
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    expect(
      screen.getByTitle(ptBR.Export.seamAllowanceDisabledTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(ptBR.Export.marksDisabledTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(ptBR.Export.namingDisabledTitle),
    ).toBeInTheDocument();
  });

  it("leaves the size select real, offering only the base size honestly (no grading yet)", () => {
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    const sizeSelect = screen.getByTitle(ptBR.Export.sizeNoOtherSizesTitle);
    expect(sizeSelect).toBeInTheDocument();
    expect(sizeSelect).toHaveAttribute("data-disabled");
  });
});

describe("ExportShell — baixar arquivo", () => {
  beforeEach(() => {
    vi.mocked(exportPattern).mockClear();
  });

  it("calls exportPattern with the selected format and base size", async () => {
    const user = userEvent.setup();
    const pattern = draftedPattern();
    renderWithIntl(
      <ExportShell
        pattern={pattern}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.Export.downloadButton }),
    );
    expect(exportPattern).toHaveBeenCalledWith(
      pattern,
      "dxf-aama",
      expect.anything(),
      expect.any(Function),
      pattern.baseSize,
    );
  });

  it("surfaces a failed export instead of swallowing it (no .catch(() => {}))", async () => {
    vi.mocked(exportPattern).mockImplementation(
      (_pattern, _format, translate, onError) => {
        onError?.(translate("exportFailed"));
      },
    );
    const user = userEvent.setup();
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.Export.downloadButton }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      ptBR.PatternData.exportFailed,
    );
  });
});

describe("ExportShell — preset salvo (#17)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips the selected format through a save + remount", async () => {
    const user = userEvent.setup();
    const pattern = draftedPattern();
    const { unmount } = renderWithIntl(
      <ExportShell
        pattern={pattern}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );

    await user.click(
      screen.getByRole("radio", { name: ptBR.Footer.formatSvg }),
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.Export.savePresetButton }),
    );
    expect(
      await screen.findByText(ptBR.Export.presetSaved),
    ).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <ExportShell
        pattern={pattern}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: ptBR.Footer.formatSvg }),
      ).toHaveAttribute("aria-checked", "true");
    });
  });
});
