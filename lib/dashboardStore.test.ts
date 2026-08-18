import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MoldeListItem } from "./api-client";

vi.mock("./api-client", () => ({
  listMoldes: vi.fn(),
  createMolde: vi.fn(),
  renameMolde: vi.fn(),
  deleteMolde: vi.fn(),
  getAccountSummary: vi.fn(),
}));

import * as api from "./api-client";
import { useDashboardStore, filteredMoldes } from "./dashboardStore";

function molde(overrides: Partial<MoldeListItem> = {}): MoldeListItem {
  return {
    id: "m1",
    name: "Novo molde",
    garmentType: "blouse",
    updatedAt: "2026-08-18T00:00:00.000Z",
    thumbnailSvg: "<svg/>",
    ...overrides,
  };
}

describe("dashboardStore.init", () => {
  beforeEach(() => {
    vi.mocked(api.listMoldes).mockReset();
    vi.mocked(api.getAccountSummary).mockReset();
    useDashboardStore.setState({
      ready: false,
      error: false,
      moldes: [],
      credits: null,
      recentUsage: [],
      search: "",
      typeFilter: "all",
    });
  });

  it("loads moldes and account summary", async () => {
    vi.mocked(api.listMoldes).mockResolvedValue([molde()]);
    vi.mocked(api.getAccountSummary).mockResolvedValue({
      credits: {
        plan: "atelier",
        planLabel: "Ateliê",
        balance: 320,
        total: 500,
        renewsInDays: 12,
      },
      recentUsage: [],
    });
    await useDashboardStore.getState().init();
    const s = useDashboardStore.getState();
    expect(s.ready).toBe(true);
    expect(s.moldes).toHaveLength(1);
    expect(s.credits?.balance).toBe(320);
  });

  it("sets error and ready on failure, without throwing", async () => {
    vi.mocked(api.listMoldes).mockRejectedValue(new Error("boom"));
    vi.mocked(api.getAccountSummary).mockResolvedValue({
      credits: {
        plan: "atelier",
        planLabel: "Ateliê",
        balance: 0,
        total: 0,
        renewsInDays: 0,
      },
      recentUsage: [],
    });
    await useDashboardStore.getState().init();
    const s = useDashboardStore.getState();
    expect(s.error).toBe(true);
    expect(s.ready).toBe(true);
  });
});

describe("dashboardStore.rename / remove", () => {
  beforeEach(() => {
    vi.mocked(api.renameMolde).mockReset();
    vi.mocked(api.deleteMolde).mockReset();
    useDashboardStore.setState({
      moldes: [molde(), molde({ id: "m2", name: "Vestido" })],
    });
  });

  it("rename updates the local list optimistically after the call resolves", async () => {
    vi.mocked(api.renameMolde).mockResolvedValue(undefined);
    await useDashboardStore.getState().rename("m1", "Blusa nova");
    expect(api.renameMolde).toHaveBeenCalledWith("m1", "Blusa nova");
    expect(
      useDashboardStore.getState().moldes.find((m) => m.id === "m1")?.name,
    ).toBe("Blusa nova");
  });

  it("remove drops the molde from the local list", async () => {
    vi.mocked(api.deleteMolde).mockResolvedValue(undefined);
    await useDashboardStore.getState().remove("m1");
    expect(api.deleteMolde).toHaveBeenCalledWith("m1");
    expect(useDashboardStore.getState().moldes.map((m) => m.id)).toEqual([
      "m2",
    ]);
  });
});

describe("filteredMoldes", () => {
  const moldes = [
    molde({ id: "m1", name: "Vestido de festa", garmentType: "dress" }),
    molde({ id: "m2", name: "Camiseta básica", garmentType: "tshirt" }),
    molde({ id: "m3", name: "Vestido curto", garmentType: "dress" }),
  ];

  it("filters by case-insensitive name search", () => {
    const out = filteredMoldes({
      moldes,
      search: "vestido",
      typeFilter: "all",
    });
    expect(out.map((m) => m.id)).toEqual(["m1", "m3"]);
  });

  it("filters by garment type", () => {
    const out = filteredMoldes({ moldes, search: "", typeFilter: "tshirt" });
    expect(out.map((m) => m.id)).toEqual(["m2"]);
  });

  it("combines search and type filter", () => {
    const out = filteredMoldes({
      moldes,
      search: "curto",
      typeFilter: "dress",
    });
    expect(out.map((m) => m.id)).toEqual(["m3"]);
  });
});
