import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/sizeChart", () => ({
  updateSizeChart: vi.fn(),
  deleteSizeChart: vi.fn(),
}));

import { PATCH, DELETE } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { updateSizeChart, deleteSizeChart } from "@/lib/db/sizeChart";

function req(body: unknown) {
  return new Request("http://test/api/size-charts/g1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/size-charts/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(updateSizeChart).mockReset();
  });

  it("updates and returns the chart", async () => {
    vi.mocked(updateSizeChart).mockResolvedValue({
      id: "g1",
      name: "Nova",
    } as never);
    const res = await PATCH(req({ name: "Nova" }), ctx());
    expect(updateSizeChart).toHaveBeenCalledWith("g1", "u1", { name: "Nova" });
    expect((await res.json()).name).toBe("Nova");
  });

  it("404s when updateSizeChart returns null (not found, not owned, or system)", async () => {
    vi.mocked(updateSizeChart).mockResolvedValue(null);
    const res = await PATCH(req({ name: "Nova" }), ctx());
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await PATCH(req({ name: "x" }), ctx());
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/size-charts/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(deleteSizeChart).mockReset();
  });

  it("deletes and returns ok", async () => {
    vi.mocked(deleteSizeChart).mockResolvedValue(true);
    const res = await DELETE(new Request("http://test"), ctx());
    expect((await res.json()).status).toBe("ok");
  });

  it("404s when deleteSizeChart returns false", async () => {
    vi.mocked(deleteSizeChart).mockResolvedValue(false);
    const res = await DELETE(new Request("http://test"), ctx());
    expect(res.status).toBe(404);
  });
});
