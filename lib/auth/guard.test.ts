import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/users", () => ({ getUserById: vi.fn() }));

import { requireUser } from "./guard";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";

// `auth` is one overload of NextAuth's exported function (also callable as
// middleware), which vi.mocked's overload resolution picks the wrong one
// for -- cast once here rather than at every call site.
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

const USER = {
  id: "u1",
  email: "novo@moldai.local",
  passwordHash: "HASH",
  name: "Novo",
  emailVerified: new Date(),
};

// #62: the JWT's session/jwt callbacks never re-check that the row still
// exists, so a deleted account's cookie kept authenticating on any other
// device or copy of the cookie -- requireUser() is the one place every
// app/api/* route (uniformly) passes through, so the existence check landed
// here rather than in auth.ts's session callback, which runs on every
// server render, not just requests that need the guard.
describe("requireUser", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    vi.mocked(getUserById).mockReset();
  });

  it("returns the session user when the account still exists", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", email: "novo@moldai.local", name: "Novo" },
    });
    vi.mocked(getUserById).mockResolvedValue(USER);

    const result = await requireUser();
    expect(result).toEqual({
      id: "u1",
      email: "novo@moldai.local",
      name: "Novo",
    });
    expect(getUserById).toHaveBeenCalledWith("u1");
  });

  it("401s without checking the account when there's no session at all", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireUser();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });

  // The exact bug: a valid, unexpired JWT for an account that has since
  // been deleted (a second device, or any surviving copy of the cookie).
  it("401s when the session is valid but the account was deleted", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "deleted-user", email: "gone@moldai.local", name: "Gone" },
    });
    vi.mocked(getUserById).mockResolvedValue(null);

    const result = await requireUser();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
    await expect((result as NextResponse).json()).resolves.toEqual({
      status: "unauthorized",
      error: "unauthorized",
    });
  });
});
