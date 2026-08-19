import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/account", () => ({ getLedgerHistory: vi.fn() }));

import { GET } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { getLedgerHistory } from "@/lib/db/account";

describe("GET /api/account/ledger", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(getLedgerHistory).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(getLedgerHistory).mockResolvedValue([
      {
        type: "topup",
        reason: null,
        amount: 100,
        createdAt: "2026-08-18T00:00:00.000Z",
      },
    ]);
  });

  it("returns the ledger history for the session user", async () => {
    const res = await GET();
    const json = await res.json();
    expect(getLedgerHistory).toHaveBeenCalledWith("u1", 30);
    expect(json.ledger).toHaveLength(1);
    expect(json.ledger[0].type).toBe("topup");
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getLedgerHistory).not.toHaveBeenCalled();
  });
});
