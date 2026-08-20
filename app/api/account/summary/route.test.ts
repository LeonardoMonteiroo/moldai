import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedWallet } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-18T00:00:00.000Z");

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));
vi.mock("@/lib/db/account", () => ({ getRecentUsage: vi.fn() }));

import { GET } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import { getRecentUsage } from "@/lib/db/account";

describe("GET /api/account/summary", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(loadWallet).mockReset();
    vi.mocked(getRecentUsage).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(loadWallet).mockResolvedValue(seedWallet(NOW));
    vi.mocked(getRecentUsage).mockResolvedValue([
      { reason: "generate", amount: 1, createdAt: NOW.toISOString() },
    ]);
  });

  it("returns credits and recent usage for the session user", async () => {
    const res = await GET();
    const json = await res.json();
    expect(getRecentUsage).toHaveBeenCalledWith("u1", 3);
    expect(json.credits.balance).toBe(30);
    expect(json.recentUsage).toHaveLength(1);
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getRecentUsage).not.toHaveBeenCalled();
  });
});
