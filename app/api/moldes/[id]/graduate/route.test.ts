import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedMoldeState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import type { MoldeState } from "@/lib/types";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");
let state: MoldeState = seedMoldeState();
let wallet: Wallet = seedWallet(NOW);
let ownedPatternId: string | null = "m1";

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
      ) => { result: unknown; entries: LedgerEntry[] },
    ) => {
      if (patternId !== ownedPatternId) return null;
      return fn(state, wallet).result;
    },
  ),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";

function req(body: unknown) {
  return new Request("http://test/api/moldes/m1/graduate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(id = "m1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/moldes/[id]/graduate", () => {
  beforeEach(() => {
    state = seedMoldeState();
    wallet = seedWallet(NOW);
    ownedPatternId = "m1";
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("debits, applies sizes, and versions", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(req({ sizes: ["G"] }), ctx());
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.state.credits.balance).toBe(balanceBefore - 6);
    expect(state.pattern.sizesApplied).toContain("G");
    expect(state.pattern.version).toBe(1);
  });

  it("400s on no valid sizes", async () => {
    const res = await POST(req({ sizes: ["XX"] }), ctx());
    expect(res.status).toBe(400);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ sizes: ["G"] }), ctx());
    expect(res.status).toBe(401);
  });

  it("insufficient balance returns 402", async () => {
    wallet.balance = 0;
    const res = await POST(req({ sizes: ["G"] }), ctx());
    expect(res.status).toBe(402);
  });

  it("404s when the pattern isn't found/owned", async () => {
    const res = await POST(req({ sizes: ["G"] }), ctx("someone-elses"));
    expect(res.status).toBe(404);
  });
});
