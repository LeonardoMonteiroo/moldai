import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-18T00:00:00.000Z");

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/pattern", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/pattern")>(
      "@/lib/db/pattern",
    );
  return {
    ...actual,
    loadPattern: vi.fn(),
    renamePattern: vi.fn(),
    deletePattern: vi.fn(),
  };
});
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));

import { GET, PATCH, DELETE } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadPattern, renamePattern, deletePattern } from "@/lib/db/pattern";
import { loadWallet } from "@/lib/db/wallet";

const mockLoad = loadPattern as unknown as ReturnType<typeof vi.fn>;
const mockRename = renamePattern as unknown as ReturnType<typeof vi.fn>;
const mockDelete = deletePattern as unknown as ReturnType<typeof vi.fn>;
const mockLoadWallet = loadWallet as unknown as ReturnType<typeof vi.fn>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/moldes/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockLoad.mockReset();
    mockRename.mockReset();
    mockDelete.mockReset();
    mockLoadWallet.mockReset();
    mockLoadWallet.mockResolvedValue(seedWallet(NOW));
  });

  it("GET returns the composed state when found", async () => {
    mockLoad.mockResolvedValue(seedPatternState());
    const res = await GET(new Request("http://test"), ctx("m1"));
    const json = await res.json();
    expect(mockLoad).toHaveBeenCalledWith("m1", "u1");
    expect(json.pattern.version).toBe(0);
    expect(json.credits.balance).toBe(320);
  });

  it("GET 404s when not found/owned", async () => {
    mockLoad.mockResolvedValue(null);
    const res = await GET(new Request("http://test"), ctx("m1"));
    expect(res.status).toBe(404);
  });

  it("GET 401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET(new Request("http://test"), ctx("m1"));
    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("PATCH renames and returns ok", async () => {
    mockRename.mockResolvedValue(true);
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ name: "Vestido" }),
      }),
      ctx("m1"),
    );
    expect(mockRename).toHaveBeenCalledWith("m1", "u1", "Vestido");
    expect((await res.json()).status).toBe("ok");
  });

  it("PATCH 404s when not found/owned", async () => {
    mockRename.mockResolvedValue(false);
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ name: "Vestido" }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(404);
  });

  it("PATCH 400s on a blank name", async () => {
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ name: "   " }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(400);
    expect(mockRename).not.toHaveBeenCalled();
  });

  it("DELETE deletes and returns ok", async () => {
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(new Request("http://test"), ctx("m1"));
    expect(mockDelete).toHaveBeenCalledWith("m1", "u1");
    expect((await res.json()).status).toBe("ok");
  });

  it("DELETE 404s when not found/owned", async () => {
    mockDelete.mockResolvedValue(false);
    const res = await DELETE(new Request("http://test"), ctx("m1"));
    expect(res.status).toBe(404);
  });
});
