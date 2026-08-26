import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
// A full replacement, like every sibling route test's @/lib/db/users mock
// (profile/password/route.test.ts) -- isWorkStyle is reimplemented rather
// than pulled in via vi.importActual, since a partial/actual-backed mock of
// this module conflicts with those simpler sibling mocks when the whole
// suite runs in one worker.
vi.mock("@/lib/db/users", () => ({
  isWorkStyle: (value: unknown) =>
    value === "patternmaker" || value === "brand" || value === "personal",
  stampOnboarded: vi.fn(),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { stampOnboarded } from "@/lib/db/users";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/onboarding", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(stampOnboarded).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: "Dev",
    });
    vi.mocked(stampOnboarded).mockResolvedValue(undefined);
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(stampOnboarded).not.toHaveBeenCalled();
  });

  it("stamps onboardedAt with no workStyle when the body is empty (skip)", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(stampOnboarded).toHaveBeenCalledWith("u1", undefined);
  });

  it("stamps onboardedAt exactly once per call, with a valid workStyle", async () => {
    const res = await POST(req({ workStyle: "brand" }));
    expect(res.status).toBe(200);
    expect(stampOnboarded).toHaveBeenCalledTimes(1);
    expect(stampOnboarded).toHaveBeenCalledWith("u1", "brand");
  });

  it("rejects a workStyle outside the closed list", async () => {
    const res = await POST(req({ workStyle: "hobbyist" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_work_style",
    });
    expect(stampOnboarded).not.toHaveBeenCalled();
  });

  it("rejects a non-string workStyle", async () => {
    const res = await POST(req({ workStyle: 42 }));
    expect(res.status).toBe(400);
    expect(stampOnboarded).not.toHaveBeenCalled();
  });

  it("answers bad_body for a literal null body instead of throwing", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(stampOnboarded).not.toHaveBeenCalled();
  });
});
