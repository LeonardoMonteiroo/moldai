import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedWallet } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-18T00:00:00.000Z");

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));
vi.mock("@/lib/db/account", () => ({
  getRecentUsage: vi.fn(),
  getChecklistProgress: vi.fn(),
}));
vi.mock("@/lib/db/sizeChart", () => ({ hasCustomActiveSizeChart: vi.fn() }));

import { GET } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import { getRecentUsage, getChecklistProgress } from "@/lib/db/account";
import { hasCustomActiveSizeChart } from "@/lib/db/sizeChart";

describe("GET /api/account/summary", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(loadWallet).mockReset();
    vi.mocked(getRecentUsage).mockReset();
    vi.mocked(getChecklistProgress).mockReset();
    vi.mocked(hasCustomActiveSizeChart).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(loadWallet).mockResolvedValue(seedWallet(NOW));
    vi.mocked(getRecentUsage).mockResolvedValue([
      { reason: "generate", amount: 1, createdAt: NOW.toISOString() },
    ]);
    vi.mocked(getChecklistProgress).mockResolvedValue({
      hasExported: false,
      hasImported: false,
    });
    vi.mocked(hasCustomActiveSizeChart).mockResolvedValue(false);
  });

  it("returns credits, recent usage and checklist progress for the session user", async () => {
    vi.mocked(getChecklistProgress).mockResolvedValue({
      hasExported: true,
      hasImported: false,
    });
    vi.mocked(hasCustomActiveSizeChart).mockResolvedValue(true);
    const res = await GET();
    const json = await res.json();
    expect(getRecentUsage).toHaveBeenCalledWith("u1", 3);
    expect(json.credits.balance).toBe(30);
    expect(json.recentUsage).toHaveLength(1);
    expect(json.checklist).toEqual({
      hasCustomSizeChart: true,
      hasExported: true,
      hasImported: false,
    });
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getRecentUsage).not.toHaveBeenCalled();
  });

  // #62: requireUser() already re-checks the account exists, so this is
  // only the race window between that check and this route's own read --
  // loadWallet returning null (a deleted account) must not compose into a
  // 200 for a wallet that isn't there.
  it("401s if the account vanished between requireUser() and loadWallet()", async () => {
    vi.mocked(loadWallet).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
