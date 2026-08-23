import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/pattern", () => ({
  listPatternsForUser: vi.fn(),
  createPattern: vi.fn(),
  createPatternFromState: vi.fn(),
}));
vi.mock("@/lib/db/sloper", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/sloper")>("@/lib/db/sloper");
  return { ...actual, loadSloper: vi.fn() };
});
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));

import { GET, POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import {
  listPatternsForUser,
  createPattern,
  createPatternFromState,
} from "@/lib/db/pattern";
import { loadSloper } from "@/lib/db/sloper";
import { consume } from "@/lib/rate-limit/consume";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { sloperFromPattern } from "@/lib/slopers/convert";
import { t as translate } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

const mockList = listPatternsForUser as unknown as ReturnType<typeof vi.fn>;
const mockCreate = createPattern as unknown as ReturnType<typeof vi.fn>;
const mockCreateFromState = createPatternFromState as unknown as ReturnType<
  typeof vi.fn
>;
const mockLoadSloper = loadSloper as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/patterns", () => {
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

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

function sloperFixture() {
  const state = seedPatternState(translate);
  applyGarmentSpec(state, BLOUSE, translate);
  return sloperFromPattern(state.pattern, "base blusa");
}

function post(body?: unknown) {
  return new Request("http://test/api/patterns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("POST /api/patterns", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockCreate.mockReset();
    mockCreateFromState.mockReset();
    mockLoadSloper.mockReset();
    vi.mocked(consume).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  });

  // #101: creating a pattern (blank or sloper-backed) had no bucket at all,
  // unlike generate/graduate which credits gate.
  it("429s when the account's create bucket is exhausted, creating nothing", async () => {
    vi.mocked(consume).mockResolvedValue({
      allowed: false,
      retryAfterSec: 120,
    });
    const res = await POST(post());
    expect(consume).toHaveBeenCalledWith("create", "u1");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateFromState).not.toHaveBeenCalled();
    expect(mockLoadSloper).not.toHaveBeenCalled();
  });

  it("creates a blank pattern when the request carries no body at all", async () => {
    mockCreate.mockResolvedValue("m9");
    const res = await POST(post());
    expect(mockCreate).toHaveBeenCalledWith("u1", expect.any(Function));
    expect(mockCreateFromState).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ id: "m9" });
  });

  it("creates a blank pattern for an empty object body", async () => {
    mockCreate.mockResolvedValue("m9");
    const res = await POST(post({}));
    expect(mockCreate).toHaveBeenCalled();
    expect(await res.json()).toEqual({ id: "m9" });
  });

  it("creates an already-drafted pattern from a sloper", async () => {
    mockLoadSloper.mockResolvedValue(sloperFixture());
    mockCreateFromState.mockResolvedValue("m10");

    const res = await POST(post({ sloperId: "s1" }));

    expect(mockLoadSloper).toHaveBeenCalledWith("s1", "u1");
    const [userId, state] = mockCreateFromState.mock.calls[0];
    expect(userId).toBe("u1");
    expect(state.pattern.pieces.length).toBeGreaterThan(0);
    expect(state.pattern.version).toBe(1);
    expect(state.pattern.name).toBe("base blusa");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ id: "m10" });
  });

  it("404s for an unknown sloper and creates nothing", async () => {
    mockLoadSloper.mockResolvedValue(null);
    const res = await POST(post({ sloperId: "nope" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sloper_not_found");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateFromState).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
