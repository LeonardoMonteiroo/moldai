import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQueryRaw = vi.fn();
const mockPing = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) },
}));
vi.mock("@/lib/rate-limit/client", () => ({
  getRedis: () => ({ ping: mockPing }),
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockPing.mockReset();
  });

  it("200s with redis:ok when both dependencies are reachable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockPing.mockResolvedValue("PONG");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", redis: "ok" });
  });

  it("503s when Postgres is unreachable, without ever checking Redis", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: "error",
      postgres: "unreachable",
    });
    expect(mockPing).not.toHaveBeenCalled();
  });

  // #100: a Redis outage degrades rate limiting (consume() already fails
  // open) but does not mean the app can't serve requests -- flipping the
  // healthcheck unhealthy over it would make Docker restart a perfectly
  // functional container.
  it("still 200s when Redis is unreachable, reporting it in the body", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockPing.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      redis: "unreachable",
    });
  });
});
