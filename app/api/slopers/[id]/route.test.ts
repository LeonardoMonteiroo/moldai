import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/sloper", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/sloper")>("@/lib/db/sloper");
  return { ...actual, renameSloper: vi.fn(), deleteSloper: vi.fn() };
});

import { PATCH, DELETE } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { renameSloper, deleteSloper } from "@/lib/db/sloper";

const mockRename = renameSloper as unknown as ReturnType<typeof vi.fn>;
const mockDelete = deleteSloper as unknown as ReturnType<typeof vi.fn>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patch(body: unknown) {
  return new Request("http://test/api/slopers/s1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/slopers/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockRename.mockReset();
    mockDelete.mockReset();
  });

  it("PATCH renames and answers ok", async () => {
    mockRename.mockResolvedValue(true);
    const res = await PATCH(patch({ name: "  base nova  " }), ctx("s1"));
    expect(mockRename).toHaveBeenCalledWith("s1", "u1", "base nova");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("PATCH 404s when the sloper is missing or not owned", async () => {
    mockRename.mockResolvedValue(false);
    const res = await PATCH(patch({ name: "base" }), ctx("s1"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sloper_not_found");
  });

  it.each([
    ["empty", "   "],
    ["over the cap", "x".repeat(MAX_PATTERN_NAME_LENGTH + 1)],
    ["carrying a NUL code point", `base${String.fromCharCode(0)}`], // #69
  ])("PATCH 400s on a name that is %s", async (_l, name) => {
    const res = await PATCH(patch({ name }), ctx("s1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_name");
    expect(mockRename).not.toHaveBeenCalled();
  });

  it("PATCH 400s on a null body", async () => {
    const res = await PATCH(patch(null), ctx("s1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
  });

  it("DELETE removes it and answers ok", async () => {
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(new Request("http://test"), ctx("s1"));
    expect(mockDelete).toHaveBeenCalledWith("s1", "u1");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("DELETE 404s when the sloper is missing or not owned", async () => {
    mockDelete.mockResolvedValue(false);
    const res = await DELETE(new Request("http://test"), ctx("s1"));
    expect(res.status).toBe(404);
  });

  it.each([
    ["PATCH", () => PATCH(patch({ name: "base" }), ctx("s1"))],
    ["DELETE", () => DELETE(new Request("http://test"), ctx("s1"))],
  ])("%s 401s without a session", async (_l, call) => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await call();
    expect(res.status).toBe(401);
    expect(mockRename).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
