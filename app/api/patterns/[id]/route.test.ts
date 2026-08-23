import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

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

describe("/api/patterns/[id]", () => {
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

  it("GET returns the composed state when found, with the row's stored updatedAt", async () => {
    const ROW_UPDATED_AT = new Date("2026-08-21T11:30:00.000Z");
    mockLoad.mockResolvedValue({
      state: seedPatternState(t),
      updatedAt: ROW_UPDATED_AT,
    });
    const res = await GET(new Request("http://test"), ctx("m1"));
    const json = await res.json();
    expect(mockLoad).toHaveBeenCalledWith("m1", "u1");
    expect(json.pattern.version).toBe(0);
    expect(json.credits.balance).toBe(30);
    // The stored column, not "now" — this is the non-mutating reader that
    // must not approximate the save time.
    expect(json.pattern.updatedAt).toBe(ROW_UPDATED_AT.toISOString());
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

  // #69: a NUL code point survives .trim() and .length, then used to abort
  // the jsonb write inside savePattern with no coded error. Built with
  // fromCharCode rather than a literal control character in the source.
  it("PATCH 400s on a name containing a NUL code point", async () => {
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ name: `ab${String.fromCharCode(0)}c` }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_name");
    expect(mockRename).not.toHaveBeenCalled();
  });

  // #69 belt-and-braces: this route had no catch at all, unlike
  // generate/graduate (#61) -- any other renamePattern failure escaped as a
  // bare, uncoded HTTP 500.
  it("PATCH maps a renamePattern failure to a coded 503 instead of a bare 500", async () => {
    mockRename.mockRejectedValue(new Error("connection reset"));
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ name: "Vestido" }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("service_unavailable");
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

  // A 5000-character name was accepted, then rendered untruncated into the
  // editor header and the dashboard card, blowing out both layouts.
  it("PATCH 400s on a name past the length cap", async () => {
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ name: "x".repeat(MAX_PATTERN_NAME_LENGTH + 1) }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_name");
    expect(mockRename).not.toHaveBeenCalled();
  });

  it("PATCH accepts a name exactly at the cap", async () => {
    mockRename.mockResolvedValue(true);
    const name = "x".repeat(MAX_PATTERN_NAME_LENGTH);
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(200);
    expect(mockRename).toHaveBeenCalledWith("m1", "u1", name);
  });

  // "null" is valid JSON: it survived request.json() and threw on body.name.
  it("PATCH 400s on a literal null body instead of throwing", async () => {
    const res = await PATCH(
      new Request("http://test", { method: "PATCH", body: "null" }),
      ctx("m1"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
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

  // #69 belt-and-braces: same guard as PATCH above.
  it("DELETE maps a deletePattern failure to a coded 503 instead of a bare 500", async () => {
    mockDelete.mockRejectedValue(new Error("connection reset"));
    const res = await DELETE(new Request("http://test"), ctx("m1"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("service_unavailable");
  });
});
