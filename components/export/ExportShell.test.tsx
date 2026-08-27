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
import { DEFAULT_EXPORT_PRESET } from "@/lib/export/preset";
import { ExportShell } from "./ExportShell";
import { exportPattern } from "@/lib/export";
import { getExportPreset, saveExportPreset } from "@/lib/api-client";

// PageHeader (rendered via AppShell) calls useRouter() for the avatar menu's
// sign-out; jsdom has no App Router mounted, matching every other
// AppShell/PageHeader shell test in this repo.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/lib/export", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/export")>("@/lib/export");
  return { ...actual, exportPattern: vi.fn() };
});

// #17: the preset now round-trips through the account, not localStorage --
// api-client's getExportPreset/saveExportPreset are the seam.
vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return {
    ...actual,
    getExportPreset: vi.fn(),
    saveExportPreset: vi.fn(),
  };
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

// Every test gets a harmless default: "the account has never saved a
// preset" and "saving echoes back whatever was sent" — tests that actually
// exercise persistence override these explicitly.
beforeEach(() => {
  vi.mocked(getExportPreset).mockReset();
  vi.mocked(saveExportPreset).mockReset();
  vi.mocked(getExportPreset).mockResolvedValue({ preset: null });
  vi.mocked(saveExportPreset).mockImplementation(async (preset) => ({
    preset,
  }));
});

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
  it("renders the seven real formats as selectable and the two unbuilt ones disabled and badged", () => {
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
      "formatPdfLayered",
      "formatPlt",
    ] as const) {
      const row = screen.getByRole("radio", {
        name: byLabel(ptBR.Footer[labelKey]),
      });
      expect(row).toBeEnabled();
    }

    for (const id of ["moldeme", "techsheet"] as const) {
      const row = screen.getByRole("radio", {
        name: byLabel(ptBR.Export.format[id]),
      });
      expect(row).toBeDisabled();
    }
    expect(
      screen.getAllByText(ptBR.Export.comingSoonBadge).length,
    ).toBeGreaterThanOrEqual(2);
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
      { pageSize: "a4", rollWidthCm: undefined },
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

// #17 AC: "Salvar preset persists the options on the account and they are
// restored on the next visit" — now a real GET/PUT round trip through
// lib/api-client.ts, not localStorage.
describe("ExportShell — preset salvo na conta (#17)", () => {
  it("saves the selected format through PUT /api/account/export-preset", async () => {
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
      screen.getByRole("radio", { name: ptBR.Footer.formatSvg }),
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.Export.savePresetButton }),
    );

    expect(saveExportPreset).toHaveBeenCalledWith(
      expect.objectContaining({ format: "svg" }),
    );
    expect(
      await screen.findByText(ptBR.Export.presetSaved),
    ).toBeInTheDocument();
  });

  it("restores a preset already saved on the account, on mount", async () => {
    vi.mocked(getExportPreset).mockResolvedValue({
      preset: { ...DEFAULT_EXPORT_PRESET, format: "svg" },
    });
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    // First paint (before the fetch resolves) is the default, dxf-aama —
    // it flips to svg once the account's saved preset arrives.
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: ptBR.Footer.formatSvg }),
      ).toHaveAttribute("aria-checked", "true");
    });
  });

  it("adopts the server's sanitised response, not the raw preset that was sent", async () => {
    // The server is the trust boundary — it can correct what it's handed
    // (e.g. an out-of-range custom roll width the visitor typed).
    vi.mocked(saveExportPreset).mockResolvedValue({
      preset: { ...DEFAULT_EXPORT_PRESET, format: "svg" },
    });
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
      screen.getByRole("radio", { name: ptBR.Footer.formatPdfA4 }),
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.Export.savePresetButton }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: ptBR.Footer.formatSvg }),
      ).toHaveAttribute("aria-checked", "true");
    });
  });

  it("does not let a saved preset load clobber an edit already in progress", async () => {
    let resolveFetch!: (v: { preset: typeof DEFAULT_EXPORT_PRESET }) => void;
    vi.mocked(getExportPreset).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
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

    // The visitor picks svg before the account's saved preset (pdf-a4)
    // arrives.
    await user.click(
      screen.getByRole("radio", { name: ptBR.Footer.formatSvg }),
    );
    resolveFetch({ preset: { ...DEFAULT_EXPORT_PRESET, format: "pdf-a4" } });

    // Give the resolved promise a tick to (not) apply.
    await new Promise((r) => setTimeout(r, 0));
    expect(
      screen.getByRole("radio", { name: ptBR.Footer.formatSvg }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("shows a load-error notice with a retry, and does not throw or block the screen", async () => {
    vi.mocked(getExportPreset).mockRejectedValue(new Error("network"));
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    expect(
      await screen.findByText(ptBR.Export.presetLoadError),
    ).toBeInTheDocument();
    // The rest of the screen still works — the default format is selected
    // and usable.
    expect(
      screen.getByRole("radio", { name: byLabel(ptBR.Footer.formatDxfAama) }),
    ).toHaveAttribute("aria-checked", "true");

    vi.mocked(getExportPreset).mockResolvedValueOnce({ preset: null });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.Export.presetLoadRetry }),
    );
    await waitFor(() => {
      expect(
        screen.queryByText(ptBR.Export.presetLoadError),
      ).not.toBeInTheDocument();
    });
  });

  it("surfaces a failed save instead of swallowing it", async () => {
    vi.mocked(saveExportPreset).mockRejectedValue(new Error("network"));
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
      screen.getByRole("button", { name: ptBR.Export.savePresetButton }),
    );
    expect(
      await screen.findByText(ptBR.Export.presetSaveError),
    ).toBeInTheDocument();
  });
});

// #135/#136: the page-size (pdf-a4) and roll-width (pdf-single/plt)
// controls only appear for the formats they actually affect, and forward
// the chosen value through to exportPattern's options.
describe("ExportShell — tamanho da página e largura do rolo (#135/#136)", () => {
  it("shows the page size selector only for pdf-a4, not for dxf-aama (the default)", () => {
    renderWithIntl(
      <ExportShell
        pattern={draftedPattern()}
        conflictActive={false}
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    expect(
      screen.queryByText(ptBR.Export.pageSizeLabel),
    ).not.toBeInTheDocument();
  });

  it("shows the page size selector after choosing PDF A4, and forwards the pageSize choice", async () => {
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
      screen.getByRole("radio", { name: ptBR.Footer.formatPdfA4 }),
    );
    expect(screen.getByText(ptBR.Export.pageSizeLabel)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: ptBR.Export.downloadButton }),
    );
    expect(exportPattern).toHaveBeenCalledWith(
      pattern,
      "pdf-a4",
      expect.anything(),
      expect.any(Function),
      pattern.baseSize,
      { pageSize: "a4", rollWidthCm: undefined },
    );
  });

  it("shows the roll-width selector for pdf-single and plt, offering the 'no split' default", async () => {
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
      screen.getByRole("radio", { name: ptBR.Footer.formatPdfSingle }),
    );
    expect(screen.getByText(ptBR.Export.rollWidthLabel)).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.Export.rollWidthNoneOption),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: byLabel(ptBR.Footer.formatPlt) }),
    );
    expect(screen.getByText(ptBR.Export.rollWidthLabel)).toBeInTheDocument();
  });
});
