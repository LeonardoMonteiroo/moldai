import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PatternVersionRecord } from "@/lib/db/patternVersion";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/patternVersion", () => ({ listVersions: vi.fn() }));

import { GET } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { listVersions } from "@/lib/db/patternVersion";

function ctx(id = "m1") {
  return { params: Promise.resolve({ id }) };
}

const ROW: PatternVersionRecord = {
  id: "pv1",
  version: 1,
  spec: {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: {},
  },
  sizes: ["PP", "P", "M", "G", "GG"],
  baseSize: "M",
  sizeTable: { M: { bust: 92 } as never },
  sizeChartName: "Feminino adulto",
  engine: "moldai",
  reason: "generate",
  cost: 1,
  createdAt: "2026-08-17T12:00:00.000Z",
};

describe("GET /api/patterns/[id]/versions", () => {
  beforeEach(() => {
    vi.mocked(listVersions).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("returns the ownership-scoped list", async () => {
    vi.mocked(listVersions).mockResolvedValue([ROW]);
    const res = await GET(new Request("http://test"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([ROW]);
    expect(listVersions).toHaveBeenCalledWith("m1", "u1");
  });

  it("404s when the pattern isn't found/owned, without leaking which", async () => {
    vi.mocked(listVersions).mockResolvedValue(null);
    const res = await GET(new Request("http://test"), ctx("someone-elses"));
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
    expect(listVersions).not.toHaveBeenCalled();
  });
});
