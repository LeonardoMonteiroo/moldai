import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const ROW_UPDATED_AT = new Date("2026-08-21T11:30:00.000Z");
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
  loadPattern: vi.fn(async (patternId: string) =>
    patternId === "m1"
      ? { state: seedPatternState(t), updatedAt: ROW_UPDATED_AT }
      : null,
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

  it("with a patternId, returns the full composed editor state", async () => {
    const res = await POST(req({ type: "topup", patternId: "m1" }));
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.state.pattern.version).toBe(0);
    expect(json.state.credits.balance).toBe(130);
    // Non-mutating reader: must use the row's stored updatedAt, not "now".
    expect(json.state.pattern.updatedAt).toBe(ROW_UPDATED_AT.toISOString());
  });

  it("without a patternId, returns just credits", async () => {
    const res = await POST(req({ type: "topup" }));
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.credits.balance).toBe(130);
    expect(json.state).toBeUndefined();
  });

  it("404s when patternId is given but not found/owned", async () => {
    const res = await POST(req({ type: "topup", patternId: "not-mine" }));
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ type: "topup" }));
    expect(res.status).toBe(401);
  });
});
