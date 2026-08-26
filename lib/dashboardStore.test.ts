import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PatternListItem } from "./api-client";

vi.mock("./api-client", async () => {
  const actual =
    await vi.importActual<typeof import("./api-client")>("./api-client");
  return {
    ApiError: actual.ApiError,
    errorCode: actual.errorCode,
    listPatterns: vi.fn(),
    createPattern: vi.fn(),
    renamePattern: vi.fn(),
    deletePattern: vi.fn(),
    getAccountSummary: vi.fn(),
  };
});

import * as api from "./api-client";
import { ApiError } from "./api-client";
import { useDashboardStore, filteredPatterns } from "./dashboardStore";

function pattern(overrides: Partial<PatternListItem> = {}): PatternListItem {
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
    vi.mocked(api.listPatterns).mockReset();
    vi.mocked(api.getAccountSummary).mockReset();
    useDashboardStore.setState({
      ready: false,
      error: false,
      patterns: [],
      credits: null,
      recentUsage: [],
      search: "",
      typeFilter: "all",
    });
  });

  it("loads patterns and account summary", async () => {
    vi.mocked(api.listPatterns).mockResolvedValue([pattern()]);
    vi.mocked(api.getAccountSummary).mockResolvedValue({
      credits: {
        plan: "atelier",
        balance: 320,
        total: 500,
        renewsInDays: 12,
      },
      recentUsage: [],
    });
    await useDashboardStore.getState().init();
    const s = useDashboardStore.getState();
    expect(s.ready).toBe(true);
    expect(s.patterns).toHaveLength(1);
    expect(s.credits?.balance).toBe(320);
  });

  it("sets error and ready on failure, without throwing", async () => {
    vi.mocked(api.listPatterns).mockRejectedValue(new Error("boom"));
    vi.mocked(api.getAccountSummary).mockResolvedValue({
      credits: {
        plan: "atelier",
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
    vi.mocked(api.renamePattern).mockReset();
    vi.mocked(api.deletePattern).mockReset();
    useDashboardStore.setState({
      patterns: [pattern(), pattern({ id: "m2", name: "Vestido" })],
    });
  });

  it("rename updates the local list optimistically after the call resolves", async () => {
    vi.mocked(api.renamePattern).mockResolvedValue(undefined);
    await useDashboardStore.getState().rename("m1", "Blusa nova");
    expect(api.renamePattern).toHaveBeenCalledWith("m1", "Blusa nova");
    expect(
      useDashboardStore.getState().patterns.find((p) => p.id === "m1")?.name,
    ).toBe("Blusa nova");
  });

  it("remove drops the pattern from the local list", async () => {
    vi.mocked(api.deletePattern).mockResolvedValue(undefined);
    await useDashboardStore.getState().remove("m1");
    expect(api.deletePattern).toHaveBeenCalledWith("m1");
    expect(useDashboardStore.getState().patterns.map((p) => p.id)).toEqual([
      "m2",
    ]);
  });
});

describe("filteredPatterns", () => {
  const patterns = [
    pattern({ id: "m1", name: "Vestido de festa", garmentType: "dress" }),
    pattern({ id: "m2", name: "Camiseta básica", garmentType: "tshirt" }),
    pattern({ id: "m3", name: "Vestido curto", garmentType: "dress" }),
  ];

  it("filters by case-insensitive name search", () => {
    const out = filteredPatterns({
      patterns,
      search: "vestido",
      typeFilter: "all",
    });
    expect(out.map((p) => p.id)).toEqual(["m1", "m3"]);
  });

  it("filters by garment type", () => {
    const out = filteredPatterns({
      patterns,
      search: "",
      typeFilter: "tshirt",
    });
    expect(out.map((p) => p.id)).toEqual(["m2"]);
  });

  it("combines search and type filter", () => {
    const out = filteredPatterns({
      patterns,
      search: "curto",
      typeFilter: "dress",
    });
    expect(out.map((p) => p.id)).toEqual(["m3"]);
  });
});

// The store only ever caught on the initial load, so a failed rename/delete/
// create became an unhandled rejection: the row silently stayed (or vanished
// from) the list with nothing on screen.
describe("dashboardStore mutation failures", () => {
  beforeEach(() => {
    vi.mocked(api.renamePattern).mockReset();
    vi.mocked(api.deletePattern).mockReset();
    vi.mocked(api.createPattern).mockReset();
    useDashboardStore.setState({
      patterns: [pattern({ id: "m1", name: "Blusa" })],
      actionError: null,
    });
  });

  it("surfaces a failed rename and leaves the old name in place", async () => {
    vi.mocked(api.renamePattern).mockRejectedValue(new Error("boom"));

    await useDashboardStore.getState().rename("m1", "Vestido");

    expect(useDashboardStore.getState().actionError).toBe("request_failed");
    expect(useDashboardStore.getState().patterns[0].name).toBe("Blusa");
  });

  it("surfaces a failed delete and keeps the pattern in the list", async () => {
    vi.mocked(api.deletePattern).mockRejectedValue(new Error("boom"));

    await useDashboardStore.getState().remove("m1");

    expect(useDashboardStore.getState().actionError).toBe("request_failed");
    expect(useDashboardStore.getState().patterns).toHaveLength(1);
  });

  // create()'s caller navigates to the returned id; it must get null rather
  // than a rejected promise to route on.
  it("returns null from a failed create instead of throwing", async () => {
    vi.mocked(api.createPattern).mockRejectedValue(new Error("boom"));

    await expect(useDashboardStore.getState().create()).resolves.toBeNull();
    expect(useDashboardStore.getState().actionError).toBe("request_failed");
  });

  it("carries the wire code when the failure is an ApiError", async () => {
    vi.mocked(api.renamePattern).mockRejectedValue(
      new ApiError(401, "unauthorized"),
    );

    await useDashboardStore.getState().rename("m1", "Vestido");

    expect(useDashboardStore.getState().actionError).toBe("unauthorized");
  });

  it("clearActionError dismisses it", () => {
    useDashboardStore.setState({ actionError: "request_failed" });
    useDashboardStore.getState().clearActionError();
    expect(useDashboardStore.getState().actionError).toBeNull();
  });
});
