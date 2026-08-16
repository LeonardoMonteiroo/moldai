import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "./types";

vi.mock("./api-client", () => ({
  fetchPattern: vi.fn(),
  generate: vi.fn(),
  resetPattern: vi.fn(),
  graduate: vi.fn(),
  resolveConflict: vi.fn(),
  purchase: vi.fn(),
}));

import * as api from "./api-client";
import { useEditorStore } from "./store";

const genMock = api.generate as unknown as ReturnType<typeof vi.fn>;

function emptyState(): EditorState {
  return {
    pattern: { id: "p", name: "Novo molde", version: 0, savedAgo: "", baseSize: "M", unit: "cm", sizesApplied: [], sizesPending: [], pieces: [] },
    chat: [{ id: "m1", author: "ai", text: "Me conta mais:", questions: [{ id: "q0", label: "Gola", options: ["a", "b"], allowOther: false }], createdAt: 1 }],
    credits: { plan: "atelier", planLabel: "Ateliê", balance: 100, total: 500, renewsInDays: 10 },
    conflict: null,
  };
}

describe("store.sendMessage", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({ selectedPieceId: null, generationStatus: "idle" });
  });

  it("repassa answering e trata clarify sem erro nem seleção de peça", async () => {
    genMock.mockResolvedValue({ status: "clarify", state: emptyState() });
    await useEditorStore.getState().sendMessage("gola redonda", { answering: true });

    expect(genMock).toHaveBeenCalledWith("gola redonda", true);
    expect(useEditorStore.getState().generationStatus).toBe("idle");
    expect(useEditorStore.getState().selectedPieceId).toBeNull();
    const last = useEditorStore.getState().chat.at(-1)!;
    expect(last.questions).toHaveLength(1);
  });
});
