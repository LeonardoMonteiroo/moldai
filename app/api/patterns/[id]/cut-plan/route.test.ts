import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import { MAX_CUT_QUANTITY_PER_SIZE } from "@/lib/types";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/pattern", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/pattern")>(
      "@/lib/db/pattern",
    );
  return {
    ...actual,
    loadPattern: vi.fn(),
    updatePatternCutQuantities: vi.fn(),
  };
});

import { PATCH } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadPattern, updatePatternCutQuantities } from "@/lib/db/pattern";

const mockLoad = loadPattern as unknown as ReturnType<typeof vi.fn>;
const mockUpdate = updatePatternCutQuantities as unknown as ReturnType<
  typeof vi.fn
>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function seeded() {
  const state = seedPatternState(t);
  state.pattern = {
    ...state.pattern,
    baseSize: "M",
    sizesApplied: ["G"],
  };
  return state;
}

describe("PATCH /api/patterns/[id]/cut-plan", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockLoad.mockReset();
    mockUpdate.mockReset();
    mockLoad.mockResolvedValue({ state: seeded(), updatedAt: new Date() });
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ cutQuantities: { M: 1 } }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("404s when the pattern isn't found/owned", async () => {
    mockLoad.mockResolvedValue(null);
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ cutQuantities: { M: 1 } }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("400s on a literal null body instead of throwing", async () => {
    const res = await PATCH(
      new Request("http://test", { method: "PATCH", body: "null" }),
      ctx("m1"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("validates against baseSize + sizesApplied, dropping an unknown size and clamping an out-of-range one", async () => {
    mockUpdate.mockResolvedValue(true);
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({
          cutQuantities: {
            M: 2,
            G: MAX_CUT_QUANTITY_PER_SIZE + 50,
            XL: 9, // not in baseSize/sizesApplied -- dropped
          },
        }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith("m1", "u1", {
      M: 2,
      G: MAX_CUT_QUANTITY_PER_SIZE,
    });
  });

  it("persists an explicit all-zero map rather than dropping it", async () => {
    mockUpdate.mockResolvedValue(true);
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ cutQuantities: { M: 0, G: 0 } }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith("m1", "u1", { M: 0, G: 0 });
  });

  it("404s when updatePatternCutQuantities finds the row gone by write time", async () => {
    mockUpdate.mockResolvedValue(false);
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ cutQuantities: { M: 1 } }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(404);
  });

  it("maps an updatePatternCutQuantities failure to a coded 503 instead of a bare 500", async () => {
    mockUpdate.mockRejectedValue(new Error("connection reset"));
    const res = await PATCH(
      new Request("http://test", {
        method: "PATCH",
        body: JSON.stringify({ cutQuantities: { M: 1 } }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("service_unavailable");
  });
});
