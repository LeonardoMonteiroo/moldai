import { describe, it, expect, vi } from "vitest";
import { authorizeUser, type AuthorizeDeps } from "./authorize";
import type { UserRecord } from "./types";

const user: UserRecord = {
  id: "u1",
  email: "dev@moldai.local",
  passwordHash: "HASH",
  name: "Dev",
  emailVerified: new Date("2026-08-01T00:00:00.000Z"),
};

const unverified: UserRecord = { ...user, emailVerified: null };

function deps(over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    getUserByEmail: async (email) => (email === user.email ? user : null),
    verify: async (plain) => plain === "correct",
    consume: async () => ({ allowed: true }),
    reset: async () => {},
    ...over,
  };
}

const GOOD = { email: "dev@moldai.local", password: "correct", ip: "1.1.1.1" };

describe("authorizeUser", () => {
  it("valid verified credentials return the user without the passwordHash", async () => {
    const r = await authorizeUser(GOOD, deps());
    expect(r).toEqual({
      ok: true,
      user: { id: "u1", email: "dev@moldai.local", name: "Dev" },
    });
  });

  it("normalizes the email (trim + lowercase)", async () => {
    const r = await authorizeUser(
      { ...GOOD, email: "  DEV@MoldAI.local " },
      deps(),
    );
    expect(r).toEqual({
      ok: true,
      user: { id: "u1", email: "dev@moldai.local", name: "Dev" },
    });
  });

  it("wrong password is invalid", async () => {
    const r = await authorizeUser({ ...GOOD, password: "wrong" }, deps());
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("unknown email is invalid, never 'unverified'", async () => {
    const r = await authorizeUser({ ...GOOD, email: "x@y.z" }, deps());
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("missing or non-string fields are invalid without touching the repo", async () => {
    const getUserByEmail = vi.fn(async () => user);
    const d = deps({ getUserByEmail });
    expect(await authorizeUser({ email: 123, password: "correct" }, d)).toEqual(
      {
        ok: false,
        reason: "invalid",
      },
    );
    expect(await authorizeUser({ password: "correct" }, d)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await authorizeUser({ email: "dev@moldai.local" }, d)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("a correct password on an unverified account is 'unverified'", async () => {
    const r = await authorizeUser(
      GOOD,
      deps({ getUserByEmail: async () => unverified }),
    );
    expect(r).toEqual({ ok: false, reason: "unverified" });
  });

  it("a wrong password on an unverified account is still 'invalid'", async () => {
    const r = await authorizeUser(
      { ...GOOD, password: "wrong" },
      deps({ getUserByEmail: async () => unverified }),
    );
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("denies over the IP limit without ever hashing", async () => {
    const verify = vi.fn(async () => true);
    const getUserByEmail = vi.fn(async () => user);
    const r = await authorizeUser(
      GOOD,
      deps({
        verify,
        getUserByEmail,
        consume: async (bucket) => ({ allowed: bucket !== "login" }),
      }),
    );
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
    expect(verify).not.toHaveBeenCalled();
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("denies over the email limit without ever hashing", async () => {
    const verify = vi.fn(async () => true);
    const getUserByEmail = vi.fn(async () => user);
    const r = await authorizeUser(
      GOOD,
      deps({
        verify,
        getUserByEmail,
        consume: async (bucket) => ({ allowed: bucket !== "login_email" }),
      }),
    );
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
    expect(verify).not.toHaveBeenCalled();
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("consumes both buckets, keyed by ip and by normalized email", async () => {
    const consume = vi.fn(async () => ({ allowed: true }));
    await authorizeUser(
      { ...GOOD, email: "  DEV@MoldAI.local " },
      deps({ consume }),
    );
    expect(consume).toHaveBeenCalledWith("login", "1.1.1.1");
    expect(consume).toHaveBeenCalledWith("login_email", "dev@moldai.local");
  });

  it("resets the email counter once the password is correct", async () => {
    const reset = vi.fn(async () => {});
    await authorizeUser(GOOD, deps({ reset }));
    expect(reset).toHaveBeenCalledWith("login_email", "dev@moldai.local");
  });

  it("resets the email counter even when the account is unverified", async () => {
    const reset = vi.fn(async () => {});
    const r = await authorizeUser(
      GOOD,
      deps({ reset, getUserByEmail: async () => unverified }),
    );
    expect(r).toEqual({ ok: false, reason: "unverified" });
    expect(reset).toHaveBeenCalledWith("login_email", "dev@moldai.local");
  });

  it("does not reset the counter on a wrong password", async () => {
    const reset = vi.fn(async () => {});
    await authorizeUser({ ...GOOD, password: "wrong" }, deps({ reset }));
    expect(reset).not.toHaveBeenCalled();
  });

  it("falls back to the shared 'unknown' ip bucket when no ip is supplied", async () => {
    const consume = vi.fn(async () => ({ allowed: true }));
    await authorizeUser(
      { email: GOOD.email, password: GOOD.password },
      deps({ consume }),
    );
    expect(consume).toHaveBeenCalledWith("login", "unknown");
  });
});
