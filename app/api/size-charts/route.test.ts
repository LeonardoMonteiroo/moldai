import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/sizeChart", () => ({
  listSizeChartsForUser: vi.fn(),
  getActiveSizeChartId: vi.fn(),
  createSizeChart: vi.fn(),
}));
// route.ts passes this straight through to the (mocked) db functions above
// as their `tx` argument — see #67's comment in lib/db/sizeChart.ts.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));

import { GET, POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import {
  listSizeChartsForUser,
  getActiveSizeChartId,
  createSizeChart,
} from "@/lib/db/sizeChart";
import { consume } from "@/lib/rate-limit/consume";

function req(body?: unknown) {
  return new Request("http://test/api/size-charts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/size-charts", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("marks the account's active chart in the returned list", async () => {
    vi.mocked(listSizeChartsForUser).mockResolvedValue([
      { id: "g1", name: "A" } as never,
      { id: "g2", name: "B" } as never,
    ]);
    vi.mocked(getActiveSizeChartId).mockResolvedValue("g2");
    const res = await GET();
    const json = await res.json();
    expect(json.find((c: { id: string }) => c.id === "g1").isActive).toBe(
      false,
    );
    expect(json.find((c: { id: string }) => c.id === "g2").isActive).toBe(true);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/size-charts", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(createSizeChart).mockReset();
    vi.mocked(consume).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  });

  // #101: same guard as POST /api/patterns -- duplicating a chart had no bucket.
  it("429s when the account's create bucket is exhausted, creating nothing", async () => {
    vi.mocked(consume).mockResolvedValue({
      allowed: false,
      retryAfterSec: 30,
    });
    const res = await POST(req({}));
    expect(consume).toHaveBeenCalledWith("create", "u1");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(createSizeChart).not.toHaveBeenCalled();
  });

  it("creates a chart, forwarding an optional sourceId", async () => {
    vi.mocked(createSizeChart).mockResolvedValue({ id: "g3" } as never);
    const res = await POST(req({ sourceId: "g1" }));
    expect(createSizeChart).toHaveBeenCalledWith(
      "u1",
      expect.any(Function),
      "g1",
    );
    expect((await res.json()).id).toBe("g3");
  });

  it("creates a chart with no sourceId when the body is empty", async () => {
    vi.mocked(createSizeChart).mockResolvedValue({ id: "g4" } as never);
    await POST(req({}));
    expect(createSizeChart).toHaveBeenCalledWith(
      "u1",
      expect.any(Function),
      undefined,
    );
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  // This route deliberately tolerates an unusable body (it just means "no
  // sourceId", i.e. a blank chart) -- but "null" used to reach body.sourceId
  // and throw a 500 rather than being tolerated like a malformed body was.
  it("treats a literal null body as no sourceId rather than throwing", async () => {
    vi.mocked(createSizeChart).mockResolvedValue({ id: "g5" } as never);
    const res = await POST(req(null));
    expect(res.status).toBe(200);
    expect(createSizeChart).toHaveBeenCalledWith(
      "u1",
      expect.any(Function),
      undefined,
    );
  });

  // #64: an explicit-but-unresolved sourceId used to silently substitute the
  // system chart (200) instead of 404ing -- only the bodyless/no-sourceId
  // path may fall back.
  it("404s when an explicit sourceId doesn't resolve", async () => {
    vi.mocked(createSizeChart).mockResolvedValue(null);
    const res = await POST(req({ sourceId: "does-not-exist" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("size_chart_not_found");
  });
});
