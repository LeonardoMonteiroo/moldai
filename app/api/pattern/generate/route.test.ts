import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai", () => ({ proposeGarment: vi.fn() }));

import { POST } from "./route";
import { proposeGarment } from "@/lib/ai";
import { resetState, getState } from "@/lib/mock-data";

const mockPropose = proposeGarment as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://test/api/pattern/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pattern/generate — ask", () => {
  beforeEach(() => {
    resetState();
    mockPropose.mockReset();
  });

  it("ask estorna o crédito, não desenha nem versiona, e devolve clarify", async () => {
    const balanceBefore = getState().credits.balance;
    const versionBefore = getState().pattern.version;
    mockPropose.mockResolvedValue({
      decision: "ask",
      spec: { tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} },
      questions: [{ id: "q0", label: "Gola", options: ["redonda", "V"], allowOther: true }],
      assistantMessage: "Me conta mais:",
    });

    const res = await POST(req({ message: "quero uma camiseta" }));
    const json = await res.json();

    expect(json.status).toBe("clarify");
    expect(getState().credits.balance).toBe(balanceBefore); // debitou e estornou
    expect(getState().pattern.version).toBe(versionBefore); // sem bump
    expect(getState().pattern.pieces).toHaveLength(0); // nada desenhado
    const last = getState().chat[getState().chat.length - 1];
    expect(last.author).toBe("ai");
    expect(last.questions).toHaveLength(1);
  });

  it("mensagem vazia retorna 400 sem debitar nem chamar a IA", async () => {
    const balanceBefore = getState().credits.balance;
    const res = await POST(req({ message: "   " }));
    expect(res.status).toBe(400);
    expect(getState().credits.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("repassa answering ao proposeGarment", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: { tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} },
      assistantMessage: "Pronto",
    });
    await POST(req({ message: "gola redonda, manga curta", answering: true }));
    expect(mockPropose).toHaveBeenCalledWith(expect.anything(), true);
  });
});
