import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";
import type { GarmentSpec } from "@/lib/types";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/pattern", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/pattern")>(
      "@/lib/db/pattern",
    );
  return { ...actual, loadPattern: vi.fn() };
});
vi.mock("@/lib/db/sloper", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/sloper")>("@/lib/db/sloper");
  return { ...actual, listSlopersForUser: vi.fn(), createSloper: vi.fn() };
});

import { GET, POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadPattern } from "@/lib/db/pattern";
import { listSlopersForUser, createSloper } from "@/lib/db/sloper";

const mockLoadPattern = loadPattern as unknown as ReturnType<typeof vi.fn>;
const mockList = listSlopersForUser as unknown as ReturnType<typeof vi.fn>;
const mockCreate = createSloper as unknown as ReturnType<typeof vi.fn>;

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

/** A pattern that has actually been drafted -- a blank seed is not one. */
function draftedPattern() {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  return { state, updatedAt: new Date("2026-08-22T00:00:00.000Z") };
}

/**
 * A drafted pattern carrying a real, engine-produced seam conflict: an
 * armholeDeepenCm above seamCheck's 1cm tolerance makes the body armhole
 * diverge from the sleeve cap (see garment.ts's draftAll / lib/editor/state.ts's
 * applyGarmentSpec), the same way lib/editor/state.test.ts triggers one.
 */
function draftedPatternWithConflict() {
  const state = seedPatternState(t);
  applyGarmentSpec(
    state,
    { ...BLOUSE, style: { sleeve: "short", armholeDeepenCm: 2 } },
    t,
  );
  if (!state.conflict) throw new Error("fixture did not produce a conflict");
  return { state, updatedAt: new Date("2026-08-22T00:00:00.000Z") };
}

function post(body: unknown) {
  return new Request("http://test/api/slopers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/slopers", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockLoadPattern.mockReset();
    mockList.mockReset();
    mockCreate.mockReset();
  });

  it("GET returns the user's slopers", async () => {
    mockList.mockResolvedValue([{ id: "s1", name: "base blusa" }]);
    const res = await GET();
    expect(mockList).toHaveBeenCalledWith("u1", expect.any(Function));
    expect(await res.json()).toHaveLength(1);
  });

  it("GET 401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("POST saves the drafted pattern's snapshot as a sloper", async () => {
    mockLoadPattern.mockResolvedValue(draftedPattern());
    mockCreate.mockResolvedValue({ id: "s9", name: "base blusa" });

    const res = await POST(post({ patternId: "p1", name: "  base blusa  " }));

    expect(mockLoadPattern).toHaveBeenCalledWith("p1", "u1");
    const [userId, data] = mockCreate.mock.calls[0];
    expect(userId).toBe("u1");
    expect(data.name).toBe("base blusa"); // trimmed
    expect(data.spec.type).toBe("blouse");
    expect(data).not.toHaveProperty("pieces");
    expect(await res.json()).toEqual({ id: "s9", name: "base blusa" });
  });

  it("POST 404s for a pattern that is missing or not owned", async () => {
    mockLoadPattern.mockResolvedValue(null);
    const res = await POST(post({ patternId: "p1", name: "base" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("pattern_not_found");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST 400s for a pattern that has never been drafted", async () => {
    mockLoadPattern.mockResolvedValue({
      state: seedPatternState(t),
      updatedAt: new Date(),
    });
    const res = await POST(post({ patternId: "p1", name: "base" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("pattern_not_drafted");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST 400s for a drafted pattern with an active seam conflict", async () => {
    mockLoadPattern.mockResolvedValue(draftedPatternWithConflict());
    const res = await POST(post({ patternId: "p1", name: "base" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("pattern_has_conflict");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", "   "],
    ["over the cap", "x".repeat(MAX_PATTERN_NAME_LENGTH + 1)],
  ])(
    "POST 400s on a name that is %s, without touching the DB",
    async (_l, name) => {
      const res = await POST(post({ patternId: "p1", name }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_name");
      expect(mockLoadPattern).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    },
  );

  it("POST 400s on a body with no patternId", async () => {
    const res = await POST(post({ name: "base" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
  });

  it("POST 401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(post({ patternId: "p1", name: "base" }));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
