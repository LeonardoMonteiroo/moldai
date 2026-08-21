import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getUserById: vi.fn(),
  updateUserPasswordHash: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { getUserById, updateUserPasswordHash } from "@/lib/db/users";
import { verifyPassword, hashPassword } from "@/lib/auth/hash";

const user = {
  id: "u1",
  email: "dev@moldai.local",
  passwordHash: "HASH",
  name: "Dev",
  emailVerified: new Date(),
};

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/password", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(updateUserPasswordHash).mockReset();
    vi.mocked(verifyPassword).mockReset();
    vi.mocked(hashPassword).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: user.email,
      name: "Dev",
    });
    vi.mocked(getUserById).mockResolvedValue(user);
  });

  it("changes the password on correct current + valid new password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(hashPassword).mockResolvedValue("NEW_HASH");
    const res = await POST(
      req({ currentPassword: "correct", newPassword: "newpassword1" }),
    );
    expect(verifyPassword).toHaveBeenCalledWith("correct", "HASH");
    expect(updateUserPasswordHash).toHaveBeenCalledWith("u1", "NEW_HASH");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("400s on wrong current password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await POST(
      req({ currentPassword: "wrong", newPassword: "newpassword1" }),
    );
    expect(res.status).toBe(400);
    expect(updateUserPasswordHash).not.toHaveBeenCalled();
  });

  it("400s on a too-short new password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await POST(
      req({ currentPassword: "correct", newPassword: "short" }),
    );
    expect(res.status).toBe(400);
    expect(updateUserPasswordHash).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(
      req({ currentPassword: "correct", newPassword: "newpassword1" }),
    );
    expect(res.status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });

  // "null" parses fine, so it threw on body.currentPassword.
  it("400s on a literal null body without loading the user", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
    expect(getUserById).not.toHaveBeenCalled();
  });
});
