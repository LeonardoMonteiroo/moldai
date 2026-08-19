import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/sizeChart", () => ({ setActiveSizeChart: vi.fn() }));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { setActiveSizeChart } from "@/lib/db/sizeChart";

function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/size-charts/[id]/activate", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(setActiveSizeChart).mockReset();
  });

  it("activates the given chart for the current user", async () => {
    vi.mocked(setActiveSizeChart).mockResolvedValue(true);
    const res = await POST(new Request("http://test"), ctx("g1"));
    expect(setActiveSizeChart).toHaveBeenCalledWith("u1", "g1");
    expect((await res.json()).status).toBe("ok");
  });

  it("404s when the chart isn't owned by the caller", async () => {
    vi.mocked(setActiveSizeChart).mockResolvedValue(false);
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
  });
});
