import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/account", () => ({
  isChecklistEvent: (value: unknown) =>
    value === "exported" || value === "imported",
  recordChecklistEvent: vi.fn(),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { recordChecklistEvent } from "@/lib/db/account";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/checklist-progress", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(recordChecklistEvent).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(recordChecklistEvent).mockResolvedValue(undefined);
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ event: "exported" }));
    expect(res.status).toBe(401);
    expect(recordChecklistEvent).not.toHaveBeenCalled();
  });

  it("records an 'exported' event", async () => {
    const res = await POST(req({ event: "exported" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(recordChecklistEvent).toHaveBeenCalledWith("u1", "exported");
  });

  it("records an 'imported' event", async () => {
    const res = await POST(req({ event: "imported" }));
    expect(res.status).toBe(200);
    expect(recordChecklistEvent).toHaveBeenCalledWith("u1", "imported");
  });

  it("rejects an unrecognised event", async () => {
    const res = await POST(req({ event: "invited" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_checklist_event",
    });
    expect(recordChecklistEvent).not.toHaveBeenCalled();
  });

  it("answers bad_body for a literal null body instead of throwing", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(recordChecklistEvent).not.toHaveBeenCalled();
  });
});
