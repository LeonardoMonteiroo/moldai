import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/grade", () => ({
  updateGrade: vi.fn(),
  deleteGrade: vi.fn(),
}));

import { PATCH, DELETE } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { updateGrade, deleteGrade } from "@/lib/db/grade";

function req(body: unknown) {
  return new Request("http://test/api/grades/g1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/grades/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(updateGrade).mockReset();
  });

  it("updates and returns the grade", async () => {
    vi.mocked(updateGrade).mockResolvedValue({
      id: "g1",
      name: "Nova",
    } as never);
    const res = await PATCH(req({ name: "Nova" }), ctx());
    expect(updateGrade).toHaveBeenCalledWith("g1", "u1", { name: "Nova" });
    expect((await res.json()).name).toBe("Nova");
  });

  it("404s when updateGrade returns null (not found, not owned, or system)", async () => {
    vi.mocked(updateGrade).mockResolvedValue(null);
    const res = await PATCH(req({ name: "Nova" }), ctx());
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await PATCH(req({ name: "x" }), ctx());
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/grades/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(deleteGrade).mockReset();
  });

  it("deletes and returns ok", async () => {
    vi.mocked(deleteGrade).mockResolvedValue(true);
    const res = await DELETE(new Request("http://test"), ctx());
    expect((await res.json()).status).toBe("ok");
  });

  it("404s when deleteGrade returns false", async () => {
    vi.mocked(deleteGrade).mockResolvedValue(false);
    const res = await DELETE(new Request("http://test"), ctx());
    expect(res.status).toBe(404);
  });
});
