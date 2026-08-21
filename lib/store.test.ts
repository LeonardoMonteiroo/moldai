import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "./types";

// ApiError comes from the real module (the store narrows on it with
// instanceof, so a stub class would not be the same constructor).
vi.mock("./api-client", async () => {
  const actual =
    await vi.importActual<typeof import("./api-client")>("./api-client");
  return {
    ApiError: actual.ApiError,
    fetchPattern: vi.fn(),
    generate: vi.fn(),
    graduate: vi.fn(),
    resolveConflict: vi.fn(),
    purchase: vi.fn(),
  };
});

import * as api from "./api-client";
import { ApiError } from "./api-client";
import { useEditorStore } from "./store";

const genMock = api.generate as unknown as ReturnType<typeof vi.fn>;

function emptyState(): EditorState {
  return {
    pattern: {
      id: "p",
      name: "Novo molde",
      version: 0,
      updatedAt: "2026-08-21T00:00:00.000Z",
      baseSize: "M",
      unit: "cm",
      sizes: ["M"],
      sizesApplied: [],
      sizesPending: [],
      sizeTable: {
        M: {
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
      },
      pieces: [],
    },
    chat: [
      {
        id: "m1",
        author: "ai",
        text: "Me conta mais:",
        questions: [
          { id: "q0", label: "Gola", options: ["a", "b"], allowOther: false },
        ],
        createdAt: 1,
      },
    ],
    credits: {
      plan: "atelier",
      balance: 100,
      total: 500,
      renewsInDays: 10,
    },
    conflict: null,
  };
}

describe("store.sendMessage", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({
      patternId: "m1",
      selectedPieceId: null,
      generationStatus: "idle",
    });
  });

  it("forwards patternId, message, and answering to api.generate", async () => {
    genMock.mockResolvedValue({ status: "clarify", state: emptyState() });
    await useEditorStore
      .getState()
      .sendMessage("gola redonda", { answering: true });

    expect(genMock).toHaveBeenCalledWith("m1", "gola redonda", true);
    expect(useEditorStore.getState().generationStatus).toBe("idle");
    expect(useEditorStore.getState().selectedPieceId).toBeNull();
    const last = useEditorStore.getState().chat.at(-1)!;
    expect(last.questions).toHaveLength(1);
  });
});

// The editor store had no try/catch anywhere, so a rejected call left the UI
// wedged: init never set `ready`, sendMessage never cleared "generating", and
// applyState wrote `undefined` into pattern/chat from a 401's body.
describe("store error handling", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({
      patternId: "m1",
      ready: false,
      error: null,
      pattern: null,
      chat: [],
      generationStatus: "idle",
    });
  });

  it("init marks itself ready with an error rather than loading forever", async () => {
    vi.mocked(api.fetchPattern).mockRejectedValue(
      new ApiError(401, "unauthorized"),
    );

    await useEditorStore.getState().init("m1");

    const s = useEditorStore.getState();
    expect(s.ready).toBe(true); // the loading screen must not be permanent
    expect(s.error).toBe("unauthorized");
    expect(s.pattern).toBeNull();
  });

  it("init surfaces a generic code for a non-ApiError failure", async () => {
    vi.mocked(api.fetchPattern).mockRejectedValue(new TypeError("offline"));

    await useEditorStore.getState().init("m1");

    expect(useEditorStore.getState().ready).toBe(true);
    expect(useEditorStore.getState().error).toBe("request_failed");
  });

  it("sendMessage stops generating and rolls back the optimistic message", async () => {
    genMock.mockRejectedValue(new ApiError(500, "request_failed"));

    await useEditorStore.getState().sendMessage("uma blusa");

    const s = useEditorStore.getState();
    expect(s.generationStatus).not.toBe("generating");
    expect(s.error).toBe("request_failed");
    expect(s.chat.some((m) => m.id.startsWith("optimistic-"))).toBe(false);
  });

  it("a failed sendMessage never overwrites the pattern with undefined", async () => {
    const state = emptyState();
    useEditorStore.setState({ pattern: state.pattern, ready: true });
    genMock.mockRejectedValue(new ApiError(401, "unauthorized"));

    await useEditorStore.getState().sendMessage("uma blusa");

    expect(useEditorStore.getState().pattern).toEqual(state.pattern);
  });

  it("graduateSizes surfaces a failure instead of throwing into the void", async () => {
    vi.mocked(api.graduate).mockRejectedValue(new ApiError(500, "boom"));

    await useEditorStore.getState().graduateSizes(["M"]);

    expect(useEditorStore.getState().error).toBe("boom");
  });

  it("clearError dismisses a surfaced failure", async () => {
    useEditorStore.setState({ error: "unauthorized" });
    useEditorStore.getState().clearError();
    expect(useEditorStore.getState().error).toBeNull();
  });
});

describe("store.graduateSizes", () => {
  it("stashes the graduate action code on the paywall, not pt-BR prose", async () => {
    vi.mocked(api.graduate).mockResolvedValue({
      status: "insufficient_credits",
      required: 3,
      balance: 1,
    });
    useEditorStore.setState({ patternId: "p1" });

    await useEditorStore.getState().graduateSizes(["P", "M"]);

    expect(useEditorStore.getState().paywall.action).toBe("graduate");
  });
});

describe("editor store — tool and measurements", () => {
  beforeEach(() => {
    useEditorStore.setState({ measurements: [], activeTool: "cursor" });
  });

  it("defaults the tool to cursor", () => {
    expect(useEditorStore.getState().activeTool).toBe("cursor");
  });

  it("addMeasurement appends", () => {
    useEditorStore
      .getState()
      .addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    expect(useEditorStore.getState().measurements).toHaveLength(1);
  });

  it("removeMeasurement removes by id", () => {
    const s = useEditorStore.getState();
    s.addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    s.addMeasurement({ id: "m2", a: { x: 0, y: 0 }, b: { x: 8, y: 0 } });
    useEditorStore.getState().removeMeasurement("m1");
    expect(useEditorStore.getState().measurements.map((m) => m.id)).toEqual([
      "m2",
    ]);
  });

  it("clearMeasurements empties the list", () => {
    useEditorStore
      .getState()
      .addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    useEditorStore.getState().clearMeasurements();
    expect(useEditorStore.getState().measurements).toEqual([]);
  });
});
