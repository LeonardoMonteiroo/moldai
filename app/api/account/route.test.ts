import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({ verifyPassword: vi.fn() }));

import { DELETE } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { getUserById, deleteUser } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/hash";

const user = {
  id: "u1",
  email: "dev@moldai.local",
  passwordHash: "HASH",
  name: "Dev",
  emailVerified: new Date(),
};

function req(body: unknown) {
  return new Request("http://test", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/account", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(deleteUser).mockReset();
    vi.mocked(verifyPassword).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: user.email,
      name: "Dev",
    });
    vi.mocked(getUserById).mockResolvedValue(user);
  });

  it("deletes the account on correct password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await DELETE(req({ password: "correct" }));
    expect(verifyPassword).toHaveBeenCalledWith("correct", "HASH");
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("deletes the account with no password when the account has none set", async () => {
    vi.mocked(getUserById).mockResolvedValue({ ...user, passwordHash: null });
    const res = await DELETE(req({}));
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("400s on wrong password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await DELETE(req({ password: "wrong" }));
    expect(res.status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await DELETE(req({ password: "correct" }));
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  // "null" parses fine, so it threw on body.password.
  it("400s on a literal null body without deleting anything", async () => {
    const res = await DELETE(req(null));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
