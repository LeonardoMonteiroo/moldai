import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedState } from "@/lib/editor/state";
import type { EditorState } from "@/lib/types";

let state: EditorState = seedState();

vi.mock("@/lib/ai", () => ({ proposeGarment: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/molde", () => ({
  // Runs fn over the in-memory state (mimics withMolde without a DB).
  withMolde: vi.fn(async (_userId: string, fn: (s: EditorState) => unknown) =>
    fn(state),
  ),
  loadMolde: vi.fn(async () => state),
  resetMolde: vi.fn(async () => (state = seedState())),
}));

import { POST } from "./route";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";

const mockPropose = proposeGarment as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://test/api/pattern/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pattern/generate", () => {
  beforeEach(() => {
    state = seedState();
    mockPropose.mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("ask refunds the credit, doesn't draft or version, and returns clarify", async () => {
    const balanceBefore = state.credits.balance;
    const versionBefore = state.pattern.version;
    mockPropose.mockResolvedValue({
      decision: "ask",
      spec: {
        type: "tshirt",
        gender: "male",
        style: {},
        measurementOverrides: {},
      },
      questions: [
        {
          id: "q0",
          label: "Gola",
          options: ["redonda", "V"],
          allowOther: true,
        },
      ],
      assistantMessage: "Me conta mais:",
    });
    const res = await POST(req({ message: "quero uma camiseta" }));
    const json = await res.json();
    expect(json.status).toBe("clarify");
    expect(state.credits.balance).toBe(balanceBefore);
    expect(state.pattern.version).toBe(versionBefore);
    expect(state.pattern.pieces).toHaveLength(0);
    const last = state.chat[state.chat.length - 1];
    expect(last.author).toBe("ai");
    expect(last.questions).toHaveLength(1);
  });

  it("apply debits, drafts, and versions", async () => {
    const balanceBefore = state.credits.balance;
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "tshirt",
        gender: "male",
        style: {},
        measurementOverrides: {},
      },
      assistantMessage: "Pronto",
    });
    const res = await POST(req({ message: "camiseta masc" }));
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(state.credits.balance).toBe(balanceBefore - 1);
    expect(state.pattern.version).toBe(1);
    expect(state.pattern.pieces.length).toBeGreaterThan(0);
  });

  it("empty message returns 400 without debiting or calling the AI", async () => {
    const balanceBefore = state.credits.balance;
    const res = await POST(req({ message: "   " }));
    expect(res.status).toBe(400);
    expect(state.credits.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("forwards answering to proposeGarment", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "tshirt",
        gender: "male",
        style: {},
        measurementOverrides: {},
      },
      assistantMessage: "Pronto",
    });
    await POST(req({ message: "gola redonda", answering: true }));
    expect(mockPropose).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("no session returns 401 without debiting or calling the AI", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const balanceBefore = state.credits.balance;
    const res = await POST(req({ message: "quero uma camiseta" }));
    expect(res.status).toBe(401);
    expect(state.credits.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("insufficient balance returns 402 without debiting or calling the AI", async () => {
    state.credits.balance = 0;
    const res = await POST(req({ message: "camiseta" }));
    expect(res.status).toBe(402);
    expect(state.credits.balance).toBe(0);
    expect(mockPropose).not.toHaveBeenCalled();
  });
});
