import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/verification", () => ({ consumeToken: vi.fn() }));
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));

import { POST } from "./route";
import { consumeToken } from "@/lib/db/verification";
import { consume } from "@/lib/rate-limit/consume";
import { hashToken } from "@/lib/auth/verification";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/verify-email", () => {
  beforeEach(() => {
    vi.mocked(consumeToken).mockReset();
    vi.mocked(consume).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(consumeToken).mockResolvedValue({ ok: true, userId: "u1" });
  });

  it("confirms the address and returns ok", async () => {
    const res = await POST(req({ token: "raw-token" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("mints no session -- proof of email ownership is not proof of password", async () => {
    const res = await POST(req({ token: "raw-token" }));
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("looks the token up by its digest, never by the raw value", async () => {
    await POST(req({ token: "raw-token" }));
    expect(consumeToken).toHaveBeenCalledWith(
      hashToken("raw-token"),
      expect.any(Date),
    );
  });

  it("400s with expired_token so the user knows to request a new link", async () => {
    vi.mocked(consumeToken).mockResolvedValue({
      ok: false,
      reason: "expired",
    });
    const res = await POST(req({ token: "raw-token" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "expired_token",
    });
  });

  it("400s with invalid_token on an unknown token", async () => {
    vi.mocked(consumeToken).mockResolvedValue({
      ok: false,
      reason: "invalid",
    });
    const res = await POST(req({ token: "nope" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_token",
    });
  });

  it("400s with invalid_token on a missing or non-string token", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_token",
    });
    expect(consumeToken).not.toHaveBeenCalled();
  });

  it("400s with bad_body on unparseable JSON", async () => {
    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
  });

  it("400s with bad_body on a null JSON body", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
  });

  it("429s when the verify bucket is exhausted", async () => {
    vi.mocked(consume).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const res = await POST(req({ token: "raw-token" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(consumeToken).not.toHaveBeenCalled();
  });
});
