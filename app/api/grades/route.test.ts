import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/grade", () => ({
  listGradesForUser: vi.fn(),
  getActiveGradeId: vi.fn(),
  createGrade: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import {
  listGradesForUser,
  getActiveGradeId,
  createGrade,
} from "@/lib/db/grade";

function req(body?: unknown) {
  return new Request("http://test/api/grades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/grades", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("marks the account's active grade in the returned list", async () => {
    vi.mocked(listGradesForUser).mockResolvedValue([
      { id: "g1", name: "A" } as never,
      { id: "g2", name: "B" } as never,
    ]);
    vi.mocked(getActiveGradeId).mockResolvedValue("g2");
    const res = await GET();
    const json = await res.json();
    expect(json.find((g: { id: string }) => g.id === "g1").isActive).toBe(
      false,
    );
    expect(json.find((g: { id: string }) => g.id === "g2").isActive).toBe(true);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/grades", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(createGrade).mockReset();
  });

  it("creates a grade, forwarding an optional sourceId", async () => {
    vi.mocked(createGrade).mockResolvedValue({ id: "g3" } as never);
    const res = await POST(req({ sourceId: "g1" }));
    expect(createGrade).toHaveBeenCalledWith("u1", "g1");
    expect((await res.json()).id).toBe("g3");
  });

  it("creates a grade with no sourceId when the body is empty", async () => {
    vi.mocked(createGrade).mockResolvedValue({ id: "g4" } as never);
    await POST(req({}));
    expect(createGrade).toHaveBeenCalledWith("u1", undefined);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });
});
