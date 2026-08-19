import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedMoldeState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import type { MoldeState } from "@/lib/types";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");
let state: MoldeState = seedMoldeState();
let wallet: Wallet = seedWallet(NOW);
let ownedPatternId: string | null = "m1";

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
vi.mock("@/lib/db/pattern-wallet", () => ({
  withPatternAndWallet: vi.fn(
    async (
      patternId: string,
      _userId: string,
      fn: (
        s: MoldeState,
        w: Wallet,
      ) => Promise<{ result: unknown; entries: LedgerEntry[] }>,
    ) => {
      if (patternId !== ownedPatternId) return null;
      return (await fn(state, wallet)).result;
    },
  ),
}));

import { POST } from "./route";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";

const mockPropose = proposeGarment as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://test/api/moldes/m1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(id = "m1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/moldes/[id]/generate", () => {
  beforeEach(() => {
    state = seedMoldeState();
    wallet = seedWallet(NOW);
    ownedPatternId = "m1";
    mockPropose.mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("ask refunds the credit, doesn't draft or version, and returns clarify", async () => {
    const balanceBefore = wallet.balance;
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
    const res = await POST(req({ message: "quero uma camiseta" }), ctx());
    const json = await res.json();
    expect(json.status).toBe("clarify");
    expect(json.state.credits.balance).toBe(balanceBefore);
    expect(state.pattern.version).toBe(versionBefore);
  });

  it("apply debits, drafts, and versions", async () => {
    const balanceBefore = wallet.balance;
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
    const res = await POST(req({ message: "camiseta masc" }), ctx());
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.state.credits.balance).toBe(balanceBefore - 1);
    expect(state.pattern.version).toBe(1);
  });

  it("empty message returns 400 without debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(req({ message: "   " }), ctx());
    expect(res.status).toBe(400);
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("no session returns 401 without debiting or calling the AI", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ message: "quero uma camiseta" }), ctx());
    expect(res.status).toBe(401);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("insufficient balance returns 402 without debiting or calling the AI", async () => {
    wallet.balance = 0;
    const res = await POST(req({ message: "camiseta" }), ctx());
    expect(res.status).toBe(402);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("404s when the pattern isn't found/owned, without calling the AI", async () => {
    const res = await POST(req({ message: "camiseta" }), ctx("someone-elses"));
    expect(res.status).toBe(404);
    expect(mockPropose).not.toHaveBeenCalled();
  });
});
