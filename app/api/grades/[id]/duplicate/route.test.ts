import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/grade", () => ({ createGrade: vi.fn() }));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { createGrade } from "@/lib/db/grade";

function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/grades/[id]/duplicate", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(createGrade).mockReset();
  });

  it("duplicates the given grade id for the current user", async () => {
    vi.mocked(createGrade).mockResolvedValue({ id: "g2" } as never);
    const res = await POST(new Request("http://test"), ctx("g1"));
    expect(createGrade).toHaveBeenCalledWith("u1", "g1");
    expect((await res.json()).id).toBe("g2");
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
  });
});
