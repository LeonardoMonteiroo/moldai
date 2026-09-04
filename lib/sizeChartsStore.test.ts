import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SizeChartListEntry } from "./types";
import { SIZE_TABLE } from "./measurements";

vi.mock("./api-client", async () => {
  const actual =
    await vi.importActual<typeof import("./api-client")>("./api-client");
  return {
    ApiError: actual.ApiError,
    errorCode: actual.errorCode,
    listSizeCharts: vi.fn(),
    createSizeChart: vi.fn(),
    updateSizeChart: vi.fn(),
    deleteSizeChart: vi.fn(),
    duplicateSizeChart: vi.fn(),
    activateSizeChart: vi.fn(),
    importSizeChart: vi.fn(),
  };
});

import * as api from "./api-client";
import { ApiError } from "./api-client";
import { useSizeChartsStore } from "./sizeChartsStore";

function entry(
  overrides: Partial<SizeChartListEntry> = {},
): SizeChartListEntry {
  return {
    id: "g1",
    updatedAt: "2026-08-19T00:00:00.000Z",
    name: "Feminino adulto",
    gender: "female",
    bodyType: "straight",
    isSystem: true,
    sizes: ["PP", "P", "M", "G", "GG"],
    baseSizeIndex: 2,
    baseMeasurements: { ...SIZE_TABLE.M },
    progressionRule: {},
    overrides: {},
    isActive: false,
    ...overrides,
  };
}

function resetStore() {
  useSizeChartsStore.setState({
    ready: false,
    error: false,
    charts: [],
    selectedId: null,
    draft: null,
    editingRule: false,
    dirty: false,
    saving: false,
  });
}

describe("sizeChartsStore.init", () => {
  beforeEach(() => {
    vi.mocked(api.listSizeCharts).mockReset();
    resetStore();
  });

  it("selects the active chart and loads its draft", async () => {
    vi.mocked(api.listSizeCharts).mockResolvedValue([
      entry({ id: "g1", isActive: false }),
      entry({ id: "g2", isActive: true, name: "Masculino" }),
    ]);
    await useSizeChartsStore.getState().init();
    const s = useSizeChartsStore.getState();
    expect(s.ready).toBe(true);
    expect(s.selectedId).toBe("g2");
    expect(s.draft?.name).toBe("Masculino");
  });

  it("sets error and ready on failure", async () => {
    vi.mocked(api.listSizeCharts).mockRejectedValue(new Error("boom"));
    await useSizeChartsStore.getState().init();
    const s = useSizeChartsStore.getState();
    expect(s.error).toBe(true);
    expect(s.ready).toBe(true);
  });
});

describe("sizeChartsStore.updateDraft / save", () => {
  beforeEach(() => {
    vi.mocked(api.updateSizeChart).mockReset();
    resetStore();
    useSizeChartsStore.setState({
      charts: [entry({ id: "g1", isSystem: false })],
      selectedId: "g1",
      draft: { ...entry({ id: "g1", isSystem: false }) },
    });
  });

  it("updateDraft merges the patch and marks dirty", () => {
    useSizeChartsStore.getState().updateDraft({ name: "Renomeada" });
    const s = useSizeChartsStore.getState();
    expect(s.draft?.name).toBe("Renomeada");
    expect(s.dirty).toBe(true);
  });

  it("save calls the API and clears dirty", async () => {
    vi.mocked(api.updateSizeChart).mockResolvedValue(
      entry({ id: "g1", isSystem: false, name: "Renomeada" }),
    );
    useSizeChartsStore.getState().updateDraft({ name: "Renomeada" });
    await useSizeChartsStore.getState().save();
    expect(api.updateSizeChart).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ name: "Renomeada" }),
    );
    expect(useSizeChartsStore.getState().dirty).toBe(false);
  });

  it("save is a no-op for a system chart", async () => {
    useSizeChartsStore.setState({
      draft: { ...entry({ id: "g1", isSystem: true }) },
    });
    await useSizeChartsStore.getState().save();
    expect(api.updateSizeChart).not.toHaveBeenCalled();
  });

  // #34: a save's response used to replace the draft outright, so an edit
  // typed after the PATCH was sent but before it resolved got silently
  // thrown away and dirty was cleared — the screen read as fully saved with
  // the newest value gone.
  it("keeps a draft edited mid-flight instead of overwriting it with the response, and leaves dirty true", async () => {
    let resolveUpdate!: (
      v: Awaited<ReturnType<typeof api.updateSizeChart>>,
    ) => void;
    vi.mocked(api.updateSizeChart).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    useSizeChartsStore.getState().updateDraft({ name: "Primeira edição" });
    const savePromise = useSizeChartsStore.getState().save();

    // Edit lands while the PATCH for the first edit is still in flight.
    useSizeChartsStore.getState().updateDraft({ name: "Edição em voo" });

    resolveUpdate(
      entry({ id: "g1", isSystem: false, name: "Primeira edição" }),
    );
    await savePromise;

    const s = useSizeChartsStore.getState();
    expect(s.draft?.name).toBe("Edição em voo");
    expect(s.dirty).toBe(true);
    expect(s.saving).toBe(false);
  });

  it("does not fire a second PATCH while one is already in flight", async () => {
    let resolveUpdate!: (
      v: Awaited<ReturnType<typeof api.updateSizeChart>>,
    ) => void;
    vi.mocked(api.updateSizeChart).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    useSizeChartsStore.getState().updateDraft({ name: "Renomeada" });

    const first = useSizeChartsStore.getState().save();
    expect(useSizeChartsStore.getState().saving).toBe(true);
    const second = useSizeChartsStore.getState().save();

    resolveUpdate(entry({ id: "g1", isSystem: false, name: "Renomeada" }));
    await Promise.all([first, second]);

    expect(api.updateSizeChart).toHaveBeenCalledTimes(1);
  });

  // #34: `saving` used to be a bare store-wide flag, so a save started on
  // one chart and still in flight left the *next* chart's Save button
  // disabled with a "Salvando…" label after switching -- lying about which
  // chart was actually being saved.
  it("resets saving when switching to a different chart mid-save", () => {
    useSizeChartsStore.setState({
      charts: [
        entry({ id: "g1", isSystem: false }),
        entry({ id: "g2", isSystem: false, name: "Outra grade" }),
      ],
    });
    vi.mocked(api.updateSizeChart).mockReturnValue(new Promise(() => {}));
    useSizeChartsStore.getState().updateDraft({ name: "Renomeada" });
    void useSizeChartsStore.getState().save();
    expect(useSizeChartsStore.getState().saving).toBe(true);

    useSizeChartsStore.getState().select("g2");

    expect(useSizeChartsStore.getState().saving).toBe(false);
  });
});

describe("sizeChartsStore.create / duplicate / remove / activate", () => {
  beforeEach(() => {
    vi.mocked(api.createSizeChart).mockReset();
    vi.mocked(api.duplicateSizeChart).mockReset();
    vi.mocked(api.deleteSizeChart).mockReset();
    vi.mocked(api.activateSizeChart).mockReset();
    resetStore();
    useSizeChartsStore.setState({
      charts: [entry({ id: "g1" })],
      selectedId: "g1",
      draft: entry({ id: "g1" }),
    });
  });

  it("create appends the new chart and selects it", async () => {
    vi.mocked(api.createSizeChart).mockResolvedValue(
      entry({ id: "g2", name: "Nova grade" }),
    );
    await useSizeChartsStore.getState().create();
    const s = useSizeChartsStore.getState();
    expect(s.charts.map((c) => c.id)).toEqual(["g1", "g2"]);
    expect(s.selectedId).toBe("g2");
  });

  it("duplicate appends a copy and selects it", async () => {
    vi.mocked(api.duplicateSizeChart).mockResolvedValue(
      entry({ id: "g3", name: "Feminino adulto (cópia)" }),
    );
    await useSizeChartsStore.getState().duplicate("g1");
    expect(api.duplicateSizeChart).toHaveBeenCalledWith("g1");
    expect(useSizeChartsStore.getState().selectedId).toBe("g3");
  });

  it("remove drops the chart and reselects another when the selected one is removed", async () => {
    useSizeChartsStore.setState({
      charts: [entry({ id: "g1" }), entry({ id: "g2" })],
      selectedId: "g1",
    });
    vi.mocked(api.deleteSizeChart).mockResolvedValue(undefined);
    await useSizeChartsStore.getState().remove("g1");
    const s = useSizeChartsStore.getState();
    expect(s.charts.map((c) => c.id)).toEqual(["g2"]);
    expect(s.selectedId).toBe("g2");
  });

  it("activate flips isActive across the list", async () => {
    useSizeChartsStore.setState({
      charts: [
        entry({ id: "g1", isActive: true }),
        entry({ id: "g2", isActive: false }),
      ],
    });
    vi.mocked(api.activateSizeChart).mockResolvedValue(undefined);
    await useSizeChartsStore.getState().activate("g2");
    const s = useSizeChartsStore.getState();
    expect(s.charts.find((c) => c.id === "g1")?.isActive).toBe(false);
    expect(s.charts.find((c) => c.id === "g2")?.isActive).toBe(true);
  });

  // #12: mirrors create/duplicate above -- importChart appends the new
  // chart, selects it, and hands the created record back to the caller (the
  // dialog uses the return value to decide whether to close itself).
  it("importChart appends the new chart, selects it, and returns it", async () => {
    vi.mocked(api.importSizeChart).mockResolvedValue(
      entry({ id: "g4", name: "Grade importada", isSystem: false }),
    );
    const result = await useSizeChartsStore
      .getState()
      .importChart(entry({ id: "ignored", name: "Grade importada" }));
    const s = useSizeChartsStore.getState();
    expect(s.charts.map((c) => c.id)).toEqual(["g1", "g4"]);
    expect(s.selectedId).toBe("g4");
    expect(result?.id).toBe("g4");
  });
});

// Same gap as the dashboard store: only init() caught, so a failed save left
// `dirty` true with no message, and a failed activate/delete silently did
// nothing at all.
describe("sizeChartsStore mutation failures", () => {
  beforeEach(() => {
    vi.mocked(api.updateSizeChart).mockReset();
    vi.mocked(api.deleteSizeChart).mockReset();
    vi.mocked(api.activateSizeChart).mockReset();
    useSizeChartsStore.setState({ actionError: null });
  });

  it("surfaces a failed save and keeps the draft dirty", async () => {
    useSizeChartsStore.setState({
      selectedId: "g1",
      draft: { ...entry({ id: "g1" }), isSystem: false } as never,
      dirty: true,
    });
    vi.mocked(api.updateSizeChart).mockRejectedValue(
      new ApiError(500, "request_failed"),
    );

    await useSizeChartsStore.getState().save();

    expect(useSizeChartsStore.getState().actionError).toBe("request_failed");
    // Still dirty: the edit was not persisted, so it must not look saved.
    expect(useSizeChartsStore.getState().dirty).toBe(true);
  });

  it("surfaces a failed activate", async () => {
    vi.mocked(api.activateSizeChart).mockRejectedValue(new Error("boom"));

    await useSizeChartsStore.getState().activate("g1");

    expect(useSizeChartsStore.getState().actionError).toBe("request_failed");
  });

  // #36: errorCode is now shared from api-client.ts -- pin that this store
  // still surfaces an ApiError's own wire code rather than the generic
  // fallback, not just the two same-value cases above.
  it("carries the ApiError's wire code rather than the generic fallback", async () => {
    vi.mocked(api.activateSizeChart).mockRejectedValue(
      new ApiError(401, "unauthorized"),
    );

    await useSizeChartsStore.getState().activate("g1");

    expect(useSizeChartsStore.getState().actionError).toBe("unauthorized");
  });

  it("surfaces a failed delete", async () => {
    vi.mocked(api.deleteSizeChart).mockRejectedValue(new Error("boom"));

    await useSizeChartsStore.getState().remove("g1");

    expect(useSizeChartsStore.getState().actionError).toBe("request_failed");
  });

  it("surfaces a failed import and returns null instead of a record", async () => {
    vi.mocked(api.importSizeChart).mockRejectedValue(new Error("boom"));

    const result = await useSizeChartsStore
      .getState()
      .importChart(entry({ id: "ignored" }));

    expect(result).toBeNull();
    expect(useSizeChartsStore.getState().actionError).toBe("request_failed");
  });

  it("clearActionError dismisses it", () => {
    useSizeChartsStore.setState({ actionError: "request_failed" });
    useSizeChartsStore.getState().clearActionError();
    expect(useSizeChartsStore.getState().actionError).toBeNull();
  });
});
