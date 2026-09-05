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
    generate: vi.fn(),
    renamePattern: vi.fn(),
    deletePattern: vi.fn(),
    getAccountSummary: vi.fn(),
  };
});

import * as api from "./api-client";
import { ApiError } from "./api-client";
import {
  useDashboardStore,
  filteredPatterns,
  type NewPatternFormInput,
} from "./dashboardStore";

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
      checklist: null,
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
      checklist: {
        hasCustomSizeChart: false,
        hasExported: false,
        hasImported: false,
      },
    });
    await useDashboardStore.getState().init();
    const s = useDashboardStore.getState();
    expect(s.ready).toBe(true);
    expect(s.patterns).toHaveLength(1);
    expect(s.credits?.balance).toBe(320);
  });

  it("stores the checklist progress from the account summary", async () => {
    vi.mocked(api.listPatterns).mockResolvedValue([]);
    vi.mocked(api.getAccountSummary).mockResolvedValue({
      credits: { plan: "atelier", balance: 320, total: 500, renewsInDays: 12 },
      recentUsage: [],
      checklist: {
        hasCustomSizeChart: true,
        hasExported: false,
        hasImported: true,
      },
    });
    await useDashboardStore.getState().init();
    expect(useDashboardStore.getState().checklist).toEqual({
      hasCustomSizeChart: true,
      hasExported: false,
      hasImported: true,
    });
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
      checklist: {
        hasCustomSizeChart: false,
        hasExported: false,
        hasImported: false,
      },
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

// The new-pattern form's own submit: one create, then one generate against
// it. Structurally the importStore's createPatternFromImport, including the
// pendingPatternId reuse that keeps a retry from orphaning a second Pattern.
describe("dashboardStore.createFromForm", () => {
  const input: NewPatternFormInput = {
    name: "Blusa gola alta",
    message: "Novo molde: Blusa · Gola: Camiseira",
    formSpec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { collar: "convertible" },
    },
    sizeChartId: "sc1",
    images: [{ mediaType: "image/jpeg", base64: "AAAA" }],
    engine: "moldai",
  };

  beforeEach(() => {
    vi.mocked(api.createPattern).mockReset();
    vi.mocked(api.generate).mockReset();
    useDashboardStore.setState({
      actionError: null,
      creatingFromForm: false,
      pendingPatternId: null,
    });
  });

  it("creates one pattern under the typed name, generates once, and resolves to the id", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "ok",
      state: {} as never,
    });

    const result = await useDashboardStore.getState().createFromForm(input);

    expect(result).toEqual({ status: "ok", id: "p1" });
    expect(api.createPattern).toHaveBeenCalledTimes(1);
    expect(api.createPattern).toHaveBeenCalledWith({
      name: "Blusa gola alta",
    });
    expect(api.generate).toHaveBeenCalledTimes(1);
    expect(api.generate).toHaveBeenCalledWith(
      "p1",
      "Novo molde: Blusa · Gola: Camiseira",
      {
        formSpec: input.formSpec,
        sizeChartId: "sc1",
        images: input.images,
        engine: "moldai",
      },
    );
    expect(useDashboardStore.getState().actionError).toBeNull();
    expect(useDashboardStore.getState().pendingPatternId).toBeNull();
  });

  // PFORM-04: an empty name is not a validation failure -- the route
  // resolves the catalog default, so the key is simply left off the body.
  it("omits a blank name so the route applies its own default", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "ok",
      state: {} as never,
    });

    await useDashboardStore
      .getState()
      .createFromForm({ ...input, name: "   " });

    expect(vi.mocked(api.createPattern).mock.calls[0][0]?.name).toBeUndefined();
  });

  // A null chart id means "the account's active chart" -- the fallback a
  // failed chart-list fetch takes. Sending it as null would be a body key
  // the route then has to tolerate.
  it("omits sizeChartId entirely when the form had no chart to offer", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "ok",
      state: {} as never,
    });

    await useDashboardStore
      .getState()
      .createFromForm({ ...input, sizeChartId: null });

    expect(
      vi.mocked(api.generate).mock.calls[0][2]?.sizeChartId,
    ).toBeUndefined();
  });

  // A conflict is a real draft with a seam warning attached, and ask/decline
  // both leave the model's own words in the pattern's chat. All three
  // navigate: the editor is where the user reads them.
  it.each(["conflict", "clarify", "declined"] as const)(
    "resolves to the id on a %s response, with no second generate call",
    async (status) => {
      vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
      vi.mocked(api.generate).mockResolvedValue({
        status,
        state: {} as never,
      });

      const result = await useDashboardStore.getState().createFromForm(input);

      expect(result).toEqual({ status: "ok", id: "p1" });
      expect(api.generate).toHaveBeenCalledTimes(1);
      expect(useDashboardStore.getState().actionError).toBeNull();
    },
  );

  it("reports create_failed for a response that produced no draft at all", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "error",
      state: {} as never,
    });

    const result = await useDashboardStore.getState().createFromForm(input);

    expect(result).toEqual({ status: "error", code: "create_failed" });
    expect(useDashboardStore.getState().actionError).toBe("create_failed");
    expect(useDashboardStore.getState().pendingPatternId).toBe("p1");
  });

  // PFORM-08: the Pattern already exists by the time the wallet refuses, so
  // its id is kept and the retry resumes it.
  it("keeps the created pattern's id on a 402 and reuses it on the next submit", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "insufficient_credits",
      required: 1,
      balance: 0,
    });

    const first = await useDashboardStore.getState().createFromForm(input);

    expect(first).toEqual({
      status: "error",
      code: "insufficient_credits",
    });
    expect(useDashboardStore.getState().actionError).toBe(
      "insufficient_credits",
    );
    expect(useDashboardStore.getState().pendingPatternId).toBe("p1");

    vi.mocked(api.generate).mockResolvedValue({
      status: "ok",
      state: {} as never,
    });
    const second = await useDashboardStore.getState().createFromForm(input);

    expect(second).toEqual({ status: "ok", id: "p1" });
    expect(api.createPattern).toHaveBeenCalledTimes(1);
  });

  // PFORM-09: the wire code itself, not a fixed literal -- the dialog
  // renders a per-code message and ActionErrorNotice shows one fixed
  // sentence, so the code has to reach both.
  it("records and returns the thrown ApiError's own wire code", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockRejectedValue(
      new ApiError(400, "message_too_long"),
    );

    const result = await useDashboardStore.getState().createFromForm(input);

    expect(result).toEqual({ status: "error", code: "message_too_long" });
    expect(useDashboardStore.getState().actionError).toBe("message_too_long");
    expect(useDashboardStore.getState().pendingPatternId).toBe("p1");
  });

  it("falls back to request_failed for a non-ApiError throw", async () => {
    vi.mocked(api.createPattern).mockRejectedValue(new Error("boom"));

    const result = await useDashboardStore.getState().createFromForm(input);

    expect(result).toEqual({ status: "error", code: "request_failed" });
    expect(useDashboardStore.getState().actionError).toBe("request_failed");
  });

  it("clears a previous failure's actionError when a retry starts", async () => {
    useDashboardStore.setState({ actionError: "insufficient_credits" });
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "ok",
      state: {} as never,
    });

    await useDashboardStore.getState().createFromForm(input);

    expect(useDashboardStore.getState().actionError).toBeNull();
  });

  // PFORM-07: the dialog is undismissable and its controls disabled off
  // this flag, so a path that leaves it true strands the whole screen.
  it("holds creatingFromForm true for the round trip and clears it on success", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    let resolveGenerate!: (v: never) => void;
    vi.mocked(api.generate).mockReturnValue(
      new Promise((r) => (resolveGenerate = r as (v: never) => void)),
    );

    const promise = useDashboardStore.getState().createFromForm(input);
    await vi.waitFor(() =>
      expect(useDashboardStore.getState().creatingFromForm).toBe(true),
    );

    resolveGenerate({ status: "ok", state: {} } as never);
    await promise;

    expect(useDashboardStore.getState().creatingFromForm).toBe(false);
  });

  it.each([
    ["a 402", { status: "insufficient_credits", required: 1, balance: 0 }],
    ["a draft-less response", { status: "error", state: {} }],
  ] as [string, never][])(
    "clears creatingFromForm on %s",
    async (_name, response) => {
      vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
      vi.mocked(api.generate).mockResolvedValue(response);

      await useDashboardStore.getState().createFromForm(input);

      expect(useDashboardStore.getState().creatingFromForm).toBe(false);
    },
  );

  it("clears creatingFromForm on the throwing path too", async () => {
    vi.mocked(api.createPattern).mockRejectedValue(new Error("boom"));

    await useDashboardStore.getState().createFromForm(input);

    expect(useDashboardStore.getState().creatingFromForm).toBe(false);
  });
});
