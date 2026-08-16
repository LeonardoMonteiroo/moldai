import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "dev@moldai.local", name: null })),
}));

import { POST } from "./route";
import { resetState, getState } from "@/lib/mock-data";

function req(body: unknown) {
  return new Request("http://test/api/pattern/graduate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pattern/graduate", () => {
  beforeEach(() => {
    resetState();
  });

  it("lista de tamanhos vazia retorna 400 sem debitar nem versionar", async () => {
    const balanceBefore = getState().credits.balance;
    const versionBefore = getState().pattern.version;
    const res = await POST(req({ sizes: [] }));
    expect(res.status).toBe(400);
    expect(getState().credits.balance).toBe(balanceBefore);
    expect(getState().pattern.version).toBe(versionBefore);
  });

  it("filtra tamanhos inválidos e formata a mensagem com 'e'", async () => {
    const res = await POST(req({ sizes: ["PP", "X", "G"] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.state.pattern.sizesApplied).toEqual(expect.arrayContaining(["PP", "G"]));
    const last = json.state.chat[json.state.chat.length - 1];
    expect(last.text).toBe("Graduação aplicada para PP e G.");
  });

  it("três ou mais tamanhos usam vírgula + 'e' final", async () => {
    const res = await POST(req({ sizes: ["PP", "P", "G"] }));
    const json = await res.json();
    const last = json.state.chat[json.state.chat.length - 1];
    expect(last.text).toBe("Graduação aplicada para PP, P e G.");
  });
});
