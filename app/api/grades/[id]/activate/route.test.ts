import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/grade", () => ({ setActiveGrade: vi.fn() }));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { setActiveGrade } from "@/lib/db/grade";

function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/grades/[id]/activate", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(setActiveGrade).mockReset();
  });

  it("activates the given grade for the current user", async () => {
    vi.mocked(setActiveGrade).mockResolvedValue(true);
    const res = await POST(new Request("http://test"), ctx("g1"));
    expect(setActiveGrade).toHaveBeenCalledWith("u1", "g1");
    expect((await res.json()).status).toBe("ok");
  });

  it("404s when the grade isn't owned by the caller", async () => {
    vi.mocked(setActiveGrade).mockResolvedValue(false);
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
  });
});
