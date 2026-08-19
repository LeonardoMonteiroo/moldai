import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedMoldeState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import type { MoldeState } from "@/lib/types";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");
let wallet: Wallet = seedWallet(NOW);

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/wallet", () => ({
  withWallet: vi.fn(
    async (
      _userId: string,
      fn: (w: Wallet) => { result: Wallet; entries: LedgerEntry[] },
    ) => fn(wallet).result,
  ),
}));
vi.mock("@/lib/db/pattern", () => ({
  loadPattern: vi.fn(async (moldeId: string): Promise<MoldeState | null> =>
    moldeId === "m1" ? seedMoldeState() : null,
  ),
  patternNotFound: vi.fn(
    () =>
      new Response(JSON.stringify({ status: "not_found" }), { status: 404 }),
  ),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";

function req(body: unknown) {
  return new Request("http://test/api/billing/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/purchase", () => {
  beforeEach(() => {
    wallet = seedWallet(NOW);
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("with a moldeId, returns the full composed editor state", async () => {
    const res = await POST(req({ type: "topup", moldeId: "m1" }));
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.state.pattern.version).toBe(0);
    expect(json.state.credits.balance).toBe(420);
  });

  it("without a moldeId, returns just credits", async () => {
    const res = await POST(req({ type: "topup" }));
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.credits.balance).toBe(420);
    expect(json.state).toBeUndefined();
  });

  it("404s when moldeId is given but not found/owned", async () => {
    const res = await POST(req({ type: "topup", moldeId: "not-mine" }));
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ type: "topup" }));
    expect(res.status).toBe(401);
  });
});
