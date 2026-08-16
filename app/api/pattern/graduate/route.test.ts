import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedState } from "@/lib/editor/state";
import type { EditorState } from "@/lib/types";

let state: EditorState = seedState();

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "dev@moldai.local", name: null })),
}));
vi.mock("@/lib/db/molde", () => ({
  withMolde: vi.fn(async (_userId: string, fn: (s: EditorState) => unknown) => fn(state)),
  loadMolde: vi.fn(async () => state),
  resetMolde: vi.fn(async () => (state = seedState())),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";

function req(body: unknown) {
  return new Request("http://test/api/pattern/graduate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pattern/graduate", () => {
  beforeEach(() => {
    state = seedState();
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", email: "dev@moldai.local", name: null });
  });

  it("gradua tamanhos válidos, debita 6 e versiona", async () => {
    const balanceBefore = state.credits.balance;
    const res = await POST(req({ sizes: ["PP", "P"] }));
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(state.credits.balance).toBe(balanceBefore - 6);
    expect(state.pattern.sizesApplied).toEqual(expect.arrayContaining(["PP", "P"]));
  });

  it("nenhum tamanho válido retorna 400", async () => {
    const res = await POST(req({ sizes: ["XL"] }));
    expect(res.status).toBe(400);
  });

  it("saldo insuficiente retorna 402 sem debitar", async () => {
    state.credits.balance = 3;
    const res = await POST(req({ sizes: ["PP"] }));
    expect(res.status).toBe(402);
    expect(state.credits.balance).toBe(3);
  });

  it("sem sessão retorna 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ sizes: ["PP"] }));
    expect(res.status).toBe(401);
  });
});
