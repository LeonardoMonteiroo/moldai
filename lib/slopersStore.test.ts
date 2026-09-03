import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SloperListItem } from "./types";

vi.mock("./api-client", async () => {
  const actual =
    await vi.importActual<typeof import("./api-client")>("./api-client");
  return {
    ApiError: actual.ApiError,
    errorCode: actual.errorCode,
    listSlopers: vi.fn(),
    createPattern: vi.fn(),
    renameSloper: vi.fn(),
    deleteSloper: vi.fn(),
  };
});

import * as api from "./api-client";
import { ApiError } from "./api-client";
import { useSlopersStore, filteredSlopers } from "./slopersStore";

function sloper(overrides: Partial<SloperListItem> = {}): SloperListItem {
  return {
    id: "s1",
    name: "Base feminina",
    garmentType: "blouse",
    baseSize: "M",
    updatedAt: "2026-08-22T00:00:00.000Z",
    thumbnailSvg: "<svg/>",
    ...overrides,
  };
}

function resetStore() {
  useSlopersStore.setState({
    ready: false,
    error: false,
    actionError: null,
    slopers: [],
    search: "",
    typeFilter: "all",
  });
}

describe("slopersStore.init", () => {
  beforeEach(() => {
    vi.mocked(api.listSlopers).mockReset();
    resetStore();
  });

  it("loads slopers into state on success", async () => {
    vi.mocked(api.listSlopers).mockResolvedValue([sloper()]);
    await useSlopersStore.getState().init();
    const s = useSlopersStore.getState();
    expect(s.ready).toBe(true);
    expect(s.slopers).toHaveLength(1);
    expect(s.slopers[0].id).toBe("s1");
  });

  it("sets error and ready on failure, without throwing", async () => {
    vi.mocked(api.listSlopers).mockRejectedValue(new Error("boom"));
    await useSlopersStore.getState().init();
    const s = useSlopersStore.getState();
    expect(s.error).toBe(true);
    expect(s.ready).toBe(true);
  });
});

describe("slopersStore.rename", () => {
  beforeEach(() => {
    vi.mocked(api.renameSloper).mockReset();
    resetStore();
    useSlopersStore.setState({
      slopers: [sloper({ id: "s1", name: "Base feminina" })],
    });
  });

  // The important regression this guards: a naive optimistic write (or a
  // pre-await write) would pass a test that only checks state *after* the
  // call resolves. Using a deferred promise lets the assertion observe state
  // while the request is still in flight, before it is allowed to resolve.
  it("updates the local list only after the server call resolves", async () => {
    let resolveRename!: () => void;
    vi.mocked(api.renameSloper).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRename = resolve;
      }),
    );

    const renamed = useSlopersStore.getState().rename("s1", "Base nova");

    // Still pending: the old name must still be in state.
    expect(
      useSlopersStore.getState().slopers.find((x) => x.id === "s1")?.name,
    ).toBe("Base feminina");

    resolveRename();
    await renamed;

    expect(
      useSlopersStore.getState().slopers.find((x) => x.id === "s1")?.name,
    ).toBe("Base nova");
  });

  it("surfaces a failed rename and leaves the row untouched", async () => {
    vi.mocked(api.renameSloper).mockRejectedValue(new Error("boom"));

    await useSlopersStore.getState().rename("s1", "Base nova");

    expect(useSlopersStore.getState().actionError).toBe("request_failed");
    expect(
      useSlopersStore.getState().slopers.find((x) => x.id === "s1")?.name,
    ).toBe("Base feminina");
  });
});

describe("slopersStore.remove", () => {
  beforeEach(() => {
    vi.mocked(api.deleteSloper).mockReset();
    resetStore();
    useSlopersStore.setState({
      slopers: [sloper({ id: "s1" }), sloper({ id: "s2", name: "Outra" })],
    });
  });

  it("surfaces a failed delete with the ApiError's wire code and keeps the row", async () => {
    vi.mocked(api.deleteSloper).mockRejectedValue(
      new ApiError(409, "sloper_in_use"),
    );

    await useSlopersStore.getState().remove("s1");

    expect(useSlopersStore.getState().actionError).toBe("sloper_in_use");
    expect(useSlopersStore.getState().slopers.map((x) => x.id)).toEqual([
      "s1",
      "s2",
    ]);
  });
});

describe("slopersStore actionError coding", () => {
  beforeEach(() => {
    vi.mocked(api.renameSloper).mockReset();
    resetStore();
    useSlopersStore.setState({
      slopers: [sloper({ id: "s1" })],
    });
  });

  it("carries the ApiError's wire code rather than the generic fallback", async () => {
    vi.mocked(api.renameSloper).mockRejectedValue(
      new ApiError(401, "unauthorized"),
    );

    await useSlopersStore.getState().rename("s1", "Base nova");

    expect(useSlopersStore.getState().actionError).toBe("unauthorized");
  });

  it("falls back to request_failed for a non-ApiError rejection", async () => {
    vi.mocked(api.renameSloper).mockRejectedValue(new Error("boom"));

    await useSlopersStore.getState().rename("s1", "Base nova");

    expect(useSlopersStore.getState().actionError).toBe("request_failed");
  });

  it("clearActionError dismisses it", () => {
    useSlopersStore.setState({ actionError: "request_failed" });
    useSlopersStore.getState().clearActionError();
    expect(useSlopersStore.getState().actionError).toBeNull();
  });
});

describe("slopersStore.createPattern", () => {
  beforeEach(() => {
    vi.mocked(api.createPattern).mockReset();
    resetStore();
  });

  it("resolves to null instead of throwing on failure", async () => {
    vi.mocked(api.createPattern).mockRejectedValue(new Error("boom"));

    await expect(
      useSlopersStore.getState().createPattern("s1"),
    ).resolves.toBeNull();
    expect(useSlopersStore.getState().actionError).toBe("request_failed");
  });

  it("forwards its sloperId argument to the client call", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });

    const id = await useSlopersStore.getState().createPattern("s1");

    expect(api.createPattern).toHaveBeenCalledWith({ sloperId: "s1" });
    expect(id).toBe("p1");
  });
});

describe("filteredSlopers", () => {
  const slopers = [
    sloper({ id: "s1", name: "Base vestido festa", garmentType: "dress" }),
    sloper({ id: "s2", name: "Base camiseta básica", garmentType: "tshirt" }),
    sloper({ id: "s3", name: "Base vestido curto", garmentType: "dress" }),
  ];

  it("filters by case-insensitive name search", () => {
    const out = filteredSlopers({
      slopers,
      search: "vestido",
      typeFilter: "all",
    });
    expect(out.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("filters by garment type", () => {
    const out = filteredSlopers({ slopers, search: "", typeFilter: "tshirt" });
    expect(out.map((s) => s.id)).toEqual(["s2"]);
  });

  it("combines search and type filter", () => {
    const out = filteredSlopers({
      slopers,
      search: "curto",
      typeFilter: "dress",
    });
    expect(out.map((s) => s.id)).toEqual(["s3"]);
  });
});
