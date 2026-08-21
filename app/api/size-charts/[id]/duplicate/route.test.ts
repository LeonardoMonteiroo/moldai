import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("@/lib/db/sizeChart", () => ({ createSizeChart: vi.fn() }));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { createSizeChart } from "@/lib/db/sizeChart";

function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/size-charts/[id]/duplicate", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(createSizeChart).mockReset();
  });

  it("duplicates the given chart id for the current user", async () => {
    vi.mocked(createSizeChart).mockResolvedValue({ id: "g2" } as never);
    const res = await POST(new Request("http://test"), ctx("g1"));
    expect(createSizeChart).toHaveBeenCalledWith("u1", "copySuffix", "g1");
    expect((await res.json()).id).toBe("g2");
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
  });
});
