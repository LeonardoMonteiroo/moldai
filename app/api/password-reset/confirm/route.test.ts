import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/passwordReset", () => ({ consumeResetToken: vi.fn() }));
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));
vi.mock("@/lib/auth/hash", () => ({ hashPassword: vi.fn() }));

import { POST } from "./route";
import { consumeResetToken } from "@/lib/db/passwordReset";
import { consume } from "@/lib/rate-limit/consume";
import { hashPassword } from "@/lib/auth/hash";
import { hashToken } from "@/lib/auth/verification";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID = { token: "raw-token", newPassword: "newpassword1" };

describe("POST /api/password-reset/confirm", () => {
  beforeEach(() => {
    vi.mocked(consumeResetToken).mockReset();
    vi.mocked(consume).mockReset();
    vi.mocked(hashPassword).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(hashPassword).mockResolvedValue("HASHED(newpassword1)");
    vi.mocked(consumeResetToken).mockResolvedValue({ ok: true, userId: "u1" });
  });

  it("changes the password and returns ok", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("mints no session -- proof of a mailbox is not proof of who is at the keyboard", async () => {
    const res = await POST(req(VALID));
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("hashes the new password and consumes the token by its digest", async () => {
    await POST(req(VALID));
    expect(hashPassword).toHaveBeenCalledWith("newpassword1");
    expect(consumeResetToken).toHaveBeenCalledWith(
      hashToken("raw-token"),
      "HASHED(newpassword1)",
      expect.any(Date),
    );
  });

  it("400s with weak_password and never touches the token store", async () => {
    const res = await POST(req({ token: "raw-token", newPassword: "short" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "weak_password",
    });
    expect(consumeResetToken).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("400s with invalid_token on a missing or non-string token, without hashing", async () => {
    const res = await POST(req({ newPassword: "newpassword1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_token",
    });
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("400s with expired_token so the user knows to request a new link", async () => {
    vi.mocked(consumeResetToken).mockResolvedValue({
      ok: false,
      reason: "expired",
    });
    const res = await POST(req(VALID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "expired_token",
    });
  });

  it("400s with invalid_token on an unknown token", async () => {
    vi.mocked(consumeResetToken).mockResolvedValue({
      ok: false,
      reason: "invalid",
    });
    const res = await POST(req(VALID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_token",
    });
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

  it("429s when the password_reset_confirm bucket is exhausted, before touching the repo", async () => {
    vi.mocked(consume).mockResolvedValue({ allowed: false, retryAfterSec: 45 });
    const res = await POST(req(VALID));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    expect(consumeResetToken).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });
});
