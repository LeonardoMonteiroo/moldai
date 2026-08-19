import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/pattern", () => ({
  listPatternsForUser: vi.fn(),
  createPattern: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { listPatternsForUser, createPattern } from "@/lib/db/pattern";

const mockList = listPatternsForUser as unknown as ReturnType<typeof vi.fn>;
const mockCreate = createPattern as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/moldes", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockList.mockReset();
    mockCreate.mockReset();
  });

  it("returns the user's pattern list", async () => {
    mockList.mockResolvedValue([
      {
        id: "m1",
        name: "Novo molde",
        garmentType: null,
        updatedAt: "x",
        thumbnailSvg: "<svg/>",
      },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(mockList).toHaveBeenCalledWith("u1");
    expect(json).toHaveLength(1);
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe("POST /api/moldes", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockCreate.mockReset();
  });

  it("creates a pattern for the session user and returns its id", async () => {
    mockCreate.mockResolvedValue("m9");
    const res = await POST();
    const json = await res.json();
    expect(mockCreate).toHaveBeenCalledWith("u1");
    expect(json).toEqual({ id: "m9" });
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
