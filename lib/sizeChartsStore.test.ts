import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SizeChartListEntry } from "./types";

vi.mock("./api-client", async () => {
  const actual =
    await vi.importActual<typeof import("./api-client")>("./api-client");
  return {
    ApiError: actual.ApiError,
    listSizeCharts: vi.fn(),
    createSizeChart: vi.fn(),
    updateSizeChart: vi.fn(),
    deleteSizeChart: vi.fn(),
    duplicateSizeChart: vi.fn(),
    activateSizeChart: vi.fn(),
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
    baseMeasurements: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    },
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

  it("surfaces a failed delete", async () => {
    vi.mocked(api.deleteSizeChart).mockRejectedValue(new Error("boom"));

    await useSizeChartsStore.getState().remove("g1");

    expect(useSizeChartsStore.getState().actionError).toBe("request_failed");
  });

  it("clearActionError dismisses it", () => {
    useSizeChartsStore.setState({ actionError: "request_failed" });
    useSizeChartsStore.getState().clearActionError();
    expect(useSizeChartsStore.getState().actionError).toBeNull();
  });
});
