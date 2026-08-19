import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "./types";

vi.mock("./api-client", () => ({
  fetchPattern: vi.fn(),
  generate: vi.fn(),
  graduate: vi.fn(),
  resolveConflict: vi.fn(),
  purchase: vi.fn(),
}));

import * as api from "./api-client";
import { useEditorStore } from "./store";

const genMock = api.generate as unknown as ReturnType<typeof vi.fn>;

function emptyState(): EditorState {
  return {
    pattern: {
      id: "p",
      name: "Novo molde",
      version: 0,
      savedAgo: "",
      baseSize: "M",
      unit: "cm",
      sizesApplied: [],
      sizesPending: [],
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
      planLabel: "Ateliê",
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
